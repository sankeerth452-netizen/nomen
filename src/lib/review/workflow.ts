// Review and approval for named products. A product never becomes approved just because the AI finished: it starts
// as "AI generated" (or "Needs review" when Nomen itself saw something to check), people change what needs changing,
// and someone allowed to approve does so. Every change is kept, with who and when, and can be brought back.
import type { Prisma, ProductReview, ReviewStatus } from "@prisma/client";
import { db } from "../db";
import { HttpError } from "../auth/guards";
import { aiValue, cleanFieldValue, currentValue, FIELD, REVIEW_FIELDS, type Edits, type ResultLike } from "./fields";

const json = (v: unknown) => v as Prisma.InputJsonValue;
type Gen = { id: string; brandId: string; status: string; confidence: string | null; result: unknown };

// Product data checks that mean something is missing or wrong for Google (routine notes, like occasions to check or a
// material that wasn't given, don't count: every product gets a person's look anyway).
const SERIOUS = /^(No Google category|Check the Google category|Add a colour|No colour given|The short description is)/;

/** Where a newly named product starts: "Needs review" when it's below High confidence, a part failed, or a check is serious. */
export function initialStatus(g: Pick<Gen, "confidence" | "result">): ReviewStatus {
  const r = (g.result ?? {}) as ResultLike;
  const serious = r.sheet?.status === "ready" && r.sheet.checks.some((c) => SERIOUS.test(c));
  const somethingFailed = r.sheet?.status === "failed" || r.content?.status === "failed";
  return g.confidence !== "high" || serious || somethingFailed ? "needs_review" : "ai_generated";
}

/** The product's review, made the first time it's needed. null while the product is still being written. */
export async function ensureReview(g: Gen): Promise<ProductReview | null> {
  if (g.status !== "completed") return null;
  const found = await db.productReview.findUnique({ where: { generationId: g.id } });
  if (found) return found;
  return db.productReview.upsert({ where: { generationId: g.id }, create: { generationId: g.id, brandId: g.brandId, status: initialStatus(g) }, update: {} });
}

/** Reviews for named products that don't have one yet (products named before reviews existed), so the queue lists them. */
export async function backfillReviews(where: Prisma.GenerationWhereInput, limit = 1000): Promise<number> {
  const missing = await db.generation.findMany({ where: { ...where, status: "completed", review: null }, select: { id: true, brandId: true, confidence: true, result: true }, take: limit });
  if (!missing.length) return 0;
  const r = await db.productReview.createMany({ data: missing.map((g) => ({ generationId: g.id, brandId: g.brandId, status: initialStatus(g) })), skipDuplicates: true });
  return r.count;
}

const edits = (r: ProductReview) => (r.edits ?? {}) as Edits;
const fieldStatus = (r: ProductReview) => (r.fieldStatus ?? {}) as Record<string, "approved" | "rejected">;
/** Once approved (or rejected), a change means it has to be looked at again. */
const afterChange = (s: ReviewStatus): ReviewStatus => (["approved", "ready_to_export", "rejected", "ai_generated"].includes(s) ? "needs_review" : s);

/** A person changes one field. Returns the updated review. */
export async function editField(review: ProductReview, userId: string, key: string, value: unknown, categories?: Map<number, string>): Promise<ProductReview> {
  const clean = cleanFieldValue(key, value, categories);
  if ("error" in clean) throw new HttpError(400, clean.error);
  const fs = { ...fieldStatus(review) };
  delete fs[key];
  const [updated] = await db.$transaction([
    db.productReview.update({ where: { id: review.id }, data: { edits: json({ ...edits(review), [key]: clean.value }), fieldStatus: json(fs), status: afterChange(review.status), ...(afterChange(review.status) !== review.status ? { approvedById: null, approvedAt: null } : {}) } }),
    db.reviewRevision.create({ data: { reviewId: review.id, field: key, source: "human", value: json(clean.value), userId } }),
  ]);
  return updated;
}

/** Bring back an earlier value of a field (from its history), or the AI's own (`ai`). */
export async function restoreField(review: ProductReview, userId: string, key: string, from: { revisionId: string } | { ai: true }, result: ResultLike): Promise<ProductReview> {
  if (!FIELD.has(key)) throw new HttpError(400, "That isn't a field you can change.");
  let value: unknown;
  const next = { ...edits(review) };
  if ("ai" in from) { delete next[key]; value = aiValue(result, key); }
  else {
    const rev = await db.reviewRevision.findFirst({ where: { id: from.revisionId, reviewId: review.id, field: key } });
    if (!rev) throw new HttpError(404, "We couldn't find that earlier version.");
    value = rev.value; next[key] = rev.value;
  }
  const fs = { ...fieldStatus(review) };
  delete fs[key];
  const [updated] = await db.$transaction([
    db.productReview.update({ where: { id: review.id }, data: { edits: json(next), fieldStatus: json(fs), status: afterChange(review.status) } }),
    db.reviewRevision.create({ data: { reviewId: review.id, field: key, source: "restore", value: json(value ?? null), userId } }),
  ]);
  return updated;
}

export type ReviewAction = "submit" | "approve" | "reject" | "ready" | "reopen";
export const APPROVER_ACTIONS: ReviewAction[] = ["approve", "reject", "ready", "reopen"];

/**
 * Move a product along. With `fields`, approve or reject just those fields; the product is approved once every
 * field with a value is approved. "ready" needs an approved product.
 */
export async function act(review: ProductReview, userId: string, action: ReviewAction, result: ResultLike, fields?: string[]): Promise<ProductReview> {
  const fs = { ...fieldStatus(review) };
  let status = review.status;
  const filled = REVIEW_FIELDS.filter((f) => { const v = currentValue(result, edits(review), f.key); return Array.isArray(v) ? v.length > 0 : v != null && v !== ""; }).map((f) => f.key);
  if (fields?.some((f) => !FIELD.has(f))) throw new HttpError(400, "That isn't a field you can change.");
  switch (action) {
    case "submit": status = "needs_review"; break;
    case "approve":
      if (fields?.length) { for (const f of fields) fs[f] = "approved"; status = filled.every((f) => fs[f] === "approved") ? "approved" : review.status === "ai_generated" ? "needs_review" : review.status; }
      else { for (const f of filled) fs[f] = "approved"; status = "approved"; }
      break;
    case "reject":
      if (fields?.length) { for (const f of fields) fs[f] = "rejected"; status = "needs_review"; } else status = "rejected";
      break;
    case "ready":
      if (review.status !== "approved" && review.status !== "ready_to_export") throw new HttpError(400, "Approve it first, then mark it ready to export.");
      status = "ready_to_export";
      break;
    case "reopen": status = "needs_review"; break;
  }
  const approvedNow = (status === "approved" || status === "ready_to_export");
  const [updated] = await db.$transaction([
    db.productReview.update({ where: { id: review.id }, data: { status, fieldStatus: json(fs), approvedById: approvedNow ? (review.approvedById ?? userId) : null, approvedAt: approvedNow ? (review.approvedAt ?? new Date()) : null } }),
    db.reviewRevision.create({ data: { reviewId: review.id, field: fields?.length ? `status:${fields.join(",")}` : "status", source: "status", value: json({ action, status }), userId } }),
  ]);
  return updated;
}

export async function addComment(review: ProductReview, userId: string, body: string, field: string | null, flag: boolean) {
  const text = body.trim();
  if (!text) throw new HttpError(400, "Write something first.");
  if (text.length > 2000) throw new HttpError(400, "Keep comments under 2,000 characters.");
  if (field && !FIELD.has(field)) throw new HttpError(400, "That isn't a field.");
  return db.reviewComment.create({ data: { reviewId: review.id, userId, body: text, field, flag } });
}
