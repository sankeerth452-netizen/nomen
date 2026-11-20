// Provider interfaces. The pipeline depends on these, never on a vendor SDK directly,
// so mocks, caching and a future background worker slot in without touching domain logic.

export type ProductFacts = {
  product_type: string | null;
  colour: string[];
  material: string[];
  pattern: string[];
  fit_or_silhouette: string[];
  length: string[];
  features: string[];
  occasion_or_style: string[];
  audience: string | null;
  buyer_terms: string[];
  unknowns: string[];
  conflicts: string[];
};

export type SerpResult = {
  rank: number;
  title: string;
  domain: string;
  url: string;
  resultType: string;
  snippet: string;
  pageClass: "product" | "category" | "editorial" | "marketplace" | "other";
};

export type SerpResponse = { query: string; checkedAt: string; results: SerpResult[]; costUsd?: number };

/** model: the model that actually answered (with refusal fallbacks on, it can differ from the one requested). */
export type AiUsage = { inputTokens: number; outputTokens: number; model?: string; cacheReadTokens?: number; cacheWriteTokens?: number };

export class AiError extends Error {
  constructor(message: string, public code: "ai_unavailable" | "ai_refusal" | "ai_invalid") {
    super(message);
  }
}

export interface FactExtractor {
  extract(input: { freeText: string; fields: Record<string, string | undefined> }): Promise<{ facts: ProductFacts; usage: AiUsage }>;
}

export interface SerpProvider {
  /** Keeps cached results from different sources apart: example (mock) results must never be served as real ones. Default "live". */
  readonly cacheNamespace?: string;
  search(opts: { query: string; location: string; language: string; device: string; depth: number }): Promise<SerpResponse>;
}

/** `payload` is the compact JSON evidence bundle. `repair` is set on the single repair attempt. */
export interface Recommender {
  recommend(payload: Record<string, unknown>, repair?: { errors: string[]; previous: unknown }): Promise<{ recommendation: import("../pipeline/types").Recommendation; usage: AiUsage }>;
}

/** Reads a product photo into the details a buyer would type. They pre-fill the form; the buyer checks them before naming. */
export interface PhotoReader {
  /** `extras`: more photos of the same piece (back, side, details), read together with the main one. */
  read(input: { image: import("../photo").Photo; extras?: import("../photo").Photo[]; productType?: string }): Promise<{ details: import("../pipeline/types").PhotoDetails; usage: AiUsage }>;
}

/** Writes the product page (meta title, meta description, description) around a chosen name. `repair` on the single retry. */
export interface ContentWriter {
  write(payload: Record<string, unknown>, repair?: { errors: string[]; previous: unknown }): Promise<{ content: import("../pipeline/types").PageContent; usage: AiUsage }>;
}

/** Live Google search figures (DataForSEO Labs, Australia): monthly searches for phrases, and phrases shoppers use around a seed. */
export interface KeywordDataProvider {
  /** Keeps cached figures from different sources apart: example (mock) figures must never be served as real ones. */
  readonly cacheNamespace: string;
  /** Monthly searches for each phrase; null when Google has no figure for it. */
  volumes(phrases: string[]): Promise<{ volumes: Record<string, number | null>; costUsd: number }>;
  /** Searched phrases containing the seed, most searched first. */
  suggestions(seed: string, limit: number): Promise<{ items: { keyword: string; volume: number }[]; costUsd: number }>;
}

export interface SheetWriter {
  write(payload: Record<string, unknown>, repair?: { errors: string[]; previous: unknown }): Promise<{ sheet: import("../pipeline/types").SheetDraft; usage: AiUsage }>;
}

/** Reads a sample of a brand's own approved products and says how the brand writes (for the brand profile, checked by an admin). */
export interface StyleReader {
  describe(samples: { title: string; description?: string }[]): Promise<{ voice: { tone: string; audience: string; description_style: string }; usage: AiUsage }>;
}
