// What happened in Google after pieces were named: search and shop figures, a before-and-after for each renamed
// piece that allows for season and market (the brand's other pages, or Google's search history), suggestions, and
// which name styles get clicked more once there's enough to say. Never credits Nomen with every change.
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { classify, OCCASIONS, singular } from "../vocab/fashion";
import { seasonProfile, type MonthlyPoint } from "../keywords/seasonal";
import type { PieceFeed } from "../feed/shared";
import { categoryLabel } from "./dashboard";

export const BEFORE_AFTER_DAYS = 28;
const MIN_AFTER_DAYS = 7;
const MIN_IMPRESSIONS = 100;

type Piece = { id: string; brandId: string; name: string; category: string; liveSince: Date | null; previousTitle: string | null; primary: string | null; onSale: boolean };
export type Totals = { impressions: number; clicks: number; ctr: number | null; position: number | null; views: number; sessions: number; addToCarts: number; purchases: number; revenue: number; conversion: number | null; shopImpressions: number; shopClicks: number };
type Row = { generationId: string; date: Date; source: string; impressions: number; clicks: number; position: number | null; views: number; sessions: number; addToCarts: number; purchases: number; revenue: number };

const DAY = 86_400_000;
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 -]+/g, " ").split(/[\s-]+/).filter(Boolean);

export function sumRows(rows: Row[]): Totals {
  const t = { impressions: 0, clicks: 0, posW: 0, views: 0, sessions: 0, addToCarts: 0, purchases: 0, revenue: 0, shopImpressions: 0, shopClicks: 0 };
  for (const r of rows) {
    if (r.source === "search_console") { t.impressions += r.impressions; t.clicks += r.clicks; t.posW += (r.position ?? 0) * r.impressions; }
    else if (r.source === "analytics") { t.views += r.views; t.sessions += r.sessions; t.addToCarts += r.addToCarts; t.purchases += r.purchases; t.revenue += r.revenue; }
    else if (r.source === "merchant") { t.shopImpressions += r.impressions; t.shopClicks += r.clicks; }
  }
  return {
    impressions: t.impressions, clicks: t.clicks, ctr: t.impressions ? t.clicks / t.impressions : null, position: t.impressions ? t.posW / t.impressions : null,
    views: t.views, sessions: t.sessions, addToCarts: t.addToCarts, purchases: t.purchases, revenue: Math.round(t.revenue * 100) / 100,
    conversion: t.sessions ? t.purchases / t.sessions : null, shopImpressions: t.shopImpressions, shopClicks: t.shopClicks,
  };
}

export type BeforeAfter = {
  id: string; name: string; previousTitle: string | null; liveSince: Date; days: number; before: Totals; after: Totals;
  /** What the after period would likely have looked like anyway, from the method named. null: no fair comparison. */
  expected: { impressions: number; clicks: number } | null; method: "other pages" | "season" | null; notes: string[];
};
export type Suggestion = { kind: "low_ctr" | "losing" | "missing_phrase" | "strong" | "shopping"; id: string; name: string; text: string };

export async function performanceData(f: { brandIds: string[] | null; from: Date; category: string; includeTests: boolean; now?: Date }) {
  const now = f.now ?? new Date();
  const brandSql = f.brandIds ? Prisma.sql`AND g."brandId" IN (${Prisma.join(f.brandIds)})` : Prisma.empty;
  const testSql = f.includeTests ? Prisma.empty : Prisma.sql`AND NOT g."isTest" AND NOT COALESCE(b."isTest", false)`;
  const raw = await db.$queryRaw<{ id: string; brandId: string; name: string | null; productType: string | null; liveSince: Date | null; previousTitle: string | null; primary: string | null; feed: unknown }[]>`
    SELECT g.id, g."brandId", g.result->'recommendation'->>'recommended_title' AS name, COALESCE(g."originalInput"->>'productType', g."extractedFacts"->>'product_type') AS "productType",
      g."liveSince", g."previousTitle", g.result->'recommendation'->>'primary_keyword' AS primary, bi.feed
    FROM "Generation" g LEFT JOIN "BatchItem" bi ON bi."generationId" = g.id LEFT JOIN "Batch" b ON b.id = bi."batchId"
    WHERE g.status = 'completed' AND EXISTS (SELECT 1 FROM "PageMetric" m WHERE m."generationId" = g.id) ${brandSql} ${testSql}`;
  const all: Piece[] = raw.filter((r) => r.name).map((r) => ({
    id: r.id, brandId: r.brandId, name: r.name!, category: categoryLabel(r.productType), liveSince: r.liveSince, previousTitle: r.previousTitle, primary: r.primary,
    onSale: ((r.feed as PieceFeed | null)?.rows ?? []).some((x) => x.attrs.sale_price),
  }));
  const pieces = all.filter((p) => f.category === "all" || p.category === f.category);
  const ids = pieces.map((p) => p.id);
  const metrics = (all.length ? await db.pageMetric.findMany({ where: { generationId: { in: all.map((p) => p.id) } }, select: { generationId: true, date: true, source: true, impressions: true, clicks: true, position: true, views: true, sessions: true, addToCarts: true, purchases: true, revenue: true } }) : []) as Row[];
  const byPiece = new Map<string, Row[]>();
  for (const m of metrics) byPiece.set(m.generationId, [...(byPiece.get(m.generationId) ?? []), m]);
  const inRange = (rows: Row[], a: Date, b: Date) => rows.filter((r) => r.date >= a && r.date < b);
  const lastData = metrics.reduce((d, m) => (m.date > d ? m.date : d), new Date(0));

  // Totals and leading pieces over the period.
  const periodRows = metrics.filter((m) => ids.includes(m.generationId) && m.date >= f.from);
  const totals = sumRows(periodRows);
  const perPiece = pieces.map((p) => ({ id: p.id, name: p.name, ...sumRows(inRange(byPiece.get(p.id) ?? [], f.from, new Date(now.getTime() + DAY))) }));
  const top = [...perPiece].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 10);

  // Before and after, for pieces whose new name has been live at least a week.
  const beforeAfter: BeforeAfter[] = [];
  for (const p of pieces) {
    if (!p.liveSince) continue;
    const L = new Date(Date.UTC(p.liveSince.getUTCFullYear(), p.liveSince.getUTCMonth(), p.liveSince.getUTCDate()));
    const afterEnd = new Date(Math.min(L.getTime() + BEFORE_AFTER_DAYS * DAY, lastData.getTime() + DAY));
    const days = Math.round((afterEnd.getTime() - L.getTime()) / DAY);
    if (days < MIN_AFTER_DAYS) continue;
    const beforeStart = new Date(L.getTime() - days * DAY);
    const rows = byPiece.get(p.id) ?? [];
    const before = sumRows(inRange(rows, beforeStart, L)), after = sumRows(inRange(rows, L, afterEnd));
    if (!before.impressions && !before.views) continue; // nothing to compare against
    // Market and season: how the brand's other pages of the same kind, not renamed in this time, changed.
    const control = all.filter((o) => o.id !== p.id && o.brandId === p.brandId && o.category === p.category && !(o.liveSince && o.liveSince >= beforeStart && o.liveSince < afterEnd));
    const cb = sumRows(control.flatMap((o) => inRange(byPiece.get(o.id) ?? [], beforeStart, L)));
    const ca = sumRows(control.flatMap((o) => inRange(byPiece.get(o.id) ?? [], L, afterEnd)));
    let expected: BeforeAfter["expected"] = null, method: BeforeAfter["method"] = null;
    if (control.length >= 3 && cb.impressions >= 50) {
      const ri = ca.impressions / cb.impressions, rc = cb.clicks ? ca.clicks / cb.clicks : ri;
      expected = { impressions: Math.round(before.impressions * ri), clicks: Math.round(before.clicks * rc) }; method = "other pages";
    } else if (p.primary) {
      // Google's search history for the piece's main phrase: how much busier the after months usually are.
      const hit = await db.serpCache.findFirst({ where: { cacheKey: { endsWith: `:labs-volume:${p.primary.toLowerCase()}` } }, select: { reducedResponse: true } });
      const prof = seasonProfile((hit?.reducedResponse as { monthly?: MonthlyPoint[] } | null)?.monthly);
      if (prof) {
        const avg = (a: Date, b: Date) => { const ms: number[] = []; for (let d = a.getTime(); d < b.getTime(); d += DAY) ms.push(prof.byMonth[new Date(d).getUTCMonth()]); return ms.reduce((x, y) => x + y, 0) / Math.max(1, ms.length); };
        const r = avg(L, afterEnd) / Math.max(1, avg(beforeStart, L));
        expected = { impressions: Math.round(before.impressions * r), clicks: Math.round(before.clicks * r) }; method = "season";
      }
    }
    const notes: string[] = [];
    if (days < 21) notes.push(`Only ${days} days since the new name went live: early days.`);
    if (p.onSale) notes.push("Its product file had a sale price, so a promotion may have played a part.");
    if (!method) notes.push("No fair comparison yet (fewer than three similar pages, and no search history for its main phrase), so the change can't be put down to the name.");
    beforeAfter.push({ id: p.id, name: p.name, previousTitle: p.previousTitle, liveSince: L, days, before, after, expected, method, notes });
  }

  // Suggestions from the last 28 days against the 28 before.
  const t1 = new Date(Math.min(now.getTime(), lastData.getTime() + DAY)), t0 = new Date(t1.getTime() - 28 * DAY), tm = new Date(t0.getTime() - 28 * DAY);
  const recent = pieces.map((p) => ({ p, cur: sumRows(inRange(byPiece.get(p.id) ?? [], t0, t1)), prev: sumRows(inRange(byPiece.get(p.id) ?? [], tm, t0)) }));
  const seen = recent.filter((r) => r.cur.impressions >= MIN_IMPRESSIONS);
  const ctrs = seen.map((r) => r.cur.ctr!).sort((a, b) => a - b);
  const median = ctrs.length >= 5 ? ctrs[Math.floor(ctrs.length / 2)] : null;
  const suggestions: Suggestion[] = [];
  for (const r of recent) {
    const { p, cur, prev } = r;
    if (cur.impressions >= MIN_IMPRESSIONS && cur.ctr != null && (median != null ? cur.ctr < median / 2 : cur.ctr < 0.01))
      suggestions.push({ kind: "low_ctr", id: p.id, name: p.name, text: `Seen ${cur.impressions.toLocaleString("en-AU")} times in Google but clicked ${cur.clicks} times (${(cur.ctr * 100).toFixed(1)}%${median != null ? `, against ${(median * 100).toFixed(1)}% for your other pages` : ""}). A clearer name could earn more clicks.` });
    if (prev.impressions >= MIN_IMPRESSIONS && cur.impressions < prev.impressions * 0.7)
      suggestions.push({ kind: "losing", id: p.id, name: p.name, text: `Shown in Google ${Math.round((1 - cur.impressions / prev.impressions) * 100)}% less than the 28 days before (${prev.impressions.toLocaleString("en-AU")} to ${cur.impressions.toLocaleString("en-AU")}). Check it's in stock and its page still works, then whether the season has turned.` });
    if (median != null && cur.impressions >= MIN_IMPRESSIONS && cur.ctr! >= median * 1.5)
      suggestions.push({ kind: "strong", id: p.id, name: p.name, text: `Clicked ${(cur.ctr! * 100).toFixed(1)}% of the times it's seen, well above your other pages. Worth copying how it's named.` });
  }
  // Searches a page shows up for that its name doesn't say (details only: never another brand's name).
  const qs = ids.length ? await db.pageQuery.findMany({ where: { generationId: { in: ids }, impressions: { gte: 20 } }, orderBy: { impressions: "desc" } }) : [];
  const occasionWords = new Set(OCCASIONS.map(singular));
  for (const p of pieces) {
    const nameWords = new Set(words(p.name).map(singular));
    const missing = new Map<string, { query: string; impressions: number }>();
    for (const q of qs.filter((x) => x.generationId === p.id)) for (const w of words(q.query).map(singular)) {
      const c = classify(w);
      if ((c && c !== "colour") || occasionWords.has(w)) if (!nameWords.has(w) && !missing.has(w)) missing.set(w, { query: q.query, impressions: q.impressions });
    }
    const [first] = [...missing];
    if (first) suggestions.push({ kind: "missing_phrase", id: p.id, name: p.name, text: `Shows up in Google for "${first[1].query}" (${first[1].impressions} times in 28 days), but the name doesn't say "${first[0]}". Add it only if it's true of the piece.` });
  }
  const shop = ids.length ? await db.merchantStatus.findMany({ where: { generationId: { in: ids }, status: { in: ["disapproved", "partly approved"] } } }) : [];
  for (const s of shop) {
    const p = pieces.find((x) => x.id === s.generationId)!;
    const issue = ((s.issues as { description?: string }[]) ?? [])[0]?.description;
    suggestions.push({ kind: "shopping", id: p.id, name: p.name, text: `Google Shopping: ${s.status}${issue ? ` (${issue})` : ""}.` });
  }

  // Which name styles get clicked more: only with at least 30 pieces seen 100+ times in the last 90 days.
  const ninety = new Date(t1.getTime() - 90 * DAY);
  const learned = pieces.map((p) => ({ p, t: sumRows(inRange(byPiece.get(p.id) ?? [], ninety, t1)) })).filter((x) => x.t.impressions >= MIN_IMPRESSIONS);
  const group = (label: string, xs: typeof learned) => { const imp = xs.reduce((s, x) => s + x.t.impressions, 0), clk = xs.reduce((s, x) => s + x.t.clicks, 0); return { label, n: xs.length, ctr: imp ? clk / imp : null }; };
  const leadsWithColour = (n: string) => classify(words(n)[0] ?? "") === "colour";
  const hasMaterial = (n: string) => words(n).some((w) => classify(w) === "material");
  const groups = learned.length >= 30 ? [
    [group("Names that start with the colour", learned.filter((x) => leadsWithColour(x.p.name))), group("Names that don't", learned.filter((x) => !leadsWithColour(x.p.name)))],
    [group("Up to 30 characters", learned.filter((x) => x.p.name.length <= 30)), group("31 to 45 characters", learned.filter((x) => x.p.name.length > 30 && x.p.name.length <= 45)), group("Over 45 characters", learned.filter((x) => x.p.name.length > 45))],
    [group("Names that say the material", learned.filter((x) => hasMaterial(x.p.name))), group("Names that don't", learned.filter((x) => !hasMaterial(x.p.name)))],
  ].map((g) => g.filter((x) => x.n >= 5)).filter((g) => g.length >= 2) : [];

  return { pieces: pieces.length, totals, top, beforeAfter: beforeAfter.sort((a, b) => b.liveSince.getTime() - a.liveSince.getTime()), suggestions: suggestions.slice(0, 15), learning: { seen: learned.length, needed: 30, groups } };
}
export type Performance = Awaited<ReturnType<typeof performanceData>>;
