// The product data sheet: everything Google Shopping and a product page need beyond the name. Rules decide what they
// can (category, colour, pattern, material, gender, sizes, search queries); Claude writes the words (highlights,
// details, short description, alt text) and suggests occasions and season, and every word is checked like the name is.
import { db } from "../db";
import { getProviders, type Providers } from "../providers";
import type { ProductFacts } from "../providers/types";
import { SHEET_PROMPT_VERSION } from "../prompts";
import { normalizeKeyword } from "../keywords/normalize";
import { breadcrumbFor, categoryFor, detailNamesFor, detailSection, genderAge, googleCategory, googleColour, googleMaterial, googlePattern, sizeType, type GoogleCategory } from "../sheet/catalog";
import { demandPhrases, idealForSentence, judgeSeason, judgeTags, occasion, type Season, type TagVerdict } from "../sheet/idealFor";
import { allowedFrom, inventedInText } from "./content";
import { setPromptVersion, setResultKey } from "./store";
import type { EvidenceBundle, SheetDraft } from "./types";
import { addUsage } from "./usage";

export const HIGHLIGHTS = [2, 6] as const;
export const HIGHLIGHT_MAX = 150; // Google's limit per highlight
export const SHORT_DESCRIPTION = [500, 1000] as const; // characters, the target agreed with the brand (Google allows 5,000)
export const ALT_MAX = 125;

export type ProductSheet = {
  google: {
    category: GoogleCategory | null; productType: string | null; colour: string | null; pattern: string | null; material: string | null;
    gender: string; ageGroup: string; sizeType: string; sizeSystem: "AU";
    /** custom_label_0..4: occasion, season; the rest come from the brand's own data (price band, margin, new or sale). */
    customLabels: string[];
  };
  highlights: string[];
  details: { section: string; name: string; value: string }[];
  shortDescription: string | null;
  idealFor: { live: TagVerdict[]; review: TagVerdict[]; sentence: string | null };
  season: Season | null;
  care: string | null;
  imageAlt: string | null;
  searchQueries: { phrase: string; volume: number | null }[];
  /** Things a person should look at before this goes live, in plain words. */
  checks: string[];
};
export type StoredSheet = { status: "writing" } | { status: "failed" } | ({ status: "ready" } & ProductSheet);

type Ctx = { facts: ProductFacts; allowed: Set<string>; source: string; detailNames: string[] };
const MARKDOWN = /^\s*(#|[-*•]\s)|\*\*/m;
const CARE_WORDS = /\b(wash|washing|dry ?clean|tumble|iron|bleach|line dry|dry flat|cold|gentle|hand wash|machine)\b/i;

/** What's wrong with Claude's draft, worded for the one repair, and which parts must not be used as they are. */
export function checkSheet(d: SheetDraft, ctx: Ctx) {
  const problems: string[] = [];
  const invented = (t: string) => inventedInText(t, ctx.allowed, ctx.source);
  const badHighlights = new Set<number>(), badDetails = new Set<number>();
  let badShort = false, badCare = false, badAlt = false;

  if (d.highlights.length < HIGHLIGHTS[0] || d.highlights.length > HIGHLIGHTS[1]) problems.push(`highlights has ${d.highlights.length} items; it must have ${HIGHLIGHTS[0]} to ${HIGHLIGHTS[1]}`);
  d.highlights.forEach((h, i) => {
    const inv = invented(h);
    if (inv.length) { badHighlights.add(i); problems.push(`highlight "${h}" states details that are not in the facts: ${inv.join(", ")}`); }
    if (h.length > HIGHLIGHT_MAX) problems.push(`highlight "${h.slice(0, 40)}…" is ${h.length} characters; keep each under 70`);
  });
  d.details.forEach((x, i) => {
    if (!ctx.detailNames.includes(x.name)) { badDetails.add(i); problems.push(`detail name "${x.name}" isn't one of detail_names`); return; }
    const inv = invented(`${x.name} ${x.value}`);
    if (inv.length) { badDetails.add(i); problems.push(`detail "${x.name}: ${x.value}" states details that are not in the facts: ${inv.join(", ")}`); }
  });
  const sd = d.short_description.trim();
  if (sd.length < 400 || sd.length > 950) problems.push(`short_description is ${sd.length} characters; it must be 450 to 900`);
  if (MARKDOWN.test(sd)) problems.push("short_description must be plain text: no headings, lists or markdown");
  const invSd = invented(sd);
  if (invSd.length) { badShort = true; problems.push(`short_description states details that are not in the facts: ${invSd.join(", ")}`); }
  if (d.care) {
    if (!CARE_WORDS.test(ctx.source)) { badCare = true; problems.push("care instructions weren't given in the facts or notes; set care to null"); }
    else { const inv = invented(d.care); if (inv.length) { badCare = true; problems.push(`care states things that are not in the facts: ${inv.join(", ")}`); } }
  }
  const alt = d.image_alt.trim();
  if (alt.length > ALT_MAX) problems.push(`image_alt is ${alt.length} characters; keep it under ${ALT_MAX}`);
  if (/^(an? )?(image|photo|picture) of\b/i.test(alt)) problems.push('image_alt must not start with "Image of"');
  const invAlt = invented(alt);
  if (invAlt.length) { badAlt = true; problems.push(`image_alt states details that are not in the facts: ${invAlt.join(", ")}`); }
  return { problems, badHighlights, badDetails, badShort, badCare, badAlt };
}

/** Cut text to a limit at a sentence end (or a word, with "…"), never mid-word. */
export function fitText(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.endsWith(".") ? cut.length - 1 : -1);
  return end > max * 0.5 ? cut.slice(0, end + 1) : `${cut.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

/** The finished sheet from Claude's (checked) draft plus everything the rules decide. Pure: no database, so it's tested directly. */
export function assembleSheet(d: SheetDraft, check: ReturnType<typeof checkSheet>, ctx: Ctx & {
  volumes: Map<string, number> | null; bundle: EvidenceBundle | null; cited: string[]; inputText: string;
}): ProductSheet {
  const { facts } = ctx;
  const checks: string[] = [];

  const highlights = d.highlights.filter((_, i) => !check.badHighlights.has(i)).slice(0, HIGHLIGHTS[1]).map((h) => fitText(h.replace(/[.\s]+$/, ""), HIGHLIGHT_MAX));
  if (highlights.length < HIGHLIGHTS[0]) checks.push("Fewer than two highlights could be written from the details given.");
  const seenNames = new Set<string>();
  const details = d.details.filter((x, i) => !check.badDetails.has(i) && !seenNames.has(x.name) && seenNames.add(x.name)).map((x) => ({ section: detailSection(x.name), name: x.name, value: x.value.trim() }));

  const verdicts = judgeTags(d.ideal_for, facts, ctx.volumes, ctx.inputText);
  const live = verdicts.filter((v) => v.outcome === "live"), review = verdicts.filter((v) => v.outcome === "review");
  const sentence = idealForSentence(verdicts);
  if (review.length) checks.push(`${review.length === 1 ? "One occasion needs" : `${review.length} occasions need`} a check before use: ${review.map((r) => r.label).join(", ")}.`);

  let shortDescription: string | null = null;
  if (check.badShort) checks.push("The short description isn't shown: it needed details we weren't given. Try again, or add more detail.");
  else {
    const room = SHORT_DESCRIPTION[1] - (sentence ? sentence.length + 1 : 0);
    shortDescription = [fitText(d.short_description, room), sentence].filter(Boolean).join(" ");
    if (shortDescription.length < SHORT_DESCRIPTION[0]) checks.push(`The short description is ${shortDescription.length} characters; ${SHORT_DESCRIPTION[0]} to ${SHORT_DESCRIPTION[1]} reads best on Google.`);
  }

  let category = categoryFor(facts);
  if (!category && d.google_category_id != null) {
    category = googleCategory(d.google_category_id);
    if (category) checks.push("Check the Google category: no rule covered this kind of piece, so it was chosen for you.");
  }
  if (!category) checks.push("No Google category: choose one for this piece before it goes to Google.");
  const colour = googleColour(facts.colour);
  if (!colour.value) checks.push("No colour given: Google needs one for clothing.");
  for (const u of colour.unmapped) checks.push(`Check the colour: we couldn't match "${u}" to a plain colour, so it's sent as written.`);
  const material = googleMaterial(facts.material);
  if (!material) checks.push("Material left blank: it wasn't given, and it's never guessed.");
  const season = judgeSeason(d.season, facts);
  if (season?.confidence === "low") checks.push(`Check the season (${season.value}): ${season.reason}`);
  const ga = genderAge(facts.audience);

  // The phrases the name is built to rank for: the ones it cites first, then the strongest matches, with monthly searches.
  const searchQueries: ProductSheet["searchQueries"] = [];
  if (ctx.bundle && !ctx.bundle.limitedKeywordEvidence) {
    const vol = new Map(ctx.bundle.keywords.map((k) => [k.keyword, k.searchVolume]));
    const clean = ctx.bundle.keywords.filter((k) => !k.flags.some((f) => /informational|promo|unsupported|missing_product_type/.test(f))).sort((a, b) => b.score - a.score).map((k) => k.keyword);
    for (const p of [...ctx.cited, ...clean]) if (p && !searchQueries.some((q) => q.phrase === p) && searchQueries.length < 5) searchQueries.push({ phrase: p, volume: vol.get(p) ?? null });
  }

  return {
    google: {
      category, productType: breadcrumbFor(facts), colour: colour.value, pattern: googlePattern(facts.pattern), material,
      gender: ga.gender, ageGroup: ga.ageGroup, sizeType: sizeType(ctx.inputText), sizeSystem: "AU",
      customLabels: [live[0]?.label ?? "", season?.confidence === "high" ? season.value[0].toUpperCase() + season.value.slice(1) : "", "", "", ""],
    },
    highlights, details, shortDescription,
    idealFor: { live, review, sentence },
    season, care: check.badCare ? null : d.care?.trim() || null,
    imageAlt: check.badAlt ? null : fitText(d.image_alt, ALT_MAX),
    searchQueries, checks,
  };
}

/** Monthly searches for each occasion's demand phrases in the keyword list the name used; null when there is none. */
async function occasionVolumes(datasetId: string | null, tags: string[], productType: string | null): Promise<Map<string, number> | null> {
  if (!datasetId) return null;
  const phrases = [...new Set(tags.flatMap((t) => { const o = occasion(t); return o ? demandPhrases(o, productType).map(normalizeKeyword) : []; }))];
  const m = new Map<string, number>();
  if (!phrases.length) return m;
  const rows = await db.keyword.findMany({ where: { datasetId, normalizedKeyword: { in: phrases } }, select: { normalizedKeyword: true, searchVolume: true } });
  for (const r of rows) m.set(r.normalizedKeyword, Math.max(m.get(r.normalizedKeyword) ?? 0, r.searchVolume ?? 0));
  return m;
}

const setSheet = (id: string, sheet: StoredSheet | null) => setResultKey(id, "sheet", sheet);

/** Write the product data sheet for a named piece. Never throws: a sheet that can't be written is marked "failed". */
export async function writeSheet(id: string, opts: { providers?: Providers } = {}): Promise<void> {
  const g = await db.generation.findUnique({ where: { id }, include: { brand: true, photo: { select: { generationId: true } } } });
  const result = g?.result as { recommendation?: { recommended_title: string; primary_keyword: string | null; supporting_keywords: string[] } } | null;
  if (!g || g.status !== "completed" || !result?.recommendation) return;
  await setSheet(id, { status: "writing" });
  try {
    const providers = opts.providers ?? getProviders();
    const facts = g.extractedFacts as ProductFacts;
    const input = (g.originalInput ?? {}) as Record<string, string | undefined>;
    const title = result.recommendation.recommended_title;
    const inputText = Object.values(input).filter((v): v is string => typeof v === "string").join(" \n ");
    const source = [inputText, title, ...Object.values(facts).flat().filter((v): v is string => typeof v === "string")].join(" \n ");
    const ctx: Ctx = { facts, allowed: allowedFrom([source]), source, detailNames: detailNamesFor(facts) };
    const payload = {
      task: "Fill in the product data for this product.",
      product_name: title, brand_name: g.brand.name, product_type: facts.product_type,
      product_facts: { colour: facts.colour, material: facts.material, pattern: facts.pattern, fit_or_silhouette: facts.fit_or_silhouette, length: facts.length, features: facts.features, occasion_or_style: facts.occasion_or_style, audience: facts.audience },
      buyer_description: input.freeText ?? null, buyer_notes: input.extra ?? null, has_photo: !!g.photo,
      detail_names: ctx.detailNames,
      category_needed: !categoryFor(facts),
      limits: { highlights: "2 to 6, each under 70 characters", short_description_characters: [450, 900], image_alt_max_characters: ALT_MAX },
    };
    let r = await providers.sheet.write(payload);
    await addUsage(id, { ai: r.usage });
    let check = checkSheet(r.sheet, ctx);
    if (check.problems.length) {
      await addUsage(id, { notes: check.problems.map((p) => `Product data (first draft): ${p}`) });
      r = await providers.sheet.write(payload, { errors: check.problems, previous: r.sheet });
      await addUsage(id, { ai: r.usage });
      check = checkSheet(r.sheet, ctx);
      if (check.problems.length) await addUsage(id, { notes: [`Product data after one repair, cleaned in code: ${check.problems.join("; ")}`] });
    }
    // Demand for occasions comes from the brand's current keyword list, so filling it in again after a new upload uses the new numbers.
    const volumes = await occasionVolumes(g.brand.activeKeywordDatasetId ?? g.datasetId, r.sheet.ideal_for.map((t) => t.tag), facts.product_type);
    const sheet = assembleSheet(r.sheet, check, {
      ...ctx, volumes, bundle: g.candidateEvidence as EvidenceBundle | null, inputText,
      cited: [result.recommendation.primary_keyword ?? "", ...result.recommendation.supporting_keywords].filter(Boolean),
    });
    const dropped = [...sheet.idealFor.live, ...sheet.idealFor.review].length < r.sheet.ideal_for.length;
    if (dropped) await addUsage(id, { notes: [`Product data: occasions left out: ${judgeTags(r.sheet.ideal_for, facts, volumes, inputText).filter((v) => v.outcome === "dropped").map((v) => `${v.key} (${v.reason})`).join("; ")}`] });
    await setSheet(id, { status: "ready", ...sheet });
    await setPromptVersion(id, "sheet", SHEET_PROMPT_VERSION);
  } catch (e) {
    console.error("product data failed", id, e instanceof Error ? e.message : e);
    await addUsage(id, { notes: [`Product data failed: ${e instanceof Error ? e.message.slice(0, 300) : "unknown error"}`] }).catch(() => undefined);
    await setSheet(id, { status: "failed" }).catch(() => undefined);
  }
}

