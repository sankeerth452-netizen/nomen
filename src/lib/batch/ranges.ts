// A range: many product photos a buyer names together. Each photo is read by Claude, checked by the buyer, then
// named through the normal pipeline, so every name still comes from details the buyer has seen.
import type { Batch, BatchItem, Generation, Prisma } from "@prisma/client";
import { db } from "../db";
import { HttpError, hasRole } from "../auth/guards";
import type { SessionUser } from "../auth/session";
import type { Box } from "../frame";
import type { ItemDetails, ItemStatus } from "./shared";

export * from "./shared";

export const asDetails = (j: Prisma.JsonValue | null): ItemDetails | null => (j && typeof j === "object" ? (j as unknown as ItemDetails) : null);
export const asBox = (j: Prisma.JsonValue | null): Box | null => (j && typeof j === "object" ? (j as unknown as Box) : null);

/** Buyers: their own ranges; brand admins: their brand's; owner: everything. 404 (not 403) so ids can't be probed. */
export async function loadRangeFor(user: SessionUser, id: string): Promise<Batch> {
  const b = await db.batch.findUnique({ where: { id } });
  const allowed = b && (user.role === "owner" || (b.brandId === user.brandId && (b.userId === user.id || hasRole(user, "admin"))));
  if (!b || !allowed) throw new HttpError(404, "We couldn't find that range.");
  return b;
}

type ItemWithGen = BatchItem & { generation: Pick<Generation, "id" | "status" | "result" | "confidence"> | null };

/** What the range screen shows. No photos (served separately), no usage, nothing technical. */
export function presentItem(i: ItemWithGen) {
  const result = (i.generation?.result ?? null) as { recommendation?: { recommended_title: string; alternatives: { title: string; trade_off: string }[] }; message?: string; conflicts?: string[]; content?: { status: string; meta_title?: string; meta_description?: string; description?: string; words?: number } | null } | null;
  return {
    id: i.id, position: i.position, filename: i.filename, status: i.status as ItemStatus,
    details: asDetails(i.details), focus: asBox(i.focus),
    generationId: i.generation?.id ?? null,
    name: result?.recommendation?.recommended_title ?? null,
    alternatives: result?.recommendation?.alternatives?.map((a) => a.title) ?? [],
    confidence: i.generation?.confidence ?? null,
    question: i.status === "needs_input" ? (result?.message ?? result?.conflicts?.join(" ") ?? null) : null,
    page: result?.content ? { status: result.content.status, metaTitle: result.content.meta_title ?? null, metaDescription: result.content.meta_description ?? null, description: result.content.description ?? null, words: result.content.words ?? null } : null,
  };
}
export type PresentedItem = ReturnType<typeof presentItem>;

export async function rangeItems(batchId: string) {
  const items = await db.batchItem.findMany({
    where: { batchId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }], // ties (two photos given the same place) never reshuffle
    include: { generation: { select: { id: true, status: true, result: true, confidence: true } } },
  });
  return items.map(presentItem);
}

/** Who may see a range list: same rule as History. */
export function rangeWhere(user: SessionUser): Prisma.BatchWhereInput {
  return user.role === "owner" ? {} : hasRole(user, "admin") ? { brandId: user.brandId! } : { userId: user.id };
}

// A cell starting with = + - @ (or a tab/CR) would run as a formula in Excel or Sheets: neutralise it.
const cell = (v: string) => {
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The download: one row per photo, in upload order. */
export function rangeCsv(items: PresentedItem[]): string {
  const rows = [["Photo", "Name", "Other options", "Confidence", "Status", "Meta title", "Meta description", "Description", "Description words", "Product type", "What the buyer described"]];
  const status: Record<string, string> = { named: "Named", needs_input: "Needs a detail", failed: "Didn't work", review: "Not named yet", not_product: "No fashion piece found", read_failed: "Couldn't read the photo" };
  const level = (c: string | null) => (c ? c[0].toUpperCase() + c.slice(1) : "");
  for (const i of items) {
    const page = i.page?.status === "ready" ? i.page : null;
    rows.push([i.filename, i.name ?? "", i.alternatives.join(" | "), level(i.confidence), status[i.status] ?? "In progress", page?.metaTitle ?? "", page?.metaDescription ?? "", page?.description ?? "", page?.words ? String(page.words) : "", i.details?.fields.productType ?? "", i.details?.fields.freeText ?? ""]);
  }
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n"; // BOM so Excel reads the accents right
}
