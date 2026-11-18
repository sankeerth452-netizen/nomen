// Range rules shared by the server and the range screen. No database code here: this file also runs in the browser.
import type { PhotoDetails } from "../pipeline/types";

/** queued -> reading -> review (or not_product / read_failed); review -> to_name -> naming -> named / needs_input / failed */
export type ItemStatus = "queued" | "reading" | "review" | "not_product" | "read_failed" | "to_name" | "naming" | "named" | "needs_input" | "failed";
/** Stages that are still moving on their own (the screen keeps checking while any piece is in one). */
export const WORKING: ItemStatus[] = ["queued", "reading", "to_name", "naming"];

/** The buyer-facing form fields a piece is named from (the same ones as the single-piece form). */
export const FIELDS = ["productType", "freeText", "colour", "material", "pattern", "fit", "length", "feature", "occasion", "audience", "extra"] as const;
export type Field = (typeof FIELDS)[number];
export type Fields = Partial<Record<Field, string>>;

/** What a piece is named from: the fields, which of them the photo filled in (and the buyer hasn't changed), and what the photo couldn't show. */
export type ItemDetails = { fields: Fields; fromPhoto: Field[]; unsure: string[] };

/** Photo reading -> form fields. Same mapping as the single-piece form. */
export function detailsFromPhoto(d: PhotoDetails): ItemDetails {
  const seen: Fields = { productType: d.product_type ?? "", freeText: d.description ?? "", colour: d.colour ?? "", material: d.material ?? "", pattern: d.pattern ?? "", fit: d.fit ?? "", length: d.length ?? "", feature: d.feature ?? "", occasion: d.occasion ?? "", audience: d.audience ?? "" };
  const fields: Fields = {};
  for (const [k, v] of Object.entries(seen) as [Field, string][]) if (v.trim()) fields[k] = v.trim();
  return { fields, fromPhoto: Object.keys(fields) as Field[], unsure: d.unsure.map((u) => u.trim().toLowerCase()).filter(Boolean).slice(0, 3) };
}

/** A product-file piece: the brand's file says what it says, and the photo only fills what the file left blank. */
export function mergePhotoDetails(file: ItemDetails, photo: ItemDetails): ItemDetails {
  const fields: Fields = { ...photo.fields, ...file.fields };
  const fromPhoto = photo.fromPhoto.filter((k) => !file.fields[k]?.trim());
  return { fields, fromPhoto, unsure: photo.unsure.filter((u) => !Object.keys(file.fields).some((k) => u.includes(k.toLowerCase()))) };
}

/** Clean the buyer's edits: known fields only, trimmed, length-capped like the single-piece form. */
export function cleanFields(raw: unknown): Fields {
  const out: Fields = {};
  if (!raw || typeof raw !== "object") return out;
  for (const k of FIELDS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, k === "extra" ? 2000 : k === "freeText" ? 500 : 120);
  }
  return out;
}

/** A field the buyer edits is theirs now, so it loses its "From your photo" mark. */
export function withEdits(d: ItemDetails, edits: Fields): ItemDetails {
  const fields = { ...d.fields };
  const fromPhoto = new Set(d.fromPhoto);
  for (const k of FIELDS) {
    if (!(k in edits)) continue;
    const v = edits[k]?.trim() ?? "";
    if (v === (fields[k] ?? "")) continue;
    if (v) fields[k] = v; else delete fields[k];
    fromPhoto.delete(k);
  }
  return { fields, fromPhoto: [...fromPhoto], unsure: d.unsure };
}

/** "Apply to every piece": fill only the empty fields, never overwrite a piece's own details. */
export function fillEmpty(d: ItemDetails, shared: Fields): ItemDetails {
  const fields = { ...d.fields };
  for (const k of FIELDS) if (shared[k]?.trim() && !fields[k]?.trim()) fields[k] = shared[k]!.trim();
  return { ...d, fields };
}

/** Can this piece be named as it stands? (The pipeline needs a product type and a description.) */
export const isReady = (d: ItemDetails | null) => !!d && (d.fields.productType?.trim().length ?? 0) >= 2 && (d.fields.freeText?.trim().length ?? 0) >= 2;

export const slugFor = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Pieces in a range that ended up with the same name (Google treats duplicate titles as one product): id -> the other photos. */
export function duplicateNames(items: { id: string; name: string | null; filename: string }[]): Map<string, string[]> {
  const byName = new Map<string, { id: string; filename: string }[]>();
  for (const i of items) if (i.name) { const k = i.name.toLowerCase().trim(); byName.set(k, [...(byName.get(k) ?? []), i]); }
  const out = new Map<string, string[]>();
  for (const group of byName.values()) if (group.length > 1) for (const i of group) out.set(i.id, group.filter((x) => x.id !== i.id).map((x) => x.filename));
  return out;
}

