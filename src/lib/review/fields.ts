// The fields a person can check, change and approve for a named product, where the AI's value lives in the stored
// result, and how a person's changes are applied (for the review screen, the range screen and every export).
// No database code: shared by the server and the review screen.
import type { StoredContent } from "../pipeline/content";
import type { StoredSheet } from "../pipeline/sheet";
import { googleCategory } from "../sheet/catalog";
import { OCCASIONS, idealForSentence, type TagVerdict } from "../sheet/idealFor";
import { detailSection } from "../sheet/catalog";

export type FieldKind = "text" | "textarea" | "list" | "details" | "select" | "category" | "occasions";
export type ReviewField = { key: string; label: string; group: string; kind: FieldKind; max?: number; maxItems?: number; options?: readonly string[]; part: "name" | "page" | "sheet" };

export const REVIEW_FIELDS: ReviewField[] = [
  { key: "name", label: "Product name", group: "Name and product page", kind: "text", max: 150, part: "name" },
  { key: "metaTitle", label: "Meta title", group: "Name and product page", kind: "text", max: 70, part: "page" },
  { key: "metaDescription", label: "Meta description", group: "Name and product page", kind: "textarea", max: 200, part: "page" },
  { key: "description", label: "Description", group: "Name and product page", kind: "textarea", max: 8000, part: "page" },
  { key: "shortDescription", label: "Short description (Google)", group: "Product data", kind: "textarea", max: 5000, part: "sheet" },
  { key: "highlights", label: "Highlights", group: "Product data", kind: "list", max: 150, maxItems: 10, part: "sheet" },
  { key: "details", label: "Product details", group: "Product data", kind: "details", maxItems: 30, part: "sheet" },
  { key: "imageAlt", label: "Image alt text", group: "Product data", kind: "text", max: 125, part: "sheet" },
  { key: "care", label: "Care", group: "Product data", kind: "text", max: 300, part: "sheet" },
  { key: "sizeFit", label: "Size and fit", group: "Product data", kind: "text", max: 240, part: "sheet" },
  { key: "category", label: "Google category", group: "Google Shopping", kind: "category", part: "sheet" },
  { key: "productType", label: "Product type (your breadcrumb)", group: "Google Shopping", kind: "text", max: 750, part: "sheet" },
  { key: "colour", label: "Colour", group: "Google Shopping", kind: "text", max: 120, part: "sheet" },
  { key: "pattern", label: "Pattern", group: "Google Shopping", kind: "text", max: 100, part: "sheet" },
  { key: "material", label: "Material", group: "Google Shopping", kind: "text", max: 200, part: "sheet" },
  { key: "gender", label: "Gender", group: "Google Shopping", kind: "select", options: ["Female", "Male", "Unisex"], part: "sheet" },
  { key: "ageGroup", label: "Age group", group: "Google Shopping", kind: "select", options: ["Adult", "Kids", "Toddler", "Infant", "Newborn"], part: "sheet" },
  { key: "sizeType", label: "Size type", group: "Google Shopping", kind: "select", options: ["Regular", "Petite", "Plus", "Tall", "Maternity"], part: "sheet" },
  { key: "idealFor", label: "Ideal for", group: "Occasions and search", kind: "occasions", maxItems: 4, part: "sheet" },
  { key: "keywords", label: "Search phrases to target", group: "Occasions and search", kind: "list", max: 80, maxItems: 8, part: "sheet" },
];
export const FIELD = new Map(REVIEW_FIELDS.map((f) => [f.key, f]));

type Rec = { recommended_title: string; alternatives?: { title: string; trade_off: string }[] } & Record<string, unknown>;
export type ResultLike = { recommendation?: Rec; content?: StoredContent | null; sheet?: StoredSheet | null } & Record<string, unknown>;
export type Edits = Record<string, unknown>;
type Detail = { section: string; name: string; value: string };

/** What the AI wrote for a field (null when that part wasn't written). */
export function aiValue(result: ResultLike | null | undefined, key: string): unknown {
  const r = result?.recommendation;
  const c = result?.content?.status === "ready" ? result.content : null;
  const s = result?.sheet?.status === "ready" ? result.sheet : null;
  switch (key) {
    case "name": return r?.recommended_title ?? null;
    case "metaTitle": return c?.meta_title ?? null;
    case "metaDescription": return c?.meta_description ?? null;
    case "description": return c?.description ?? null;
    case "shortDescription": return s?.shortDescription ?? null;
    case "highlights": return s?.highlights ?? [];
    case "details": return s?.details ?? [];
    case "imageAlt": return s?.imageAlt ?? null;
    case "care": return s?.care ?? null;
    case "sizeFit": return s?.sizeFit ?? null;
    case "category": return s?.google.category ?? null;
    case "productType": return s?.google.productType ?? null;
    case "colour": return s?.google.colour ?? null;
    case "pattern": return s?.google.pattern ?? null;
    case "material": return s?.google.material ?? null;
    case "gender": return s?.google.gender ?? null;
    case "ageGroup": return s?.google.ageGroup ?? null;
    case "sizeType": return s?.google.sizeType ?? null;
    case "idealFor": return s?.idealFor.live.map((t) => t.key) ?? [];
    case "keywords": return s?.searchQueries.map((q) => q.phrase) ?? [];
    default: return null;
  }
}

export const currentValue = (result: ResultLike | null | undefined, edits: Edits, key: string) => (key in edits ? edits[key] : aiValue(result, key));

const occasionVerdict = (key: string): TagVerdict | null => {
  const o = OCCASIONS.find((x) => x.key === key);
  return o ? { key: o.key, label: o.label, outcome: "live", reason: "Chosen in review.", demand: null } : null;
};

/** The result with people's changes applied. Parts the AI didn't write (a failed page or product data) stay as they are. */
export function applyReviewEdits<T extends ResultLike>(result: T, edits: Edits | null | undefined): T {
  if (!edits || !Object.keys(edits).length) return result;
  const out = JSON.parse(JSON.stringify(result)) as T;
  const has = (k: string) => k in edits;
  const str = (k: string) => (edits[k] == null ? null : String(edits[k]));
  if (has("name") && out.recommendation && str("name")) out.recommendation.recommended_title = str("name")!;
  const c = out.content?.status === "ready" ? out.content : null;
  if (c) {
    if (has("metaTitle")) c.meta_title = str("metaTitle") ?? "";
    if (has("metaDescription")) c.meta_description = str("metaDescription") ?? "";
    if (has("description")) { c.description = str("description") ?? ""; c.words = c.description.trim().split(/\s+/).filter(Boolean).length; }
    if (has("name") && str("name")) c.for_title = str("name")!;
  }
  const s = out.sheet?.status === "ready" ? out.sheet : null;
  if (s) {
    if (has("shortDescription")) s.shortDescription = str("shortDescription");
    if (has("highlights")) s.highlights = (edits.highlights as string[]) ?? [];
    if (has("details")) s.details = ((edits.details as Detail[]) ?? []).map((d) => ({ ...d, section: d.section || detailSection(d.name) }));
    if (has("imageAlt")) s.imageAlt = str("imageAlt");
    if (has("care")) s.care = str("care");
    if (has("sizeFit")) s.sizeFit = str("sizeFit");
    if (has("category")) s.google.category = (edits.category as { id: number; path: string } | null) ?? null;
    for (const k of ["productType", "colour", "pattern", "material"] as const) if (has(k)) s.google[k] = str(k);
    for (const k of ["gender", "ageGroup", "sizeType"] as const) if (has(k) && str(k)) (s.google as Record<string, unknown>)[k] = str(k);
    if (has("idealFor")) {
      const live = ((edits.idealFor as string[]) ?? []).map(occasionVerdict).filter((v): v is TagVerdict => !!v);
      s.idealFor = { live, review: s.idealFor.review.filter((v) => !live.some((l) => l.key === v.key)), sentence: idealForSentence(live) };
      s.google.customLabels = [live[0]?.label ?? "", ...s.google.customLabels.slice(1)];
    }
    if (has("keywords")) s.searchQueries = ((edits.keywords as string[]) ?? []).map((p) => s.searchQueries.find((q) => q.phrase === p) ?? { phrase: p, volume: null });
  }
  return out;
}

/** A person's value for a field, cleaned and checked against the field's limits. `category` needs Google's list. */
export function cleanFieldValue(key: string, value: unknown, categories?: Map<number, string>): { value: unknown } | { error: string } {
  const f = FIELD.get(key);
  if (!f) return { error: "That isn't a field you can change." };
  const tooLong = (s: string) => f.max && s.length > f.max;
  switch (f.kind) {
    case "text": case "textarea": {
      if (value != null && typeof value !== "string") return { error: `${f.label} must be text.` };
      const v = (value ?? "").toString().trim();
      if (key === "name" && !v) return { error: "A product needs a name." };
      if (tooLong(v)) return { error: `${f.label} can be at most ${f.max} characters (this is ${v.length}).` };
      return { value: v || null };
    }
    case "select": {
      if (typeof value !== "string" || !f.options!.includes(value)) return { error: `${f.label} must be one of ${f.options!.join(", ")}.` };
      return { value };
    }
    case "list": {
      if (!Array.isArray(value) || value.some((x) => typeof x !== "string")) return { error: `${f.label} must be a list.` };
      const v = value.map((x: string) => x.trim()).filter(Boolean);
      if (f.maxItems && v.length > f.maxItems) return { error: `${f.label} can have at most ${f.maxItems}.` };
      const long = v.find((x) => tooLong(x));
      if (long) return { error: `Each of the ${f.label.toLowerCase()} can be at most ${f.max} characters.` };
      return { value: v };
    }
    case "details": {
      if (!Array.isArray(value)) return { error: "Product details must be a list." };
      const v = (value as Partial<Detail>[]).map((d) => ({ section: String(d.section ?? "").trim(), name: String(d.name ?? "").trim(), value: String(d.value ?? "").trim() })).filter((d) => d.name && d.value);
      if (v.length > (f.maxItems ?? 30)) return { error: `At most ${f.maxItems} product details.` };
      if (v.some((d) => d.name.length > 140 || d.value.length > 1000)) return { error: "A detail's name can be 140 characters and its value 1,000 at most." };
      return { value: v };
    }
    case "category": {
      if (value == null || value === "") return { value: null };
      const id = Number(typeof value === "object" ? (value as { id?: unknown }).id : value);
      const path = categories?.get(id) ?? googleCategory(id)?.path;
      if (!Number.isInteger(id) || !path) return { error: "That isn't a Google category number (for example 2271 for dresses)." };
      return { value: { id, path } };
    }
    case "occasions": {
      if (!Array.isArray(value)) return { error: "Ideal for must be a list." };
      const v = [...new Set(value.map(String))];
      if (v.some((k) => !OCCASIONS.some((o) => o.key === k))) return { error: "That isn't one of the occasions." };
      if (v.length > (f.maxItems ?? 4)) return { error: `At most ${f.maxItems} occasions.` };
      return { value: v };
    }
  }
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "Being written", ai_generated: "AI generated", needs_review: "Needs review", approved: "Approved", rejected: "Rejected", ready_to_export: "Ready to export", published: "Published",
};
export const EXPORTABLE = ["approved", "ready_to_export"];
