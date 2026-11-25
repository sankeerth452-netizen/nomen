// What the dashboard shows: work done, quality from live use, the checked test set (kept apart and labelled), and
// spend. Every number comes from stored records; nothing is estimated. Tests (ranges or pieces marked as tests) are
// left out unless asked for.
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { categoryForType } from "../vocab/fashion";
import { KIND_RULES, kindOf } from "../category/rules";
import { FIELD } from "../review/fields";
import { OP_LABEL, type UsageOp } from "../usage/ledger";
import readiness from "../../../evals/naming/readiness.json";

export const PERIODS = { "7d": 7, "30d": 30, "90d": 90, all: null } as const;
export type Period = keyof typeof PERIODS;
export type DashboardFilter = { brandIds: string[] | null; period: Period; category: string; includeTests: boolean };

/** The category a piece is counted under: its kind (Shoes, Swimwear...), or for clothing its type (Dresses, Tops...). */
export function categoryLabel(productType: string | null | undefined): string {
  const kind = kindOf(productType);
  if (kind !== "apparel") return KIND_RULES[kind].label;
  return categoryForType(productType ?? null) ?? "Other clothing";
}

type GenRow = {
  id: string; brandId: string; status: string; confidence: string | null; durationMs: number | null; createdAt: Date; productType: string | null;
  name: string | null; pageStatus: string | null; dataStatus: string | null; photos: unknown; isTest: boolean;
};

const since = (p: Period) => (PERIODS[p] ? new Date(Date.now() - PERIODS[p]! * 86_400_000) : new Date(0));
const share = (n: number, of: number) => (of ? n / of : null);
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export async function dashboardData(f: DashboardFilter) {
  const from = since(f.period);
  const brandSql = f.brandIds ? Prisma.sql`AND g."brandId" IN (${Prisma.join(f.brandIds)})` : Prisma.empty;
  const all = await db.$queryRaw<GenRow[]>`
    SELECT g.id, g."brandId", g.status, g.confidence, g."durationMs", g."createdAt",
      COALESCE(g."originalInput"->>'productType', g."extractedFacts"->>'product_type') AS "productType",
      g.result->'recommendation'->>'recommended_title' AS name, g.result->'content'->>'status' AS "pageStatus", g.result->'sheet'->>'status' AS "dataStatus",
      g.photos, (g."isTest" OR COALESCE(b."isTest", false)) AS "isTest"
    FROM "Generation" g LEFT JOIN "BatchItem" bi ON bi."generationId" = g.id LEFT JOIN "Batch" b ON b.id = bi."batchId"
    WHERE g."createdAt" >= ${from} ${brandSql}`;
  const testsLeftOut = f.includeTests ? 0 : all.filter((g) => g.isTest).length;
  const categories = [...new Set(all.filter((g) => f.includeTests || !g.isTest).map((g) => categoryLabel(g.productType)))].sort();
  const gens = all.filter((g) => (f.includeTests || !g.isTest) && (f.category === "all" || categoryLabel(g.productType) === f.category));
  const ids = gens.map((g) => g.id);
  const named = gens.filter((g) => g.status === "completed" && g.name);

  // Review: where every named piece stands, and how often people changed what the AI wrote.
  const reviews = ids.length ? await db.productReview.findMany({ where: { generationId: { in: ids } }, select: { id: true, status: true, generationId: true } }) : [];
  const revisions = reviews.length ? await db.reviewRevision.findMany({ where: { reviewId: { in: reviews.map((r) => r.id) }, source: "human" }, select: { reviewId: true, field: true } }) : [];
  const flagged = reviews.length ? await db.reviewComment.count({ where: { reviewId: { in: reviews.map((r) => r.id) }, flag: true } }) : 0;
  const byStatus = (s: string[]) => reviews.filter((r) => s.includes(r.status)).length;
  const corrected = new Set(revisions.map((r) => r.reviewId));
  const fieldCounts = new Map<string, number>();
  for (const r of revisions) fieldCounts.set(r.field, (fieldCounts.get(r.field) ?? 0) + 1);

  // Names used by more than one piece of the same brand (Google treats them as one product).
  const nameCount = new Map<string, number>();
  for (const g of named) { const k = `${g.brandId}|${g.name!.toLowerCase().trim()}`; nameCount.set(k, (nameCount.get(k) ?? 0) + 1); }
  const duplicates = named.filter((g) => (nameCount.get(`${g.brandId}|${g.name!.toLowerCase().trim()}`) ?? 0) > 1).length;
  const withPhotoProblems = named.filter((g) => Array.isArray(g.photos) && (g.photos as { problems?: string[] }[]).some((p) => p.problems?.length)).length;

  // Ranges: how bulk work went.
  const batchWhere: Prisma.BatchWhereInput = { createdAt: { gte: from }, ...(f.brandIds ? { brandId: { in: f.brandIds } } : {}), ...(f.includeTests ? {} : { isTest: false }) };
  const batches = await db.batch.findMany({ where: batchWhere, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, title: true, source: true, createdAt: true, isTest: true, items: { select: { status: true, updatedAt: true } } } });

  // Spend, from the ledger. A category filter keeps only spend tied to pieces in that category.
  const usageWhere: Prisma.UsageEventWhereInput = { createdAt: { gte: from }, ...(f.brandIds ? { brandId: { in: f.brandIds } } : {}) };
  const events = await db.usageEvent.findMany({ where: usageWhere, select: { operation: true, provider: true, costUsd: true, brandId: true, generationId: true, batchId: true, backfilled: true, createdAt: true } });
  const testGen = new Set(all.filter((g) => g.isTest).map((g) => g.id));
  const testBatch = new Set((await db.batch.findMany({ where: { isTest: true, ...(f.brandIds ? { brandId: { in: f.brandIds } } : {}) }, select: { id: true } })).map((b) => b.id));
  const inFilter = new Set(ids);
  const spend = events.filter((e) => (f.includeTests || (!(e.generationId && testGen.has(e.generationId)) && !(e.batchId && testBatch.has(e.batchId))))
    && (f.category === "all" || (e.generationId && inFilter.has(e.generationId))));
  const total = spend.reduce((s, e) => s + e.costUsd, 0);
  const sumBy = <K extends string>(key: (e: (typeof spend)[number]) => K | null) => {
    const m = new Map<K, number>();
    for (const e of spend) { const k = key(e); if (k) m.set(k, (m.get(k) ?? 0) + e.costUsd); }
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const namedIds = new Set(named.map((g) => g.id));
  const namedSpend = spend.filter((e) => e.generationId && namedIds.has(e.generationId)).reduce((s, e) => s + e.costUsd, 0);
  const brands = await db.brand.findMany({ where: f.brandIds ? { id: { in: f.brandIds } } : {}, select: { id: true, name: true } });
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const batchCost = new Map(sumBy((e) => (e.batchId ? e.batchId : null)));
  const days = new Map<string, number>();
  for (const e of spend) { const d = e.createdAt.toISOString().slice(0, 10); days.set(d, (days.get(d) ?? 0) + e.costUsd); }

  const durations = named.map((g) => g.durationMs).filter((d): d is number => typeof d === "number" && d > 0);
  const conf = (c: string) => named.filter((g) => g.confidence === c).length;

  return {
    filter: f, categories, testsLeftOut,
    work: {
      started: gens.length, named: named.length,
      needsDetail: gens.filter((g) => g.status === "needs_input").length,
      failed: gens.filter((g) => g.status === "failed").length,
      inProgress: gens.filter((g) => !["completed", "needs_input", "failed"].includes(g.status)).length,
      toReview: byStatus(["ai_generated", "needs_review"]), approved: byStatus(["approved", "ready_to_export", "published"]), rejected: byStatus(["rejected"]),
      medianSeconds: median(durations) != null ? Math.round(median(durations)! / 1000) : null,
      averageSeconds: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000) : null,
    },
    ranges: {
      count: batches.length,
      pieces: batches.reduce((n, b) => n + b.items.length, 0),
      named: batches.reduce((n, b) => n + b.items.filter((i) => i.status === "named").length, 0),
      failed: batches.reduce((n, b) => n + b.items.filter((i) => ["failed", "read_failed"].includes(i.status)).length, 0),
      recent: batches.slice(0, 8).map((b) => {
        const done = b.items.filter((i) => i.status === "named");
        const last = done.length ? Math.max(...done.map((i) => i.updatedAt.getTime())) : null;
        return { id: b.id, title: b.title, source: b.source, isTest: b.isTest, createdAt: b.createdAt, pieces: b.items.length, named: done.length, failed: b.items.filter((i) => ["failed", "read_failed"].includes(i.status)).length, minutes: last ? Math.max(1, Math.round((last - b.createdAt.getTime()) / 60_000)) : null, costUsd: batchCost.get(b.id) ?? 0 };
      }),
    },
    quality: {
      high: share(conf("high"), named.length), medium: share(conf("medium"), named.length), low: share(conf("low"), named.length),
      reviewed: reviews.length, corrected: corrected.size, correctionRate: share(corrected.size, reviews.length),
      mostChanged: [...fieldCounts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([field, n]) => ({ field: FIELD.get(field)?.label ?? field, n })),
      flaggedMistakes: flagged,
      duplicates, duplicateRate: share(duplicates, named.length),
      pageHeldBack: named.filter((g) => g.pageStatus === "failed").length, dataHeldBack: named.filter((g) => g.dataStatus === "failed").length,
      withPhotoProblems,
    },
    testSet: readiness as unknown as { checkedAt: string; runs: Record<string, string | null>; minCases: number; bars: Record<string, number>; categories: { category: string; cases: number; status: string; scores: Record<string, { share: number; n: number } | null> }[] },
    spend: {
      total, claude: spend.filter((e) => e.provider === "claude").reduce((s, e) => s + e.costUsd, 0), google: spend.filter((e) => e.provider === "dataforseo").reduce((s, e) => s + e.costUsd, 0),
      perNamed: named.length ? namedSpend / named.length : null,
      byOperation: sumBy((e) => e.operation as UsageOp).map(([op, usd]) => ({ label: OP_LABEL[op] ?? op, usd })),
      byBrand: sumBy((e) => (e.brandId ? brandName.get(e.brandId) ?? "Unknown brand" : "No brand yet")).map(([name, usd]) => ({ name, usd })),
      byDay: [...days].sort((a, b) => a[0].localeCompare(b[0])).map(([day, usd]) => ({ day, usd })),
      backfilledShare: total ? spend.filter((e) => e.backfilled).reduce((s, e) => s + e.costUsd, 0) / total : 0,
    },
  };
}
export type Dashboard = Awaited<ReturnType<typeof dashboardData>>;
