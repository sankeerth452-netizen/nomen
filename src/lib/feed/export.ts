// The Google supplemental feed for a product-file range: one row per SKU from the brand's file, with only the fields
// Nomen fills in. Merchant Center matches it to the brand's own feed by id, so price, stock, GTIN, links and shipping
// never leave the brand's feed. Where the brand's file already has a value (colour, gender, category...), it's kept.
import type { ProductSheet } from "../pipeline/sheet";
import { priceBand, type FeedRow } from "./shared";

export type FeedPiece = { name: string; rows: FeedRow[]; sheet: ProductSheet | null };

const amount = (v: string | undefined) => (v ? Number((v.match(/\d+(?:\.\d+)?/) ?? [""])[0]) : NaN);
const clean = (v: string | null | undefined) => (v ?? "").replace(/[\t\r\n]+/g, " ").trim();
const part = (v: string) => clean(v).replace(/:/g, " -");

/** custom_label_4: the brand's own value, else whether this SKU is on sale right now. */
export function saleLabel(a: FeedRow["attrs"]): string {
  if (a.custom_label_4) return a.custom_label_4;
  return a.sale_price && amount(a.sale_price) < amount(a.price) ? "Sale" : a.price ? "Full price" : "";
}

/** One row per SKU, brand values first, Nomen's where the brand's file has none. */
export function feedRows(pieces: FeedPiece[]): Record<string, string | string[]>[] {
  const out: Record<string, string | string[]>[] = [];
  for (const p of pieces) {
    const s = p.sheet, g = s?.google;
    for (const { attrs: a } of p.rows) {
      if (!a.id) continue;
      out.push({
        id: a.id,
        title: p.name,
        description: s?.shortDescription ?? a.description ?? "",
        google_product_category: a.google_product_category ?? (g?.category ? String(g.category.id) : ""),
        product_type: a.product_type ?? g?.productType ?? "",
        color: a.color ?? g?.colour ?? "",
        pattern: a.pattern ?? g?.pattern ?? "",
        material: a.material ?? g?.material ?? "",
        gender: (a.gender ?? g?.gender ?? "").toLowerCase(),
        age_group: (a.age_group ?? g?.ageGroup ?? "").toLowerCase(),
        size_type: (a.size_type ?? g?.sizeType ?? "").toLowerCase(),
        size_system: a.size_system ?? g?.sizeSystem ?? "",
        custom_label_0: a.custom_label_0 ?? g?.customLabels[0] ?? "",
        custom_label_1: a.custom_label_1 ?? g?.customLabels[1] ?? "",
        custom_label_2: a.custom_label_2 ?? priceBand(a.price),
        custom_label_3: a.custom_label_3 ?? "",
        custom_label_4: saleLabel(a),
        product_highlight: s?.highlights ?? [],
        product_detail: (s?.details ?? []).map((d) => `${part(d.section)}:${part(d.name)}:${part(d.value)}`),
      });
    }
  }
  return out;
}

const SINGLE = ["id", "title", "description", "google_product_category", "product_type", "color", "pattern", "material", "gender", "age_group", "size_type", "size_system", "custom_label_0", "custom_label_1", "custom_label_2", "custom_label_3", "custom_label_4"];

/** Tab-separated, as Merchant Center reads it. Highlights and details repeat their column once per value. */
export function supplementalFeed(pieces: FeedPiece[]): string {
  const rows = feedRows(pieces);
  const nh = Math.max(0, ...rows.map((r) => (r.product_highlight as string[]).length));
  const nd = Math.max(0, ...rows.map((r) => (r.product_detail as string[]).length));
  const header = [...SINGLE, ...Array(nh).fill("product_highlight"), ...Array(nd).fill("product_detail")];
  const lines = rows.map((r) => [
    ...SINGLE.map((k) => clean(r[k] as string)),
    ...Array.from({ length: nh }, (_, i) => clean((r.product_highlight as string[])[i])),
    ...Array.from({ length: nd }, (_, i) => clean((r.product_detail as string[])[i])),
  ].join("\t"));
  return [header.join("\t"), ...lines].join("\n") + "\n";
}
