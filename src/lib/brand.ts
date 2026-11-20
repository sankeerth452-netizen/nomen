import { z } from "zod";

/** A brand's own word for something: write `use` wherever the facts say one of `instead` ("Pants", not "trousers"). */
export const BrandTerm = z.object({
  use: z.string().trim().min(1).max(40),
  instead: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
  kind: z.enum(["product", "colour", "category", "other"]).default("other"),
});
export type BrandTerm = z.infer<typeof BrandTerm>;

/** How the brand writes: who it's for, its voice, its words. Followed by the name, the product page and the product data. */
export const BrandProfile = z.object({
  audience: z.string().trim().max(300).default(""),
  tone: z.string().trim().max(300).default(""),
  descriptionStyle: z.string().trim().max(600).default(""),
  seo: z.string().trim().max(300).default(""),
  terms: z.array(BrandTerm).max(60).default([]),
});
export type BrandProfile = z.infer<typeof BrandProfile>;
export const EMPTY_PROFILE: BrandProfile = { audience: "", tone: "", descriptionStyle: "", seo: "", terms: [] };

export const BrandSettings = z.object({
  titleCase: z.enum(["title", "sentence", "lower"]).default("title"),
  maxTitleLength: z.number().int().min(10).max(200).default(70),
  attributeOrder: z.array(z.string()).optional(), // explicit override; unset = learned from the keyword list
  requiredCoreTerms: z.array(z.string()).default([]),
  allowedVocabulary: z.array(z.string()).default([]),
  prohibitedTerms: z.array(z.string()).default([]),
  avoidWords: z.array(z.string()).default([]),
  goodExamples: z.array(z.string()).default([]),
  poorExamples: z.array(z.string()).default([]),
  maxSerpQueries: z.number().int().min(0).max(10).default(3),
  /** How the brand writes (audience, voice, its own words). Empty: Nomen's defaults, as before. */
  profile: BrandProfile.default(EMPTY_PROFILE),
  /** Exports (the Google feed and the review sheet) include only approved products. Off: everything named, as before. */
  approvalRequired: z.boolean().default(false),
  /** Who may do what, when a brand wants it different from the defaults in lib/review/permissions.ts. */
  permissions: z.record(z.string(), z.array(z.enum(["owner", "admin", "editor", "reviewer", "buyer"]))).optional(),
  serp: z.object({ location: z.string().default("Australia"), language: z.string().default("English"), device: z.string().default("desktop") }).default({ location: "Australia", language: "English", device: "desktop" }),
}).passthrough();
export type BrandSettings = z.infer<typeof BrandSettings>;

export const parseBrandSettings = (raw: unknown): BrandSettings => BrandSettings.parse(raw ?? {});

const esc = (w: string) => w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]+");
/** A brand word or phrase in text, in any case and with a plural "s" ("Trousers" finds "trouser"). */
export const hasTerm = (text: string, term: string) => new RegExp(`(^|[^a-z])${esc(term)}s?($|[^a-z])`, "i").test(text);

/** The brand's words that `text` uses in place of its own: [{ found, use }]. */
export function insteadTermsIn(text: string, terms: BrandTerm[]): { found: string; use: string }[] {
  const out: { found: string; use: string }[] = [];
  for (const t of terms) for (const w of t.instead) if (!hasTerm(t.use, w) && hasTerm(text, w)) out.push({ found: w, use: t.use });
  return out;
}

/** The brand's own words that may stand in for what the facts say (the facts say "trousers", the brand says "Pants"). */
export const brandWordsFor = (factsText: string, terms: BrandTerm[]) => terms.filter((t) => t.instead.some((w) => hasTerm(factsText, w))).map((t) => t.use);

/** How the writing steps are told to use the brand's words (sent only when a brand has some). */
export const PREFERRED_TERMS_RULE = "These are the brand's own words: where the facts use a word in instead_of, write the brand's word (use) in its place, and never write an instead_of word.";

/** Preferred words as the writing steps get them. */
export const termsForPrompt = (terms: BrandTerm[]) => terms.map((t) => ({ use: t.use, instead_of: t.instead }));
