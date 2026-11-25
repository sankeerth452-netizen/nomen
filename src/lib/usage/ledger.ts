// One row per paid call (UsageEvent), so spend shows by day, brand, range and step. Recording never stops the work:
// a failed write is logged and the name, page or reading goes on.
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { claudeUsd, generationUsd, readUsd } from "../pricing";
import type { AiUsage } from "../providers/types";

export const USAGE_OPS = ["details", "name", "page", "data", "google_results", "keyword_figures", "photo_read", "brand_voice", "seasonal_figures", "all_steps", "other"] as const;
export type UsageOp = (typeof USAGE_OPS)[number];

/** What each step is called on screens. */
export const OP_LABEL: Record<UsageOp, string> = {
  details: "Reading typed details", name: "Writing the name", page: "Product page", data: "Product data",
  google_results: "Google results", keyword_figures: "Google search figures", photo_read: "Reading photos",
  brand_voice: "Reading a brand's voice", seasonal_figures: "Seasonal figures", all_steps: "Earlier products (not split by step)", other: "Other",
};

export type UsageWho = { brandId?: string | null; userId?: string | null; generationId?: string | null; batchId?: string | null };

/** A Claude call: tokens and their cost at list prices. */
export async function recordClaude(who: UsageWho, operation: UsageOp, u: AiUsage): Promise<void> {
  if (!u.model && !u.inputTokens && !u.outputTokens) return; // the stand-in AI: nothing was paid
  const model = u.model ?? "unknown";
  await write({
    ...ids(who), operation, provider: "claude", model,
    inputTokens: u.inputTokens, outputTokens: u.outputTokens, cacheRead: u.cacheReadTokens ?? 0, cacheWrite: u.cacheWriteTokens ?? 0,
    costUsd: claudeUsd(model, { input: u.inputTokens, output: u.outputTokens, cacheRead: u.cacheReadTokens, cacheWrite: u.cacheWriteTokens }),
  });
}

/** A DataForSEO call (Google results or search figures), at the cost it reported. */
export async function recordGoogle(who: UsageWho, operation: UsageOp, costUsd: number): Promise<void> {
  if (!(costUsd > 0)) return;
  await write({ ...ids(who), operation, provider: "dataforseo", costUsd });
}

const ids = (w: UsageWho) => ({ brandId: w.brandId ?? null, userId: w.userId ?? null, generationId: w.generationId ?? null, batchId: w.batchId ?? null });

async function write(data: Prisma.UsageEventUncheckedCreateInput) {
  try {
    await db.usageEvent.create({ data });
  } catch (e) {
    console.error("usage record failed", data.operation, e instanceof Error ? e.message : e);
  }
}

/** Who a generation belongs to, for its usage rows (its range, when it was named in one). */
export async function generationWho(generationId: string): Promise<UsageWho> {
  const g = await db.generation.findUnique({ where: { id: generationId }, select: { brandId: true, userId: true, batchItem: { select: { batchId: true } } } });
  return { generationId, brandId: g?.brandId ?? null, userId: g?.userId ?? null, batchId: g?.batchItem?.batchId ?? null };
}

/**
 * Products named before the ledger existed get one row each from what they stored ("all_steps", marked backfilled),
 * and range photo readings one row per piece. Safe to run again: only products and ranges with no rows yet are added.
 */
export async function backfillUsage(): Promise<{ generations: number; readings: number }> {
  const gens = await db.$queryRaw<{ id: string; brandId: string; userId: string; usage: unknown; createdAt: Date; batchId: string | null }[]>`
    SELECT g.id, g."brandId", g."userId", g.usage, g."createdAt", bi."batchId"
    FROM "Generation" g LEFT JOIN "BatchItem" bi ON bi."generationId" = g.id
    WHERE g.usage IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "UsageEvent" e WHERE e."generationId" = g.id)`;
  const rows: Prisma.UsageEventCreateManyInput[] = [];
  let added = 0;
  for (const g of gens) {
    const c = generationUsd(g.usage);
    const base = { brandId: g.brandId, userId: g.userId, generationId: g.id, batchId: g.batchId, operation: "all_steps", backfilled: true, createdAt: g.createdAt };
    if (c.claude > 0) rows.push({ ...base, provider: "claude", costUsd: c.claude });
    if (c.google > 0) rows.push({ ...base, provider: "dataforseo", costUsd: c.google });
    if (c.claude > 0 || c.google > 0) added++;
  }
  const items = await db.$queryRaw<{ batchId: string; brandId: string; userId: string; readUsage: unknown; updatedAt: Date }[]>`
    SELECT bi."batchId", b."brandId", b."userId", bi."readUsage", bi."updatedAt"
    FROM "BatchItem" bi JOIN "Batch" b ON b.id = bi."batchId"
    WHERE bi."readUsage" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "UsageEvent" e WHERE e."batchId" = bi."batchId" AND e.operation = 'photo_read')`;
  let readings = 0;
  for (const i of items) {
    const cost = readUsd(i.readUsage);
    const model = (i.readUsage as { model?: string }).model ?? null;
    if (cost > 0) { rows.push({ brandId: i.brandId, userId: i.userId, batchId: i.batchId, operation: "photo_read", provider: "claude", model, costUsd: cost, backfilled: true, createdAt: i.updatedAt }); readings++; }
  }
  if (rows.length) await db.usageEvent.createMany({ data: rows });
  return { generations: added, readings };
}
