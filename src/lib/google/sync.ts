// Brings a brand's Google figures in for its named pieces: Search Console by page address, Analytics by page and by
// SKU, Merchant Center by SKU. Only Nomen's own pieces are kept. A source that fails doesn't stop the others; the
// connection keeps the last problem in plain words.
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import type { PieceFeed } from "../feed/shared";
import { decryptToken } from "./crypto";
import { accessToken } from "./oauth";
import { LiveGoogleData, MockGoogleData, normaliseUrl, pathOf, type Day, type GoogleData } from "./data";

/** A connection made in the preview version: example figures, no Google account involved. */
export const EXAMPLE_TOKEN = "example";
const SYNC_DAYS_FIRST = 120; // enough for a 28-day before window on pieces renamed up to three months ago
const SYNC_OVERLAP_DAYS = 10; // Google revises recent days, so they're read again
const QUERY_PAGES_PER_SYNC = 40;

export type LinkedPiece = { id: string; brandId: string; url: string | null; liveSince: Date | null; skus: string[] };

/** The brand's named pieces that can be matched to Google's figures: by their live page, or by their SKUs. */
export async function linkedPieces(brandId: string): Promise<LinkedPiece[]> {
  const rows = await db.generation.findMany({
    where: { brandId, status: "completed", OR: [{ liveUrl: { not: null } }, { batchItem: { is: { feed: { not: Prisma.DbNull } } } }] },
    select: { id: true, brandId: true, liveUrl: true, liveSince: true, batchItem: { select: { feed: true } } },
  });
  return rows.map((g) => ({
    id: g.id, brandId: g.brandId, url: g.liveUrl ? normaliseUrl(g.liveUrl) : null, liveSince: g.liveSince,
    skus: [...new Set(((g.batchItem?.feed as PieceFeed | null)?.rows ?? []).map((r) => r.attrs.id).filter((x): x is string => !!x))],
  })).filter((p) => p.url || p.skus.length);
}

/** The Google reader for a brand's connection (example figures for a preview-version connection). */
export async function googleDataFor(brandId: string): Promise<{ data: GoogleData; conn: NonNullable<Awaited<ReturnType<typeof db.googleConnection.findUnique>>> } | null> {
  const conn = await db.googleConnection.findUnique({ where: { brandId } });
  if (!conn) return null;
  if (conn.refreshToken === EXAMPLE_TOKEN || env().PROVIDER_MODE === "mock") {
    const pieces = await linkedPieces(brandId);
    return { conn, data: new MockGoogleData(new Map(pieces.filter((p) => p.url).map((p) => [p.url!, p.liveSince]))) };
  }
  const refresh = decryptToken(conn.refreshToken);
  return { conn, data: new LiveGoogleData(() => accessToken(refresh)) };
}

const iso = (d: Date): Day => d.toISOString().slice(0, 10);
const dateOf = (d: Day) => new Date(`${d}T00:00:00Z`);

type Agg = { impressions: number; clicks: number; posWeighted: number; views: number; sessions: number; addToCarts: number; purchases: number; revenue: number };
const zero = (): Agg => ({ impressions: 0, clicks: 0, posWeighted: 0, views: 0, sessions: 0, addToCarts: 0, purchases: 0, revenue: 0 });

/** Replace a source's rows for these pieces over the period with the fresh figures. */
async function store(brandId: string, source: string, start: Day, end: Day, byKey: Map<string, Agg>, pieceIds: string[]) {
  const rows: Prisma.PageMetricCreateManyInput[] = [...byKey].map(([k, a]) => {
    const [generationId, d] = k.split("|");
    return { brandId, generationId, date: dateOf(d), source, impressions: a.impressions, clicks: a.clicks, position: a.impressions ? a.posWeighted / a.impressions : null, views: a.views, sessions: a.sessions, addToCarts: a.addToCarts, purchases: a.purchases, revenue: Math.round(a.revenue * 100) / 100 };
  });
  await db.$transaction([
    db.pageMetric.deleteMany({ where: { source, generationId: { in: pieceIds }, date: { gte: dateOf(start), lte: dateOf(end) } } }),
    db.pageMetric.createMany({ data: rows }),
  ]);
  return rows.length;
}

export async function syncBrand(brandId: string, opts: { now?: Date } = {}): Promise<{ pieces: number; rows: number; queries: number; statuses: number; problems: string[] }> {
  const g = await googleDataFor(brandId);
  if (!g) return { pieces: 0, rows: 0, queries: 0, statuses: 0, problems: ["Google isn't connected."] };
  const { data, conn } = g;
  const pieces = await linkedPieces(brandId);
  const now = opts.now ?? new Date();
  const end = iso(new Date(now.getTime() - 86_400_000)); // yesterday: today's figures aren't in yet
  const from = conn.lastSyncAt ? new Date(conn.lastSyncAt.getTime() - SYNC_OVERLAP_DAYS * 86_400_000) : new Date(now.getTime() - SYNC_DAYS_FIRST * 86_400_000);
  const start = iso(from);
  const ids = pieces.map((p) => p.id);
  const byUrl = new Map(pieces.filter((p) => p.url).map((p) => [p.url!, p]));
  const byPath = new Map(pieces.filter((p) => p.url).map((p) => [pathOf(p.url!), p]));
  const bySku = new Map(pieces.flatMap((p) => p.skus.map((s) => [s, p] as const)));
  const problems: string[] = [];
  let rows = 0, queries = 0, statuses = 0;
  const add = (m: Map<string, Agg>, pieceId: string, d: Day, f: (a: Agg) => void) => { const k = `${pieceId}|${d}`; const a = m.get(k) ?? zero(); f(a); m.set(k, a); };

  if (conn.searchConsoleSite && byUrl.size) {
    try {
      const m = new Map<string, Agg>();
      for (const r of await data.searchPages(conn.searchConsoleSite, start, end)) {
        const p = byUrl.get(normaliseUrl(r.url));
        if (p) add(m, p.id, r.date, (a) => { a.impressions += r.impressions; a.clicks += r.clicks; a.posWeighted += (r.position ?? 0) * r.impressions; });
      }
      rows += await store(brandId, "search_console", start, end, m, ids);
      // The searches each page shows up for, a few pages per sync (least recently read first).
      const done = new Map((await db.pageQuery.groupBy({ by: ["generationId"], where: { generationId: { in: ids } }, _max: { syncedAt: true } })).map((x) => [x.generationId, x._max.syncedAt?.getTime() ?? 0]));
      const due = pieces.filter((p) => p.url).sort((a, b) => (done.get(a.id) ?? 0) - (done.get(b.id) ?? 0)).slice(0, QUERY_PAGES_PER_SYNC);
      const qStart = iso(new Date(now.getTime() - 29 * 86_400_000));
      for (const p of due) {
        const qs = await data.searchQueries(conn.searchConsoleSite, p.url!, qStart, end);
        await db.$transaction([db.pageQuery.deleteMany({ where: { generationId: p.id } }), db.pageQuery.createMany({ data: qs.map((q) => ({ generationId: p.id, query: q.query.slice(0, 200), impressions: q.impressions, clicks: q.clicks, position: q.position })) })]);
        queries += qs.length;
      }
    } catch (e) { problems.push(`Search Console: ${e instanceof Error ? e.message : "didn't answer"}`); }
  }

  if (conn.analyticsProperty && (byPath.size || bySku.size)) {
    try {
      const m = new Map<string, Agg>();
      for (const r of await data.analyticsPaths(conn.analyticsProperty, [...byPath.keys()], start, end)) {
        const p = byPath.get(r.path);
        if (p) add(m, p.id, r.date, (a) => { a.views += r.views; a.sessions += r.sessions; });
      }
      const hasPageViews = new Set([...m.keys()].map((k) => k.split("|")[0]));
      for (const r of await data.analyticsItems(conn.analyticsProperty, [...bySku.keys()], start, end)) {
        const p = bySku.get(r.itemId);
        if (p) add(m, p.id, r.date, (a) => { a.addToCarts += r.addToCarts; a.purchases += r.purchases; a.revenue += r.revenue; if (!hasPageViews.has(p.id)) a.views += r.views; });
      }
      rows += await store(brandId, "analytics", start, end, m, ids);
    } catch (e) { problems.push(`Analytics: ${e instanceof Error ? e.message : "didn't answer"}`); }
  }

  if (conn.merchantAccount && bySku.size) {
    try {
      const m = new Map<string, Agg>();
      for (const r of await data.merchantPerformance(conn.merchantAccount, start, end)) {
        const p = bySku.get(r.offerId);
        if (p) add(m, p.id, r.date, (a) => { a.impressions += r.impressions; a.clicks += r.clicks; });
      }
      rows += await store(brandId, "merchant", start, end, m, ids);
      // Shopping's verdict per piece, from all its SKUs: disapproved if any is, with every issue once.
      const per = new Map<string, { approved: boolean; disapproved: boolean; pending: boolean; issues: Map<string, { severity: string; description: string; attribute: string | null }> }>();
      for (const s of await data.merchantStatuses(conn.merchantAccount)) {
        const p = bySku.get(s.offerId);
        if (!p) continue;
        const v = per.get(p.id) ?? { approved: false, disapproved: false, pending: false, issues: new Map() };
        v.approved ||= s.approved; v.disapproved ||= s.disapproved; v.pending ||= s.pending;
        for (const i of s.issues) v.issues.set(i.description, i);
        per.set(p.id, v);
      }
      for (const [generationId, v] of per) {
        const status = v.disapproved && v.approved ? "partly approved" : v.disapproved ? "disapproved" : v.approved ? "approved" : "pending";
        const issues = [...v.issues.values()].slice(0, 10) as unknown as Prisma.InputJsonValue;
        await db.merchantStatus.upsert({ where: { generationId }, create: { generationId, status, issues }, update: { status, issues, syncedAt: new Date() } });
        statuses++;
      }
    } catch (e) { problems.push(`Merchant Center: ${e instanceof Error ? e.message : "didn't answer"}`); }
  }

  await db.googleConnection.update({ where: { brandId }, data: { lastSyncAt: now, lastSyncError: problems.length ? problems.join(" ").slice(0, 500) : null } });
  return { pieces: pieces.length, rows, queries, statuses, problems };
}

/** Sync in the background when the last one was over 20 hours ago (opening the dashboard is what keeps figures fresh). */
export async function syncIfStale(brandId: string): Promise<void> {
  const conn = await db.googleConnection.findUnique({ where: { brandId }, select: { lastSyncAt: true, searchConsoleSite: true, analyticsProperty: true, merchantAccount: true } });
  if (!conn || !(conn.searchConsoleSite || conn.analyticsProperty || conn.merchantAccount)) return;
  if (conn.lastSyncAt && Date.now() - conn.lastSyncAt.getTime() < 20 * 3600_000) return;
  void syncBrand(brandId).catch((e) => console.error("google sync failed", brandId, e instanceof Error ? e.message : e));
}
