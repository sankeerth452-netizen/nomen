// Reads the brand's product file (a Google Merchant Center feed, a Shopify export, or any spreadsheet the buyer maps),
// checks it the way Google will, and turns it into pieces to name: one per product and colour, with its sizes as rows.
// Everything the brand gave is kept exactly as given; Nomen only adds what it writes.
import type { RowSource } from "../keywords/readers";
import { PRODUCT_TYPE_CATEGORY, singular } from "../vocab/fashion";
import { plainColour } from "../sheet/catalog";
import type { ItemDetails } from "../batch/shared";
import { AVAILABILITY, MAX_FILE_PRODUCTS, REQUIRED, type FeedIssue, type FeedRow, type FeedTarget, type FileCheck } from "./shared";

const norm = (h: string) => h.toLowerCase().replace(/^google shopping\s*\/\s*/, "").replace(/[_\-()]+/g, " ").replace(/\s+/g, " ").trim();

// Header (normalised) -> Google attribute. Google's own names, Shopify's export names and common spreadsheet names.
const ALIASES: Record<string, FeedTarget> = {
  "id": "id", "sku": "id", "variant sku": "id", "product id": "id", "item id": "id", "offer id": "id",
  "title": "title", "product title": "title", "name": "title", "product name": "title",
  "description": "description", "body html": "description", "body": "description", "product description": "description",
  "link": "link", "url": "link", "product url": "link", "product link": "link", "page url": "link",
  "image link": "image_link", "image": "image_link", "image url": "image_link", "image src": "image_link", "main image": "image_link", "main image url": "image_link",
  "additional image link": "additional_image_link", "additional image links": "additional_image_link",
  "availability": "availability", "stock status": "availability",
  "price": "price", "variant price": "price", "regular price": "price",
  "sale price": "sale_price", "sale price effective date": "sale_price_effective_date",
  "brand": "brand", "vendor": "brand", "manufacturer": "brand",
  "condition": "condition", "gtin": "gtin", "barcode": "gtin", "variant barcode": "gtin", "ean": "gtin", "upc": "gtin", "mpn": "mpn",
  "item group id": "item_group_id", "group id": "item_group_id", "parent id": "item_group_id", "parent sku": "item_group_id", "handle": "item_group_id",
  "color": "color", "colour": "color", "size": "size", "gender": "gender", "age group": "age_group",
  "material": "material", "pattern": "pattern", "size type": "size_type", "size system": "size_system",
  "product type": "product_type", "type": "product_type",
  "google product category": "google_product_category", "product category": "google_product_category",
  "custom label 0": "custom_label_0", "custom label 1": "custom_label_1", "custom label 2": "custom_label_2", "custom label 3": "custom_label_3", "custom label 4": "custom_label_4",
  "shipping": "shipping", "shipping weight": "shipping_weight", "is bundle": "is_bundle", "multipack": "multipack", "adult": "adult",
  "excluded destination": "excluded_destination", "canonical link": "canonical_link", "mobile link": "mobile_link", "expiration date": "expiration_date",
};

/** Our best guess of what each column is. Shopify's option, inventory and compare-at columns are read by name, not mapped. */
export function suggestFeedMapping(headers: string[]): Record<string, FeedTarget> {
  const m: Record<string, FeedTarget> = {};
  const taken = new Set<FeedTarget>();
  for (const h of headers) {
    if (!h) continue;
    const t = ALIASES[norm(h)];
    if (t && !taken.has(t)) { m[h] = t; taken.add(t); } else m[h] = /^option\d (name|value)$|variant inventory qty|variant compare at price/i.test(h) ? "metadata" : t ? "ignore" : "metadata";
  }
  return m;
}

export function detectFormat(headers: string[]): string {
  const hs = new Set(headers.map(norm));
  if (hs.has("handle") && (hs.has("variant sku") || hs.has("variant price"))) return "Shopify export";
  if (hs.has("id") && hs.has("image link") && hs.has("availability")) return "Google Merchant Center feed";
  return "Spreadsheet";
}

const ENTITIES: Record<string, string> = { amp: "&", nbsp: " ", quot: '"', "#39": "'", apos: "'", lt: "<", gt: ">", rsquo: "’", lsquo: "‘", ndash: "–", mdash: "—" };
/** Shopify descriptions are HTML: keep the words and the line breaks, drop the markup. */
export function stripHtml(s: string): string {
  return s.replace(/<\s*(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi, "\n").replace(/<li[^>]*>/gi, "• ").replace(/<[^>]+>/g, "")
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e.toLowerCase()] ?? m).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

function normaliseAvailability(v: string): string {
  const s = v.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return s === "instock" ? "in_stock" : s === "outofstock" || s === "sold_out" ? "out_of_stock" : s;
}

const FILL_DOWN: FeedTarget[] = ["title", "description", "brand", "product_type", "google_product_category", "image_link", "link", "gender", "age_group", "material", "pattern", "condition"];

/** Read every row into Google's attribute names. Shopify's one-row-per-variant export is filled down by product. */
export async function readFeed(source: RowSource, mapping: Record<string, FeedTarget>): Promise<{ rows: FeedRow[]; skipped: number; currencyAssumed: number }> {
  const cols = Object.entries(mapping).filter(([, t]) => t !== "ignore" && t !== "metadata");
  const shopify = detectFormat(source.headers) === "Shopify export";
  const rows: FeedRow[] = [];
  const firstOfGroup = new Map<string, FeedRow>();
  const optionNames = new Map<string, string[]>(); // Shopify names options on a product's first row only
  let skipped = 0, currencyAssumed = 0;
  for await (const { rowNumber, cells } of source.rows) {
    const attrs: FeedRow["attrs"] = {};
    for (const [h, t] of cols) {
      const v = cells[h];
      if (v != null && String(v).trim() !== "") attrs[t] = String(v).trim();
    }
    if (shopify) {
      const group = attrs.item_group_id ?? "";
      const names = [1, 2, 3].map((n) => String(cells[`Option${n} Name`] ?? "").trim().toLowerCase());
      if (names.some(Boolean)) optionNames.set(group, names); else names.splice(0, 3, ...(optionNames.get(group) ?? ["", "", ""]));
      [1, 2, 3].forEach((n, i) => {
        const value = String(cells[`Option${n} Value`] ?? "").trim();
        if (!value || /^default title$/i.test(value)) return;
        if (/^(colou?r|shade)$/.test(names[i]) && !attrs.color) attrs.color = value;
        if (/^size$/.test(names[i]) && !attrs.size) attrs.size = value;
      });
      // Shopify's price is what the shopper pays; a higher compare-at price means it's on sale.
      const compare = Number(String(cells["Variant Compare At Price"] ?? "").replace(/[^0-9.]/g, ""));
      const now = Number((attrs.price ?? "").replace(/[^0-9.]/g, ""));
      if (compare && now && compare > now && !attrs.sale_price) { attrs.sale_price = attrs.price; attrs.price = String(compare); }
      const qty = cells["Variant Inventory Qty"];
      if (!attrs.availability && qty != null && String(qty).trim() !== "") attrs.availability = Number(qty) > 0 ? "in_stock" : "out_of_stock";
    }
    // Rows with nothing to sell of their own (Shopify's extra image rows, blank lines) aren't products.
    if (!attrs.id && !attrs.price && !attrs.title) { skipped++; continue; }
    const group = attrs.item_group_id;
    if (group) {
      const first = firstOfGroup.get(group);
      if (first) for (const k of FILL_DOWN) if (!attrs[k] && first.attrs[k]) attrs[k] = first.attrs[k];
    }
    if (attrs.description) attrs.description = stripHtml(attrs.description);
    if (attrs.availability) attrs.availability = normaliseAvailability(attrs.availability);
    for (const k of ["price", "sale_price"] as const) {
      const v = attrs[k];
      if (v && /^\$?\s*\d+(\.\d+)?$/.test(v)) { attrs[k] = `${Number(v.replace(/[$\s]/g, "")).toFixed(2)} AUD`; currencyAssumed++; }
    }
    const row = { row: rowNumber, attrs };
    if (group && !firstOfGroup.has(group)) firstOfGroup.set(group, row);
    rows.push(row);
  }
  return { rows, skipped, currencyAssumed };
}

const isUrl = (v: string | undefined) => !!v && /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v);
const amount = (v: string | undefined) => (v ? Number((v.match(/\d+(?:\.\d+)?/) ?? [""])[0]) : NaN);
const LABEL: Partial<Record<FeedTarget, string>> = { id: "ID (SKU)", link: "product link", image_link: "image link", availability: "availability", price: "price", brand: "brand", condition: "condition" };

/** Google's checks, in plain words: per row (shown on each piece) and per kind (the file summary). Never fixes anything. */
export function checkFeed(rows: FeedRow[]): { issues: FeedIssue[]; byRow: Map<number, string[]> } {
  const kinds = new Map<string, FeedIssue>();
  const byRow = new Map<number, string[]>();
  const add = (kind: string, level: FeedIssue["level"], message: string, row: number, rowMessage = message) => {
    const k = kinds.get(kind) ?? kinds.set(kind, { kind, level, message, rows: [] }).get(kind)!;
    k.rows.push(row);
    byRow.set(row, [...(byRow.get(row) ?? []), rowMessage]);
  };
  const ids = new Map<string, number>();
  // Rows that look like sizes or colours of one product: same title, no item group ID.
  const titles = new Map<string, number>();
  for (const { attrs: a } of rows) if (a.title && !a.item_group_id) titles.set(a.title.toLowerCase(), (titles.get(a.title.toLowerCase()) ?? 0) + 1);
  for (const { row, attrs: a } of rows) {
    for (const r of REQUIRED) if (!a[r]) add(`missing_${r}`, "error", `No ${LABEL[r]}: Google needs one for every product`, row, `No ${LABEL[r]}`);
    if (a.availability && !AVAILABILITY.includes(a.availability)) add("bad_availability", "error", `Availability Google doesn't accept (use ${AVAILABILITY.join(", ")})`, row, `Availability "${a.availability}" isn't one Google accepts`);
    if (a.price && (Number.isNaN(amount(a.price)) || !/[A-Z]{3}/.test(a.price))) add("bad_price", "error", "Price Google can't read (it needs a number and a currency, like 59.95 AUD)", row, `Price "${a.price}" can't be read`);
    if (a.sale_price && a.price && amount(a.sale_price) >= amount(a.price)) add("sale_not_lower", "error", "Sale price isn't lower than the price", row);
    if (a.link && !isUrl(a.link)) add("bad_link", "error", "Product link isn't a full web address", row);
    if (a.image_link && !isUrl(a.image_link)) add("bad_image_link", "error", "Image link isn't a full web address", row);
    if (a.condition && !["new", "refurbished", "used"].includes(a.condition.toLowerCase())) add("bad_condition", "error", "Condition must be new, refurbished or used", row);
    if (a.id) {
      if (ids.has(a.id)) add("duplicate_id", "error", "The same ID is used on more than one row", row, `ID ${a.id} is also on row ${ids.get(a.id)}`);
      else ids.set(a.id, row);
    }
    if (!a.gtin && !a.mpn) add("no_gtin_mpn", "warning", "No GTIN or MPN (recommended: Google matches products by them)", row, "No GTIN or MPN");
    if (a.color) {
      // Google wants the plain colour; a shade name ("cocoa", "light wash") belongs in the title and description.
      const plain = a.color.split("/").map((c) => plainColour(c) ?? c.trim());
      if (plain.join("/").toLowerCase() !== a.color.replace(/\s*\/\s*/g, "/").toLowerCase()) add("plain_colour", "warning", "Colour isn't a plain colour name, which Google prefers", row, `Colour "${a.color}": Google prefers "${plain.join("/")}"`);
    }
    if ((a.size || a.color) && !a.item_group_id && (titles.get((a.title ?? "").toLowerCase()) ?? 0) > 1) add("variant_no_group", "error", "Sizes or colours of one product with no item group ID: Google lists them separately or rejects them", row, "A size or colour of a product with no item group ID");
  }
  // Within a group, every row needs a colour or size, and no two rows can be the same colour and size.
  const groups = new Map<string, FeedRow[]>();
  for (const r of rows) if (r.attrs.item_group_id) groups.set(r.attrs.item_group_id, [...(groups.get(r.attrs.item_group_id) ?? []), r]);
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const seen = new Map<string, number>();
    for (const { row, attrs: a } of g) {
      if (!a.color) add("group_no_colour", "error", "A variant has no colour: Google needs colour and size on every variant in a group", row, "No colour on this variant");
      if (!a.size) add("group_no_size", "error", "A variant has no size: Google needs colour and size on every variant in a group", row, "No size on this variant");
      const k = `${(a.color ?? "").toLowerCase()}|${(a.size ?? "").toLowerCase()}`;
      if (seen.has(k) && (a.color || a.size)) add("group_duplicate", "error", "Two variants in one group have the same colour and size", row, `Same colour and size as row ${seen.get(k)}`);
      else seen.set(k, row);
    }
  }
  const order = { error: 0, warning: 1, info: 2 };
  return { issues: [...kinds.values()].sort((a, b) => order[a.level] - order[b.level] || b.rows.length - a.rows.length), byRow };
}

/** One piece per product and colour: its sizes are named once and share the name. */
export function groupProducts(rows: FeedRow[]): FeedRow[][] {
  const groups = new Map<string, FeedRow[]>();
  for (const r of rows) {
    const base = r.attrs.item_group_id ?? (r.attrs.title ? `title:${r.attrs.title.toLowerCase()}` : `row:${r.row}`);
    const key = `${base}|${(r.attrs.color ?? "").toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()];
}

// Nouns that only come in the plural ("Riley Jean" is a pair of jeans).
const PAIRS: Record<string, string> = { jean: "jeans", short: "shorts", pant: "pants", trouser: "trousers", legging: "leggings", jogger: "joggers", sunglass: "sunglasses" };

/** The product noun in a title ("Cocoa Satin Slip Dress" -> "dress"), or from the brand's product type. */
export function productNoun(title: string | undefined, productType: string | undefined): string {
  const words = (title ?? "").toLowerCase().match(/[a-z]+(?:-[a-z]+)*/g) ?? [];
  for (let i = words.length - 1; i >= 0; i--) if (PRODUCT_TYPE_CATEGORY[singular(words[i])] || PRODUCT_TYPE_CATEGORY[words[i]]) return PAIRS[singular(words[i])] ?? words[i];
  const last = (productType ?? "").split(">").pop()?.trim().toLowerCase() ?? "";
  const lw = last.match(/[a-z]+(?:-[a-z]+)*/g) ?? [];
  for (let i = lw.length - 1; i >= 0; i--) if (PRODUCT_TYPE_CATEGORY[singular(lw[i])]) return singular(lw[i]);
  return last.slice(0, 60);
}

function audienceFrom(gender: string | undefined, age: string | undefined): string | undefined {
  const g = (gender ?? "").toLowerCase(), a = (age ?? "").toLowerCase();
  if (["newborn", "infant", "toddler"].includes(a)) return "baby";
  if (a === "kids") return g === "female" ? "girls" : g === "male" ? "boys" : "kids";
  if (g === "male") return "men";
  return undefined;
}

/** The details a piece is named from, straight from the brand's file: its title, description and attributes. */
export function detailsFromFeed(rows: FeedRow[]): ItemDetails {
  const a = rows[0].attrs;
  const fields: ItemDetails["fields"] = {};
  const put = (k: keyof ItemDetails["fields"], v: string | undefined, max = 120) => { if (v?.trim()) fields[k] = v.trim().slice(0, max); };
  put("productType", productNoun(a.title, a.product_type), 60);
  put("freeText", a.title ?? a.description?.slice(0, 200), 500);
  put("colour", a.color);
  put("material", a.material);
  put("pattern", a.pattern);
  put("audience", audienceFrom(a.gender, a.age_group));
  if (a.size_type && /maternity|petite|plus|tall/i.test(a.size_type)) put("fit", a.size_type.toLowerCase());
  put("extra", a.description, 2000);
  return { fields, fromPhoto: [], unsure: [] };
}

export type ImportedPiece = { filename: string; imageUrl: string | null; details: ItemDetails; rows: FeedRow[]; issues: string[] };

/** The whole import: read, check, group, and the details for each piece. Only the first MAX_FILE_PRODUCTS products are kept. */
export async function importFeed(source: RowSource, mapping: Record<string, FeedTarget>): Promise<{ pieces: ImportedPiece[]; check: FileCheck }> {
  const format = detectFormat(source.headers);
  const { rows, skipped, currencyAssumed } = await readFeed(source, mapping);
  if (!rows.length) throw new Error("We couldn't find any products in that file.");
  const { issues, byRow } = checkFeed(rows);
  if (currencyAssumed) issues.push({ kind: "currency_assumed", level: "info", message: "Prices without a currency were read as Australian dollars (AUD)", rows: [] });
  const groups = groupProducts(rows);
  const pieces = groups.slice(0, MAX_FILE_PRODUCTS).map((g) => {
    const a = g[0].attrs;
    const label = [a.title ?? `Row ${g[0].row}`, a.color].filter(Boolean).join(" · ");
    return {
      filename: label.slice(0, 160), imageUrl: g.find((r) => r.attrs.image_link)?.attrs.image_link ?? null,
      details: detailsFromFeed(g), rows: g, issues: [...new Set(g.flatMap((r) => (byRow.get(r.row) ?? []).map((m) => (g.length > 1 ? `${r.attrs.size ?? `Row ${r.row}`}: ${m}` : m))))],
    };
  });
  return { pieces, check: { format, rows: rows.length, products: groups.length, skippedRows: skipped, leftOut: Math.max(0, groups.length - MAX_FILE_PRODUCTS), issues } };
}
