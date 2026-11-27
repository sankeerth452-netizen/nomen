// A range: many product photos a buyer names together. Each photo is read by Claude, checked by the buyer, then
// named through the normal pipeline, so every name still comes from details the buyer has seen.
import type { Batch, BatchItem, Generation, Prisma } from "@prisma/client";
import { applyReviewEdits, EXPORTABLE, STATUS_LABEL, type ResultLike } from "../review/fields";
import type { FeedPiece } from "../feed/export";
import { ownerScope } from "../auth/workspace";
import { seesWholeBrand } from "../review/permissions";
import { db } from "../db";
import { HttpError, hasRole } from "../auth/guards";
import type { SessionUser } from "../auth/session";
import type { Box } from "../frame";
import type { Photo } from "../photo";
import { duplicateNames, slugFor, type ItemDetails, type ItemStatus } from "./shared";
import type { StoredSheet } from "../pipeline/sheet";
import type { PieceFeed } from "../feed/shared";

export * from "./shared";

export const asDetails = (j: Prisma.JsonValue | null): ItemDetails | null => (j && typeof j === "object" ? (j as unknown as ItemDetails) : null);
export const asBox = (j: Prisma.JsonValue | null): Box | null => (j && typeof j === "object" ? (j as unknown as Box) : null);

/** Buyers: their own ranges; brand admins: their brand's; owner: everything. 404 (not 403) so ids can't be probed. */
export async function loadRangeFor(user: SessionUser, id: string): Promise<Batch> {
  const b = await db.batch.findUnique({ where: { id } });
  const allowed = b && (user.role === "owner" || (b.brandId === user.brandId && (b.userId === user.id || seesWholeBrand(user))));
  if (!b || !allowed) throw new HttpError(404, "We couldn't find that range.");
  return b;
}

/**
 * Add a dropped piece to a range: its main photo and, when its file names grouped them, its other photos, all saved
 * together so the piece is read once with every photo.
 */
export async function addPhotoPiece(batchId: string, p: { filename: string; position: number | null; photo: Photo; image: Photo; more?: { photo: Photo; image: Photo }[] }) {
  const last = p.position === null ? await db.batchItem.aggregate({ where: { batchId }, _max: { position: true } }) : null;
  return db.batchItem.create({
    data: {
      batchId, position: p.position ?? (last?._max.position ?? 0) + 1, filename: p.filename,
      photo: new Uint8Array(p.photo.data), photoType: p.photo.mediaType, readImage: new Uint8Array(p.image.data), readType: p.image.mediaType,
      images: p.more?.length ? { create: p.more.map((m, n) => ({ position: n + 1, photo: new Uint8Array(m.photo.data), photoType: m.photo.mediaType, readImage: new Uint8Array(m.image.data), readType: m.image.mediaType })) } : undefined,
    },
    include: { generation: { select: { id: true, status: true, result: true, confidence: true } }, images: { select: { position: true }, orderBy: { position: "asc" } } },
  });
}

type ItemWithGen = BatchItem & { generation: (Pick<Generation, "id" | "status" | "result" | "confidence"> & { review?: { status: string; edits: unknown } | null }) | null; images?: { position: number }[] };

/** What the range screen shows. No photos (served separately), no usage, nothing technical. */
export function presentItem(i: ItemWithGen) {
  // What people changed in review is what the range shows and exports; the AI's own values stay in the generation.
  const review = i.generation?.review ?? null;
  const edits = (review?.edits ?? {}) as Record<string, unknown>;
  const raw = (i.generation?.result ?? null) as ResultLike | null;
  const result = (raw ? applyReviewEdits(raw, edits) : null) as { recommendation?: { recommended_title: string; alternatives: { title: string; trade_off: string }[] }; message?: string; conflicts?: string[]; content?: { status: string; meta_title?: string; meta_description?: string; description?: string; words?: number } | null; sheet?: StoredSheet | null } | null;
  return {
    id: i.id, position: i.position, filename: i.filename, status: i.status as ItemStatus,
    details: asDetails(i.details), focus: asBox(i.focus),
    generationId: i.generation?.id ?? null,
    review: review ? { status: review.status, edited: Object.keys(edits).length > 0 } : null,
    name: result?.recommendation?.recommended_title ?? null,
    alternatives: result?.recommendation?.alternatives?.map((a) => a.title) ?? [],
    confidence: i.generation?.confidence ?? null,
    question: i.status === "needs_input" ? (result?.message ?? result?.conflicts?.join(" ") ?? null) : null,
    page: result?.content ? { status: result.content.status, metaTitle: result.content.meta_title ?? null, metaDescription: result.content.meta_description ?? null, description: result.content.description ?? null, words: result.content.words ?? null } : null,
    sheet: result?.sheet ?? null,
    hasPhoto: !!i.photo,
    /** The piece's other photos, by position (served at .../photos/<position> once loaded). */
    morePhotos: (i.images ?? []).map((x) => x.position),
    // A product-file piece: a summary of its rows for the card (the full rows stay on the server, for the Google feed).
    file: i.feed ? fileSummary(i.feed as unknown as PieceFeed) : null,
  };
}
export type PresentedItem = ReturnType<typeof presentItem>;

function fileSummary(f: PieceFeed) {
  const ids = f.rows.map((r) => r.attrs.id).filter((x): x is string => !!x);
  const sizes = f.rows.map((r) => r.attrs.size).filter((x): x is string => !!x);
  return { skus: ids, sizes, price: f.rows[0]?.attrs.price ?? null, salePrice: f.rows[0]?.attrs.sale_price ?? null, issues: f.issues, imageError: f.imageError ?? null };
}

/** A range's pieces, in order. With `changedSince`, only the pieces that changed after it (the screen's regular check). */
export async function rangeItems(batchId: string, changedSince?: Date) {
  const items = await db.batchItem.findMany({
    where: { batchId, ...(changedSince ? { updatedAt: { gt: changedSince } } : {}) }, orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }], // ties (two photos given the same place) never reshuffle
    include: { generation: { select: { id: true, status: true, result: true, confidence: true, review: { select: { status: true, edits: true } } } }, images: { select: { position: true }, orderBy: { position: "asc" } } },
  });
  return items.map(presentItem);
}

/** Who may see a range list: same rule as History. */
export function rangeWhere(user: SessionUser): Prisma.BatchWhereInput {
  return user.role === "owner" ? ownerScope(user) : seesWholeBrand(user) ? { brandId: user.brandId! } : { userId: user.id };
}

// A cell starting with = + - @ (or a tab/CR) would run as a formula in Excel or Sheets: neutralise it.
export const cell = (v: string) => {
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Try every failed piece again: photos that couldn't be read are read again, names that didn't work are named again.
 * Pieces that worked are left alone, so nothing is paid for twice. updateMany leaves updatedAt alone, so it's set here.
 */
export async function retryFailed(batchId: string): Promise<{ reread: number; renamed: number }> {
  const now = new Date();
  const reread = await db.batchItem.updateMany({
    where: { batchId, status: "read_failed", OR: [{ imageUrl: { not: null } }, { readImage: { not: null } }] },
    data: { status: "queued", attempts: 0, claimedAt: null, updatedAt: now },
  });
  const renamed = await db.batchItem.updateMany({ where: { batchId, status: "failed" }, data: { status: "to_name", claimedAt: null, updatedAt: now } });
  return { reread: reread.count, renamed: renamed.count };
}

/** The Google feed's pieces: named products with people's edits applied; with approval required, approved ones only. */
export async function feedPieces(batchId: string, approvalRequired: boolean): Promise<FeedPiece[]> {
  const items = await db.batchItem.findMany({
    where: { batchId, status: "named" }, orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { feed: true, details: true, generation: { select: { result: true, review: { select: { status: true, edits: true } } } } },
  });
  return items.flatMap((i) => {
    const review = i.generation?.review;
    if (approvalRequired && !EXPORTABLE.includes(review?.status ?? "")) return [];
    const raw = i.generation?.result as ResultLike | null;
    const r = (raw ? applyReviewEdits(raw, (review?.edits ?? {}) as Record<string, unknown>) : null) as { recommendation?: { recommended_title: string }; sheet?: StoredSheet } | null;
    const feed = i.feed as PieceFeed | null;
    if (!r?.recommendation || !feed || !asDetails(i.details)) return [];
    return [{ name: r.recommendation.recommended_title, rows: feed.rows, sheet: r.sheet?.status === "ready" ? r.sheet : null }];
  });
}

/** The download: one row per photo, in upload order. */
export function rangeCsv(items: PresentedItem[]): string {
  const rows = [[
    "Photo", "Name", "Other options", "Confidence", "Status", "Checks", "Meta title", "Meta description", "Description", "Description words",
    "Short description", "Highlights", "Product details", "Ideal for", "Ideal for (check first)", "Google category", "Google category ID", "Product type (breadcrumb)",
    "Colour", "Pattern", "Material", "Gender", "Age group", "Size type", "Size system", "Custom label 0", "Custom label 1", "Season", "Care", "Image alt text", "URL slug", "Search queries",
    "Piece", "What the buyer described", "SKUs", "Product file checks", "Size and fit", "Review status",
    "Other photos' alt text", "Photo problems",
  ]];
  const status: Record<string, string> = { named: "Named", needs_input: "Needs a detail", failed: "Didn't work", review: "Not named yet", not_product: "No fashion piece found", read_failed: "Couldn't read the photo" };
  const level = (c: string | null) => (c ? c[0].toUpperCase() + c.slice(1) : "");
  const dupes = duplicateNames(items);
  for (const i of items) {
    const page = i.page?.status === "ready" ? i.page : null;
    const sh = i.sheet?.status === "ready" ? i.sheet : null;
    const g = sh?.google;
    const checks = [...(i.name && dupes.get(i.id) ? [`Same name as ${dupes.get(i.id)!.join(", ")}`] : []), ...(i.name && i.name.length > 70 ? [`Name is ${i.name.length} characters (Google Shopping shows about 70)`] : []), ...(sh?.checks ?? [])];
    rows.push([
      i.filename, i.name ?? "", i.alternatives.join(" | "), level(i.confidence), status[i.status] ?? "In progress", checks.join(" | "),
      page?.metaTitle ?? "", page?.metaDescription ?? "", page?.description ?? "", page?.words ? String(page.words) : "",
      sh?.shortDescription ?? "", sh?.highlights.join(" | ") ?? "", sh?.details.map((d) => `${d.name}: ${d.value}`).join(" | ") ?? "",
      sh?.idealFor.live.map((v) => v.label).join(" | ") ?? "", sh?.idealFor.review.map((v) => `${v.label} (${v.reason})`).join(" | ") ?? "",
      g?.category?.path ?? "", g?.category ? String(g.category.id) : "", g?.productType ?? "", g?.colour ?? "", g?.pattern ?? "", g?.material ?? "",
      g?.gender ?? "", g?.ageGroup ?? "", g?.sizeType ?? "", g?.sizeSystem ?? "", g?.customLabels[0] ?? "", g?.customLabels[1] ?? "",
      sh?.season ? `${sh.season.value}${sh.season.confidence === "low" ? " (check)" : ""}` : "", sh?.care ?? "", sh?.imageAlt ?? "", i.name ? slugFor(i.name) : "",
      sh?.searchQueries.map((q) => (q.volume ? `${q.phrase} (${q.volume})` : q.phrase)).join(" | ") ?? "",
      i.details?.fields.productType ?? "", i.details?.fields.freeText ?? "",
      i.file?.skus.join(" | ") ?? "", [...(i.file?.issues ?? []), ...(i.file?.imageError ? [i.file.imageError] : [])].join(" | "), sh?.sizeFit ?? "", i.review ? STATUS_LABEL[i.review.status] ?? i.review.status : "",
      (i.details?.photos ?? []).filter((p) => p.position > 0 && p.alt).map((p) => `Photo ${p.position + 1}: ${p.alt}`).join(" | "),
      [...(i.details?.photos ?? []).flatMap((p) => p.problems.map((m) => `${p.position === 0 ? "Main photo" : `Photo ${p.position + 1}`}: ${m}`)), ...(i.details?.contradictions ?? [])].join(" | "),
    ]);
  }
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n"; // BOM so Excel reads the accents right
}
