// The brand's product file, as Google Merchant Center names its columns. Shared by the server and the range screen
// (no database code here). The brand supplies these; Nomen passes them through and checks them, but never invents them.

export type FeedTarget =
  | "id" | "title" | "description" | "link" | "image_link" | "additional_image_link" | "availability" | "price" | "sale_price" | "sale_price_effective_date"
  | "brand" | "condition" | "gtin" | "mpn" | "item_group_id" | "color" | "size" | "gender" | "age_group" | "material" | "pattern" | "size_type" | "size_system"
  | "product_type" | "google_product_category" | "custom_label_0" | "custom_label_1" | "custom_label_2" | "custom_label_3" | "custom_label_4"
  | "shipping" | "shipping_weight" | "is_bundle" | "multipack" | "adult" | "excluded_destination" | "canonical_link" | "mobile_link" | "expiration_date"
  | "metadata" | "ignore";

/** Column roles a buyer can pick when matching their file's columns, in Google's own words with a plain label. */
export const FEED_TARGETS: [FeedTarget, string][] = [
  ["id", "ID or SKU"], ["title", "Title"], ["description", "Description"], ["link", "Product link"], ["image_link", "Image link"],
  ["additional_image_link", "More image links"], ["availability", "Availability"], ["price", "Price"], ["sale_price", "Sale price"],
  ["sale_price_effective_date", "Sale dates"], ["brand", "Brand"], ["condition", "Condition"], ["gtin", "GTIN (barcode)"], ["mpn", "MPN"],
  ["item_group_id", "Item group ID (variants)"], ["color", "Colour"], ["size", "Size"], ["gender", "Gender"], ["age_group", "Age group"],
  ["material", "Material"], ["pattern", "Pattern"], ["size_type", "Size type"], ["size_system", "Size system"], ["product_type", "Product type"],
  ["google_product_category", "Google category"], ["custom_label_0", "Custom label 0"], ["custom_label_1", "Custom label 1"], ["custom_label_2", "Custom label 2"],
  ["custom_label_3", "Custom label 3"], ["custom_label_4", "Custom label 4"], ["shipping", "Shipping"], ["shipping_weight", "Shipping weight"],
  ["is_bundle", "Is bundle"], ["multipack", "Multipack"], ["adult", "Adult"], ["excluded_destination", "Excluded destination"],
  ["canonical_link", "Canonical link"], ["mobile_link", "Mobile link"], ["expiration_date", "Expiration date"],
  ["metadata", "Keep as extra info"], ["ignore", "Don't use"],
];

/** Google rejects a product without these (Nitin's list). */
export const REQUIRED: FeedTarget[] = ["id", "link", "image_link", "availability", "price", "brand", "condition"];
export const AVAILABILITY = ["in_stock", "out_of_stock", "preorder", "backorder"];

/** At most this many products (size and colour groups) in one range, so a whole catalogue can't run up a surprise bill. */
export const MAX_FILE_PRODUCTS = 200;

/** One row of the brand's file (one SKU), in Google's attribute names, exactly as the brand gave it. */
export type FeedRow = { row: number; attrs: Partial<Record<FeedTarget, string>> };
/** What a product-file piece carries: its rows (sizes), and the checks that apply to them. */
export type PieceFeed = { rows: FeedRow[]; issues: string[]; imageError?: string };
export type FeedIssue = { kind: string; level: "error" | "warning" | "info"; message: string; rows: number[] };
export type FileCheck = { format: string; rows: number; products: number; skippedRows: number; leftOut: number; issues: FeedIssue[] };

/** Price band for custom label 2, from the brand's own price ("29.95 AUD"). */
export function priceBand(price: string | undefined): string {
  const n = Number((price ?? "").replace(/[^0-9.]/g, ""));
  if (!n) return "";
  return n < 50 ? "Under $50" : n < 100 ? "$50 to $99" : n < 200 ? "$100 to $199" : "$200 and over";
}
