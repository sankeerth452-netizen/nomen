// The product page around a chosen name: meta title, meta description and a 600-800 word description.
// Written after the name (the name never waits for it), checked in code like the name is: a colour, fabric, length,
// audience, care or sustainability claim, or measurement the buyer didn't give is an error, never a judgement call.
import { db } from "../db";
import { brandWordsFor, insteadTermsIn, parseBrandSettings, PREFERRED_TERMS_RULE, termsForPrompt, type BrandSettings } from "../brand";
import { getProviders, type Providers } from "../providers";
import type { ProductFacts } from "../providers/types";
import { CONTENT_PROMPT_VERSION } from "../prompts";
import { COLOURS, LENGTHS, MATERIALS, classify, singular, withFabricNames, wordStem } from "../vocab/fashion";
import type { PageContent } from "./types";
import { addUsage } from "./usage";
import { KIND_RULES, alsoCalled, kindOf, typeContext, unsupportedClaims, type Kind } from "../category/rules";
import { setPromptVersion, setResultKey } from "./store";

export const META_TITLE_MAX = 60;
export const META_DESCRIPTION_MAX = 160;
/** Asked for 150-160; anything under this is sent back once. */
export const META_DESCRIPTION_MIN = 140;
export const DESCRIPTION_WORDS = [600, 800] as const;

/** What the result screens read: the page, or where its writing stands. */
export type StoredContent =
  | { status: "writing"; for_title: string }
  | { status: "failed"; for_title: string }
  | ({ status: "ready"; for_title: string; words: number } & PageContent);

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const tokens = (s: string) => s.toLowerCase().match(/[a-z0-9]+(?:['-][a-z0-9]+)*/g) ?? [];

// Words that only count as a claim about this product when used as one. "Long" weekend, "short" walk, "full" look.
const NOT_CHECKED = new Set(["neutral", "multi", "short", "long", "full", "knee"]);
const CHECKED = new Set([...COLOURS, ...MATERIALS, ...LENGTHS].filter((w) => !NOT_CHECKED.has(w)).map(singular));
const AUDIENCE = new Set(["girl", "girls", "boy", "boys", "kid", "kids", "baby", "babies", "toddler", "toddlers", "teen", "teens", "men", "mens", "maternity"]);
const CLAIMS = /\b(organic|recycled|sustainabl\w*|eco[- ]friendly|vegan|hand[- ]?(?:made|crafted|stitched|sewn|embroidered|beaded|woven|painted|finished)|artisan\w*|ethical\w*|fair[- ]trade|biodegradable|waterproof|water[- ]resistant|breathable|wrinkle[- ]free|hard[- ]?wearing|durable|durability|long[- ]lasting|built to last|machine[- ]wash\w*|hand[- ]wash\w*|dry[- ]clean\w*|lined|unlined|upf ?\d*\+?|uv[- ]protect\w*|sun[- ]protect\w*)\b/gi;
// Never written, whatever the source says: Google disapproves of them and the brand doesn't want them.
const NEVER = /\b(slimming|slims|slimmer|tummy[- ]control|body[- ]shaping|weight[- ]loss|cures?|therapeutic|pain[- ]relief|anti[- ]?(?:bacterial|microbial)|hypoallergenic|detox\w*)\b/gi;
const MEASURES = /\b\d+(?:\.\d+)?\s?(?:%|cm|mm|inch(?:es)?)/gi;

/** Every word the page may use for the product: the buyer's own words and facts, and the chosen name. */
export function allowedFrom(texts: string[]): Set<string> {
  const set = new Set<string>();
  for (const t of tokens(texts.join(" "))) for (const w of [t, ...t.split("-")]) { set.add(w); set.add(singular(w)); set.add(wordStem(w)); }
  return set;
}

/** Details the page states that the buyer never gave (colour, fabric, length, audience, claims, measurements). */
export function inventedIn(c: PageContent, allowed: Set<string>, sourceText: string, kind: Kind = "apparel"): string[] {
  return inventedInText(`${c.meta_title}\n${c.meta_description}\n${c.description}`, allowed, sourceText, kind);
}

/** The same check for any text: the product data's highlights, details and descriptions use it too. Slimming and health claims always count. */
export function inventedInText(text: string, allowed: Set<string>, sourceText: string, kind: Kind = "apparel"): string[] {
  const known = (w: string) => allowed.has(w) || allowed.has(singular(w)) || allowed.has(wordStem(w));
  const found = new Set<string>();
  for (const t of tokens(text)) {
    const w = singular(t);
    if ((CHECKED.has(w) || (classify(w) === "colour" && !NOT_CHECKED.has(w)) || AUDIENCE.has(t)) && !known(t)) found.add(t);
  }
  const source = sourceText.toLowerCase();
  for (const m of text.matchAll(CLAIMS)) if (!source.includes(m[0].toLowerCase().replace(/-/g, " ")) && !source.includes(m[0].toLowerCase())) found.add(m[0].toLowerCase());
  for (const m of text.matchAll(MEASURES)) if (!source.replace(/\s/g, "").includes(m[0].replace(/\s/g, "").toLowerCase())) found.add(m[0]);
  for (const m of text.matchAll(NEVER)) found.add(m[0].toLowerCase());
  // Each kind's own claims (support for lingerie, the metal for jewellery...) need the retailer's data too.
  for (const c of unsupportedClaims(kind, text, sourceText)) found.add(c);
  return [...found];
}

/** Everything wrong with a page, worded for the one repair attempt. `invented` is kept apart: those never pass. */
export function checkContent(c: PageContent, allowed: Set<string>, sourceText: string, brand: BrandSettings, kind: Kind = "apparel"): { problems: string[]; invented: string[] } {
  const problems: string[] = [];
  if (c.meta_title.length > META_TITLE_MAX) problems.push(`meta_title is ${c.meta_title.length} characters; the limit is ${META_TITLE_MAX}`);
  if (c.meta_description.length > META_DESCRIPTION_MAX) problems.push(`meta_description is ${c.meta_description.length} characters; the limit is ${META_DESCRIPTION_MAX}`);
  if (c.meta_description.length < META_DESCRIPTION_MIN) problems.push(`meta_description is ${c.meta_description.length} characters; it should be 150 to 160, with one benefit and a soft call to action`);
  const n = words(c.description);
  if (n < DESCRIPTION_WORDS[0] || n > DESCRIPTION_WORDS[1]) problems.push(`description is ${n} words; it must be ${DESCRIPTION_WORDS[0]} to ${DESCRIPTION_WORDS[1]}`);
  if (/^\s*(#|[-*•]\s)|\*\*/m.test(c.description)) problems.push("description must be plain paragraphs: no headings, lists or markdown");
  const all = `${c.meta_title} ${c.meta_description} ${c.description}`.toLowerCase();
  for (const b of [...brand.prohibitedTerms, ...brand.avoidWords].filter(Boolean)) if (new RegExp(`\\b${b.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(all)) problems.push(`uses "${b}", which the brand doesn't allow`);
  for (const x of insteadTermsIn(all, brand.profile.terms)) problems.push(`uses "${x.found}": the brand's word is "${x.use}"`);
  const invented = inventedIn(c, allowed, sourceText, kind);
  if (invented.length) problems.push(`states details that are not in the product facts: ${invented.join(", ")}. Remove them, including from styling suggestions`);
  return { problems, invented };
}

/** Last resort after the repair: trim to the limits at a clean boundary (never mid-word, never past a sentence when avoidable). */
export function fitContent(c: PageContent, brandName: string | null): PageContent {
  let title = c.meta_title.trim();
  if (title.length > META_TITLE_MAX && brandName && title.endsWith(` | ${brandName}`)) title = title.slice(0, -` | ${brandName}`.length);
  if (title.length > META_TITLE_MAX) title = title.slice(0, META_TITLE_MAX + 1).replace(/\s+\S*$/, "");
  let meta = c.meta_description.trim().replace(/\s+/g, " ");
  if (meta.length > META_DESCRIPTION_MAX) {
    const cut = meta.slice(0, META_DESCRIPTION_MAX);
    const sentence = cut.lastIndexOf(". ");
    meta = sentence > 80 ? cut.slice(0, sentence + 1) : `${cut.slice(0, META_DESCRIPTION_MAX - 1).replace(/\s+\S*$/, "")}…`;
  }
  let paras = c.description.replace(/\*\*|^#+\s*/gm, "").split(/\n\s*\n/).map((p) => p.trim().replace(/^[-*•]\s+/gm, "")).filter(Boolean);
  while (paras.length > 1 && words(paras.join(" ")) > DESCRIPTION_WORDS[1]) paras = paras.slice(0, -1);
  return { meta_title: title, meta_description: meta, description: paras.join("\n\n") };
}

const setContent = (id: string, content: StoredContent | null) => setResultKey(id, "content", content);

/**
 * Write (or rewrite) the product page for a named piece, for its recommended name or a chosen alternative.
 * Never throws: a page that can't be written is marked "failed" and the name stands on its own.
 */
export async function writeContent(id: string, opts: { title?: string; providers?: Providers } = {}): Promise<void> {
  const g = await db.generation.findUnique({ where: { id }, include: { brand: true } });
  const result = g?.result as { recommendation?: { recommended_title: string } } | null;
  if (!g || g.status !== "completed" || !result?.recommendation) return;
  const title = opts.title ?? result.recommendation.recommended_title;
  await setContent(id, { status: "writing", for_title: title });
  try {
    const providers = opts.providers ?? getProviders();
    const facts = g.extractedFacts as ProductFacts;
    const input = (g.originalInput ?? {}) as Record<string, string | undefined>;
    const brand = parseBrandSettings(g.brand.settings);
    const sourceText = withFabricNames([...Object.values(input).filter((v): v is string => typeof v === "string"), title, ...Object.values(facts).flat().filter((v): v is string => typeof v === "string"), ...alsoCalled(facts.product_type, typeContext(facts))].join(" \n "));
    // The brand's own word for something the facts say ("Ecru" where they say cream) is as true as the facts.
    const brandWords = brandWordsFor(sourceText, brand.profile.terms);
    const allowed = allowedFrom([sourceText, ...brandWords]);
    const kind = kindOf(facts.product_type, [...facts.occasion_or_style, ...facts.features].join(" "));
    const payload = {
      task: "Write the product page for this product.",
      ...(KIND_RULES[kind].claimsNote ? { kind_of_piece: KIND_RULES[kind].label, kind_rules: `${KIND_RULES[kind].claimsNote} (A rule for this kind of product.)` } : {}),
      product_name: title, brand_name: g.brand.name, product_type: facts.product_type,
      product_facts: { colour: facts.colour, material: facts.material, pattern: facts.pattern, fit_or_silhouette: facts.fit_or_silhouette, length: facts.length, features: facts.features, occasion_or_style: facts.occasion_or_style, audience: facts.audience },
      buyer_description: input.freeText ?? null, buyer_notes: input.extra ?? null,
      brand_rules: { prohibited_terms: brand.prohibitedTerms, avoid_words: brand.avoidWords, ...(brand.profile.terms.length ? { preferred_terms: termsForPrompt(brand.profile.terms), preferred_terms_rule: PREFERRED_TERMS_RULE } : {}) },
      ...(brand.profile.audience || brand.profile.tone || brand.profile.descriptionStyle ? { brand_voice: { audience: brand.profile.audience || null, tone: brand.profile.tone || null, description_style: brand.profile.descriptionStyle || null, rule: "Write in this brand's voice, within every rule above. The voice changes how things are said, never what is true: it adds no fact." } } : {}),
      limits: { meta_title_max_characters: META_TITLE_MAX, meta_description_max_characters: META_DESCRIPTION_MAX, description_words: DESCRIPTION_WORDS },
    };
    let r = await providers.content.write(payload);
    await addUsage(id, { ai: r.usage });
    let check = checkContent(r.content, allowed, `${sourceText}\n${brandWords.join(" \n ")}`, brand, kind);
    if (check.problems.length) {
      await addUsage(id, { notes: check.problems.map((p) => `Product page (first draft): ${p}`) });
      r = await providers.content.write(payload, { errors: check.problems, previous: r.content });
      await addUsage(id, { ai: r.usage });
      check = checkContent(r.content, allowed, `${sourceText}\n${brandWords.join(" \n ")}`, brand, kind);
    }
    if (check.invented.length) {
      // Accuracy over completeness: a page that states details the buyer never gave is not shown at all.
      await addUsage(id, { notes: [`Product page not shown: it still stated details not in the facts after one repair (${check.invented.join(", ")})`] });
      await setContent(id, { status: "failed", for_title: title });
      return;
    }
    const page = fitContent(r.content, g.brand.name);
    if (check.problems.length) await addUsage(id, { notes: [`Product page trimmed to fit after one repair: ${check.problems.join("; ")}`] });
    await setContent(id, { status: "ready", for_title: title, words: words(page.description), ...page });
    await setPromptVersion(id, "content", CONTENT_PROMPT_VERSION);
  } catch (e) {
    console.error("product page failed", id, e instanceof Error ? e.message : e);
    await addUsage(id, { notes: [`Product page failed: ${e instanceof Error ? e.message.slice(0, 300) : "unknown error"}`] }).catch(() => undefined);
    await setContent(id, { status: "failed", for_title: title }).catch(() => undefined);
  }
}
