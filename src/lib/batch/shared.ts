// Range rules shared by the server and the range screen. No database code here: this file also runs in the browser.
import type { PhotoDetails } from "../pipeline/types";
import { attributeNotes, cleanAttributes, type VisualAttribute } from "../category/rules";
import type { PhotoInfo } from "../images/info";
import { baseHue, plainColours } from "../sheet/catalog";

/** queued -> reading -> review (or not_product / read_failed); review -> to_name -> naming -> named / needs_input / failed */
export type ItemStatus = "queued" | "reading" | "review" | "not_product" | "read_failed" | "to_name" | "naming" | "named" | "needs_input" | "failed";
/** Stages that are still moving on their own (the screen keeps checking while any piece is in one). */
export const WORKING: ItemStatus[] = ["queued", "reading", "to_name", "naming"];
/** Pieces whose photos can still change what they're named from. Once named, a piece keeps the photos it was named with. */
export const BEFORE_NAMING: string[] = ["queued", "reading", "review", "not_product", "read_failed", "needs_input"];

/** The buyer-facing form fields a piece is named from (the same ones as the single-piece form). */
export const FIELDS = ["productType", "freeText", "colour", "material", "pattern", "fit", "length", "feature", "occasion", "audience", "extra"] as const;
export type Field = (typeof FIELDS)[number];
export type Fields = Partial<Record<Field, string>>;

/** What a piece is named from: the fields, which of them the photo filled in (and the buyer hasn't changed), and what the photo couldn't show. */
export type ItemDetails = {
  fields: Fields; fromPhoto: Field[]; unsure: string[];
  /** The kind's own details the photos showed (heel type, neckline...), clearly or partly visible. */
  attributes?: VisualAttribute[];
  /** What each photo shows, its alt text and problems. */
  photos?: PhotoInfo[];
  /** Where the photos disagree with the brand's product file (or the buyer's line sheet). */
  contradictions?: string[];
  /** The row of the buyer's line sheet this piece came from. */
  sheetRow?: number;
};

/** Photo reading -> form fields. Same mapping as the single-piece form. */
export function detailsFromPhoto(d: PhotoDetails): ItemDetails {
  const seen: Fields = { productType: d.product_type ?? "", freeText: d.description ?? "", colour: d.colour ?? "", material: d.material ?? "", pattern: d.pattern ?? "", fit: d.fit ?? "", length: d.length ?? "", feature: d.feature ?? "", occasion: d.occasion ?? "", audience: d.audience ?? "" };
  const fields: Fields = {};
  for (const [k, v] of Object.entries(seen) as [Field, string][]) if (v.trim()) fields[k] = v.trim();
  // The kind's own details: clearly visible ones go in as product facts for the buyer to check, partly visible ones
  // are only flagged, never used.
  const attributes = cleanAttributes(d.product_type, d.attributes);
  const notes = attributeNotes(attributes);
  if (notes) fields.extra = notes;
  const partly = attributes.filter((a) => a.seen === "partly").map((a) => a.name.toLowerCase());
  const unsure = [...new Set([...d.unsure.map((u) => u.trim().toLowerCase()).filter(Boolean), ...partly])].slice(0, 4);
  return { fields, fromPhoto: Object.keys(fields) as Field[], unsure, ...(attributes.length ? { attributes } : {}) };
}

/** A product-file piece: the brand's file says what it says, and the photo only fills what the file left blank. */
export function mergePhotoDetails(file: ItemDetails, photo: ItemDetails): ItemDetails {
  const fields: Fields = { ...photo.fields, ...file.fields };
  // The photo's clearly visible details add to the file's own notes rather than being lost behind them.
  if (file.fields.extra?.trim() && photo.fields.extra?.trim()) fields.extra = file.fields.extra.includes(photo.fields.extra.trim()) ? file.fields.extra : `${file.fields.extra.trim()} ${photo.fields.extra.trim()}`.slice(0, 2000);
  const fromPhoto = photo.fromPhoto.filter((k) => !file.fields[k]?.trim());
  const contradictions = photoContradictions(file.fields, photo.fields);
  return { fields, fromPhoto, unsure: photo.unsure.filter((u) => !Object.keys(file.fields).some((k) => u.includes(k.toLowerCase()))), ...(photo.attributes ? { attributes: photo.attributes } : {}), ...(contradictions.length ? { contradictions } : {}) };
}

/**
 * Where the photo plainly disagrees with the brand's file. The file still wins (the brand knows what it sells), but a
 * person should look: it may be the wrong photo, or a wrong colour in the file. Colours are compared by family, so
 * "Navy" and "dark blue" agree; only a different family ("Navy" against black) counts.
 */
export function photoContradictions(file: Fields, photo: Fields): string[] {
  const out: string[] = [];
  const fc = file.colour?.trim(), pc = photo.colour?.trim();
  if (fc && pc) {
    const a = plainColours(fc).map(baseHue), b = plainColours(pc).map(baseHue);
    if (a.length && b.length && !a.some((x) => b.includes(x))) out.push(`The photo looks ${pc.toLowerCase()}, but the file says ${fc}.`);
  }
  const fl = file.length?.trim().toLowerCase(), pl = photo.length?.trim().toLowerCase();
  if (fl && pl && ["mini", "midi", "maxi"].includes(fl) && ["mini", "midi", "maxi"].includes(pl) && fl !== pl) out.push(`The photo looks ${pl}, but the file says ${fl}.`);
  return out;
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
  return { ...d, fields, fromPhoto: [...fromPhoto] };
}

/** "Apply to every piece": fill only the empty fields, never overwrite a piece's own details. */
export function fillEmpty(d: ItemDetails, shared: Fields): ItemDetails {
  const fields = { ...d.fields };
  for (const k of FIELDS) if (shared[k]?.trim() && !fields[k]?.trim()) fields[k] = shared[k]!.trim();
  return { ...d, fields };
}

/** Does this piece have something to check? (A product type and a description: the least the pipeline can name from.) */
export const isReady = (d: ItemDetails | null) => !!d && (d.fields.productType?.trim().length ?? 0) >= 2 && (d.fields.freeText?.trim().length ?? 0) >= 2;

/**
 * What a piece needs before a range names it (asked for by Nitin, 28 Nov 2026): its product type, a description and its
 * material. A photo rarely shows the fabric and Nomen never guesses it, so the buyer gives it. Occasion is optional.
 */
export const NEEDED_TO_NAME: [Field, string][] = [["productType", "product type"], ["freeText", "description"], ["material", "material"]];
/** What's still missing before this piece can be named, in words: ["material"]. */
export const missingToName = (d: ItemDetails | null): string[] => NEEDED_TO_NAME.filter(([k]) => (d?.fields[k]?.trim().length ?? 0) < 2).map(([, label]) => label);
export const canName = (d: ItemDetails | null) => !!d && missingToName(d).length === 0;

export const slugFor = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Pieces in a range that ended up with the same name (Google treats duplicate titles as one product): id -> the other photos. */
export function duplicateNames(items: { id: string; name: string | null; filename: string }[]): Map<string, string[]> {
  const byName = new Map<string, { id: string; filename: string }[]>();
  for (const i of items) if (i.name) { const k = i.name.toLowerCase().trim(); byName.set(k, [...(byName.get(k) ?? []), i]); }
  const out = new Map<string, string[]>();
  for (const group of byName.values()) if (group.length > 1) for (const i of group) out.set(i.id, group.filter((x) => x.id !== i.id).map((x) => x.filename));
  return out;
}

