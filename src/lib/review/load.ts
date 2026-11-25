import { sumRows } from "../insights/performance";
import { asPhotoInfo } from "../images/info";
import type { ItemDetails } from "../batch/shared";
// Loading a product's review with access checked, and the shape the review screen gets.
import type { ProductReview } from "@prisma/client";
import { db } from "../db";
import { HttpError } from "../auth/guards";
import type { SessionUser } from "../auth/session";
import type { BrandSettings } from "../brand";
import { loadGenerationFor } from "../pipeline/access";
import type { PieceFeed } from "../feed/shared";
import { aiValue, currentValue, REVIEW_FIELDS, STATUS_LABEL, type Edits, type ResultLike } from "./fields";
import { brandSettings } from "./guard";
import { can } from "./permissions";
import { ensureReview } from "./workflow";

export async function loadReview(user: SessionUser, generationId: string) {
  const g = await loadGenerationFor(user, generationId); // brand and ownership rules, 404 otherwise
  const review = await ensureReview(g);
  if (!review) throw new HttpError(409, "This product is still being written. Try again in a moment.");
  return { g, review, settings: await brandSettings(g.brandId) };
}

/** Everything the review screen shows: the original details, each field (the AI's and the current value), history, comments. */
export async function presentReview(g: Awaited<ReturnType<typeof loadGenerationFor>>, review: ProductReview, user: SessionUser, settings: BrandSettings | null) {
  const result = (g.result ?? {}) as ResultLike & { recommendation?: { warnings?: string[] } };
  const edits = (review.edits ?? {}) as Edits;
  const fs = (review.fieldStatus ?? {}) as Record<string, string>;
  const since28 = new Date(Date.now() - 29 * 86_400_000);
  const [metrics, queries, shop] = await Promise.all([
    db.pageMetric.findMany({ where: { generationId: g.id, date: { gte: since28 } } }),
    db.pageQuery.findMany({ where: { generationId: g.id }, orderBy: { impressions: "desc" }, take: 5 }),
    db.merchantStatus.findUnique({ where: { generationId: g.id } }),
  ]);
  const [revisions, comments, item, approver] = await Promise.all([
    db.reviewRevision.findMany({ where: { reviewId: review.id }, orderBy: { createdAt: "desc" }, take: 300, include: { user: { select: { displayName: true, username: true } } } }),
    db.reviewComment.findMany({ where: { reviewId: review.id }, orderBy: { createdAt: "asc" }, include: { user: { select: { displayName: true, username: true } } } }),
    db.batchItem.findUnique({ where: { generationId: g.id }, select: { feed: true, details: true, batchId: true, batch: { select: { title: true } } } }),
    review.approvedById ? db.user.findUnique({ where: { id: review.approvedById }, select: { displayName: true, username: true } }) : null,
  ]);
  const ready = { page: result.content?.status === "ready", sheet: result.sheet?.status === "ready" };
  const fileRow = ((item?.feed as PieceFeed | null)?.rows ?? [])[0]?.attrs ?? null;
  const who = (u: { displayName: string; username: string } | null) => (u ? u.displayName || u.username : "Someone");
  return {
    id: g.id, status: review.status, statusLabel: STATUS_LABEL[review.status], confidence: g.confidence, hasPhoto: !!g.photo,
    // Every photo, what it shows and its alt text; what the photos showed of the kind's details, and how clearly.
    photos: asPhotoInfo(g.photos), morePhotos: (g.images ?? []).map((x) => x.position),
    seen: { attributes: (item?.details as ItemDetails | null)?.attributes ?? [], contradictions: (item?.details as ItemDetails | null)?.contradictions ?? [] },
    approvedBy: approver ? who(approver) : null, approvedAt: review.approvedAt, updatedAt: review.updatedAt,
    range: item ? { id: item.batchId, title: item.batch.title } : null,
    original: { input: g.originalInput as Record<string, string>, file: fileRow, skus: ((item?.feed as PieceFeed | null)?.rows ?? []).map((r) => r.attrs.id).filter(Boolean) },
    fields: REVIEW_FIELDS.map((f) => ({
      ...f, ai: aiValue(result, f.key), current: currentValue(result, edits, f.key), edited: f.key in edits,
      fieldStatus: fs[f.key] ?? null, available: f.part === "name" || ready[f.part],
    })),
    warnings: result.recommendation?.warnings ?? [], checks: result.sheet?.status === "ready" ? result.sheet.checks : [],
    revisions: revisions.map((r) => ({ id: r.id, field: r.field, source: r.source, value: r.value, by: who(r.user), at: r.createdAt })),
    comments: comments.map((c) => ({ id: c.id, field: c.field, body: c.body, flag: c.flag, by: who(c.user), at: c.createdAt })),
    can: { edit: can(user, "edit", settings), approve: can(user, "approve", settings), comment: can(user, "comment", settings), manage: user.role === "owner" || can(user, "manageBrand", settings) },
    isTest: g.isTest,
    // Where it lives on the brand's site, and how it's doing in Google there (last 28 days).
    live: { url: g.liveUrl, since: g.liveSince ? g.liveSince.toISOString().slice(0, 10) : null, previousTitle: g.previousTitle },
    google: metrics.length || queries.length || shop ? {
      last28: sumRows(metrics), queries: queries.map((q) => ({ query: q.query, impressions: q.impressions, clicks: q.clicks })),
      shopping: shop ? { status: shop.status, issues: ((shop.issues as { description?: string }[]) ?? []).map((i) => i.description ?? "").filter(Boolean).slice(0, 3) } : null,
    } : null,
    approvalRequired: settings?.approvalRequired ?? false,
  };
}
export type ReviewPayload = Awaited<ReturnType<typeof presentReview>>;
