// Checks across a whole range: the same web address twice, the same thing named two ways, missing descriptions or
// alt text, mixed size systems, and every attribute against Google's rules. Suggestions only: nothing is changed.
import type { PresentedItem } from "../batch/ranges";
import { slugFor } from "../batch/shared";
import type { ReportRow } from "../batch/report";
import { GOOGLE_RULES as R } from "./googleRules";

// Words that mean exactly the same thing: using both makes names and Google's filters inconsistent.
const SAME_THING: string[][] = [
  ["grey", "gray"], ["multi", "multicolour", "multicolor", "multi-colour"], ["off white", "off-white"],
  ["viscose", "rayon"], ["elastane", "spandex", "lycra"], ["pu", "polyurethane"],
  ["midi", "mid-length", "mid length"], ["tee", "t-shirt", "tshirt"], ["jumper", "sweater"], ["pants", "trousers"], ["sneakers", "trainers"],
];

export function catalogueIssues(items: PresentedItem[], opts: { categories?: Map<number, string>; sizesByItem?: Map<string, string[]>; brandCategoriesByItem?: Map<string, string[]> } = {}): ReportRow[] {
  const out: ReportRow[] = [];
  const who = (i: PresentedItem) => ({ product: i.name ?? i.filename, skus: i.file?.skus.join(" ") ?? "" });
  const named = items.filter((i) => i.status === "named" && i.name);

  // The same web address for two products.
  const slugs = new Map<string, PresentedItem[]>();
  for (const i of named) slugs.set(slugFor(i.name!), [...(slugs.get(slugFor(i.name!)) ?? []), i]);
  for (const [slug, same] of slugs) if (same.length > 1) for (const i of same) out.push({ ...who(i), level: "Error", where: "Catalogue", problem: `Same web address (${slug}) as ${same.filter((x) => x !== i).map((x) => x.filename).join(", ")}` });

  // One thing, two words.
  const text = (i: PresentedItem) => [i.name, i.sheet?.status === "ready" ? i.sheet.google.material : null].filter(Boolean).join(" ").toLowerCase();
  for (const group of SAME_THING) {
    const used = new Map<string, number>();
    for (const i of named) for (const w of group) if (new RegExp(`(^|[^a-z])${w.replace(/[-\s]/g, "[-\\s]?")}($|[^a-z])`).test(text(i))) used.set(w, (used.get(w) ?? 0) + 1);
    if (used.size > 1) out.push({ product: "Whole range", skus: "", level: "Warning", where: "Catalogue", problem: `The same thing is called ${[...used].map(([w, n]) => `"${w}" (${n})`).join(" and ")}: pick one word so names and filters match` });
  }

  for (const i of named) {
    const s = i.sheet?.status === "ready" ? i.sheet : null;
    if (i.page?.status === "failed") out.push({ ...who(i), level: "Warning", where: "Catalogue", problem: "The product page wasn't written" });
    if (!s) continue;
    if (!s.shortDescription) out.push({ ...who(i), level: "Warning", where: "Catalogue", problem: "No short description for Google" });
    if (!s.imageAlt) out.push({ ...who(i), level: "Warning", where: "Catalogue", problem: "No image alt text" });

    // Google's rules.
    const g = s.google;
    const bad = (problem: string) => out.push({ ...who(i), level: "Error", where: "Google rules", problem });
    if (!g.category) bad("No Google category");
    else if (opts.categories?.size && !opts.categories.has(g.category.id)) bad(`Google category ${g.category.id} isn't in Google's current list`);
    if (i.name!.length > R.titleMax) bad(`Title is ${i.name!.length} characters (Google's limit is ${R.titleMax})`);
    const colours = (g.colour ?? "").split("/").filter(Boolean);
    if (colours.length > R.colourParts) bad(`${colours.length} colours (Google takes at most ${R.colourParts})`);
    if (colours.some((c) => c.length > R.colourChars)) bad(`A colour longer than ${R.colourChars} characters`);
    if ((s.shortDescription?.length ?? 0) > R.descriptionMax) bad(`Description over ${R.descriptionMax} characters`);
    if (s.highlights.length > R.highlightsMax) bad(`${s.highlights.length} highlights (Google takes at most ${R.highlightsMax})`);
    if (s.highlights.some((h) => h.length > R.highlightChars)) bad(`A highlight over ${R.highlightChars} characters`);
    if (s.details.some((d) => d.name.length > R.detailNameChars || d.value.length > R.detailValueChars)) bad("A product detail is longer than Google allows");
    if (!(R.genders as readonly string[]).includes(g.gender)) bad(`Gender "${g.gender}" isn't one Google accepts`);
    if (!(R.ageGroups as readonly string[]).includes(g.ageGroup)) bad(`Age group "${g.ageGroup}" isn't one Google accepts`);
    if (!(R.sizeTypes as readonly string[]).includes(g.sizeType)) bad(`Size type "${g.sizeType}" isn't one Google accepts`);
    if (g.customLabels.some((l) => l.length > R.customLabelChars)) bad(`A custom label over ${R.customLabelChars} characters`);
  }

  // The brand's own Google category (passed through to Google as given) must be one Google has: an ID or a full path.
  if (opts.categories?.size) {
    const paths = new Set([...opts.categories.values()].map((p) => p.toLowerCase()));
    const known = (c: string) => /^\d+$/.test(c.trim()) ? opts.categories!.has(Number(c)) : paths.has(c.trim().toLowerCase().replace(/^apparel & accessories/, "clothing & accessories"));
    for (const i of items) for (const c of opts.brandCategoriesByItem?.get(i.id) ?? []) if (!known(c)) out.push({ ...who(i), level: "Error", where: "Google rules", problem: `Your file's Google category "${c}" isn't in Google's list (use its number, like 2271 for dresses)` });
  }

  // Sizes in numbers and letters within one product usually means two size systems got mixed.
  for (const i of items) {
    const sizes = opts.sizesByItem?.get(i.id) ?? [];
    const numeric = sizes.some((z) => /^\d+(\.\d+)?$/.test(z.trim())), letters = sizes.some((z) => /^(xxs|xs|s|m|l|xl|xxl|\dxl|os|one size)$/i.test(z.trim()));
    if (numeric && letters) out.push({ ...who(i), level: "Warning", where: "Catalogue", problem: `Sizes mix numbers and letters (${sizes.join(", ")}): check the size system` });
  }
  return out;
}
