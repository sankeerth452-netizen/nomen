import { deterministicFacts } from "../pipeline/facts";
import { kindOf, type Kind } from "../category/rules";
import type { GenerationInput } from "../pipeline/types";
import { Recommendation, type PageContent, type PhotoDetails, type SheetDraft } from "../pipeline/types";
import { classify } from "../vocab/fashion";
import type { ContentWriter, FactExtractor, KeywordDataProvider, PhotoReader, Recommender, SerpProvider, SerpResponse, SheetWriter, StyleReader } from "./types";
import { classifyPage } from "../serp/reduce";
import { titleCase } from "../serp/patterns";

const NO_USAGE = { inputTokens: 0, outputTokens: 0 };

/** A 140-160 character meta description with a soft call to action, from the name alone. */
function mockMeta(name: string, type: string) {
  const tail = " Shop yours now.";
  let meta = `The ${name} is an easy ${type} to style`;
  for (const add of [" for work, weekends", " and every plan in between", ", made to be worn again and again"]) if ((meta + add + "." + tail).length <= 160) meta += add;
  return `${meta}.${tail}`.slice(0, 160);
}

/** Deterministic stand-in for Claude extraction: structured fields + vocabulary scan. MOCK, not AI. */
export class MockFactExtractor implements FactExtractor {
  async extract({ freeText, fields }: { freeText: string; fields: Record<string, string | undefined> }) {
    const input = { freeText, productType: fields.productType ?? "", colour: fields.colour, material: fields.material, pattern: fields.pattern, fit: fields.fit, length: fields.length, feature: fields.feature, occasion: fields.occasion, audience: fields.audience, extra: fields.extra } as GenerationInput;
    return { facts: deterministicFacts(input), usage: NO_USAGE };
  }
}

/** Builds the title the order guidance suggests. MOCK, not AI: lets the whole pipeline run without paid keys. */
export class MockRecommender implements Recommender {
  failTimes = 0; // tests: fail this many calls with ai_unavailable
  calls = 0;
  async recommend(payload: Record<string, unknown>) {
    this.calls++;
    if (this.failTimes > 0) { this.failTimes--; const { AiError } = await import("./types"); throw new AiError("mock outage", "ai_unavailable"); }
    const p = payload as { title_order: { final: string[] }; keyword_evidence: { id: string; keyword: string }[]; serp_evidence: { id: string }[]; product_facts: { product_type: string }; brand_rules?: { max_title_length?: number; preferred_terms?: { use: string; instead_of: string[] }[] } };
    const kws = p.keyword_evidence;
    // The brand's own words, as the real writer is told to use them ("Pants" where the facts say "trousers").
    const own = (w: string) => { const t = p.brand_rules?.preferred_terms?.find((x) => x.instead_of.some((i) => i.toLowerCase() === w.toLowerCase())); return t ? t.use.toLowerCase() : w; };
    const noun = own(p.product_facts.product_type);
    const cap = (s: string) => s.replace(/(^|\s)([a-z])/g, (_, a, b) => a + b.toUpperCase());
    // Drop trailing details until the title fits the brand's maximum length.
    const max = p.brand_rules?.max_title_length ?? Infinity;
    let attrs = p.title_order.final.map(own);
    let title = titleCase([...attrs, noun].join(" "));
    while (title.length > max && attrs.length) { attrs = attrs.slice(0, -1); title = cap([...attrs, noun].join(" ")); }
    const alts: { title: string; trade_off: string }[] = [];
    if (attrs.length >= 2) alts.push({ title: cap([...attrs.slice(1), noun].join(" ")), trade_off: `Leaves out "${attrs[0]}" for a shorter, broader name.` });
    if (attrs.length >= 3) alts.push({ title: cap([...attrs.slice(0, -1), noun].join(" ")), trade_off: `Leaves out "${attrs[attrs.length - 1]}" for a shorter name.` });
    return {
      recommendation: Recommendation.parse({
        recommended_title: title,
        confidence: kws.length ? "medium" : "low",
        primary_keyword: kws[0]?.keyword ?? null,
        supporting_keywords: kws.slice(1, 3).map((k) => k.keyword),
        title_structure: [...attrs.map((a): string => classify(a) ?? "feature"), "product_type"],
        alternatives: alts,
        reason: "Built from your details, in the usual order for this kind of piece.",
        warnings: [],
        evidence_keyword_ids: kws.slice(0, 3).map((k) => k.id),
        evidence_serp_result_ids: p.serp_evidence.slice(0, 2).map((s) => s.id),
      }),
      usage: NO_USAGE,
    };
  }
}

/** Returns canned product-page style results for any query. MOCK. */
export class MockSerpProvider implements SerpProvider {
  readonly cacheNamespace = "mock";
  calls: string[] = [];
  fail = false;
  async search({ query }: { query: string }): Promise<SerpResponse> {
    this.calls.push(query);
    if (this.fail) throw new Error("mock SERP outage");
    const t = query.replace(/(^|\s)([a-z])/g, (_, a, b) => a + b.toUpperCase());
    const mk = (rank: number, domain: string, path: string, title: string) => ({ rank, title, domain, url: `https://${domain}${path}`, resultType: "organic", snippet: "", pageClass: classifyPage(`https://${domain}${path}`, title, domain) });
    return { query, checkedAt: new Date().toISOString(), costUsd: 0, results: [mk(1, "retailer-a.example", "/p/12345", `${t} | Retailer A`), mk(2, "retailer-b.example", "/products/x", `${t} - Retailer B`), mk(3, "retailer-c.example", "/collections/dresses", `${t}s | Retailer C`)] };
  }
}

// Example category details per kind: one clearly visible, one only partly, so screens show both.
const MOCK_ATTRIBUTES: Partial<Record<Kind, PhotoDetails["attributes"]>> = {
  shoes: [{ name: "Heel type", value: "block", seen: "clear" }, { name: "Toe", value: "pointed", seen: "partly" }],
  swimwear: [{ name: "Neckline", value: "scoop", seen: "clear" }, { name: "Back", value: "low", seen: "partly" }],
  jewellery: [{ name: "Finish", value: "gold-tone", seen: "clear" }],
  bags: [{ name: "Strap", value: "chain", seen: "clear" }],
};

/** Example details, the same for every photo. MOCK, not AI: lets the photo flow run without paid keys (the screen says so). */
export class MockPhotoReader implements PhotoReader {
  calls = 0;
  async read({ productType, extras = [] }: { productType?: string; extras?: unknown[] }) {
    this.calls++;
    const type = productType?.trim().toLowerCase() || "dress";
    const details: PhotoDetails = {
      not_a_product: false, product_type: type, colour: "black", pattern: null, material: null, fit: null,
      length: type === "dress" || type === "skirt" ? "midi" : null, feature: "square neckline", occasion: null, audience: null,
      description: `black ${type} with a square neckline`, unsure: ["fabric"], focus: null,
      attributes: MOCK_ATTRIBUTES[kindOf(type)] ?? [],
      images: [{ view: "front" as const, alt: `Black ${type} with a square neckline`, problem: "none" as const }, ...extras.map((_, i) => ({ view: (i === 0 ? "back" : "detail") as "back" | "detail", alt: i === 0 ? `Back view of the black ${type}` : `Close-up of the black ${type}'s neckline`, problem: "none" as const }))],
    };
    return { details, usage: NO_USAGE };
  }
}

/** A product page built only from the name and the buyer's words. MOCK, not AI: lets the whole flow run without paid keys. */
export class MockContentWriter implements ContentWriter {
  calls = 0;
  async write(payload: Record<string, unknown>) {
    this.calls++;
    const p = payload as { product_name: string; brand_name?: string | null; product_type?: string | null };
    const name = p.product_name, type = (p.product_type ?? "piece").toLowerCase();
    const brand = p.brand_name ? ` | ${p.brand_name}` : "";
    const opening = `Meet the ${name}, a ${type} made to be worn and worn again.`;
    const styling = `Wear it with your favourite sneakers for an easy day look, or dress it up with heels and a statement earring when the plans change. It sits just as well under a jacket on cooler mornings as it does on its own when the sun comes out.`;
    const care = `Every detail of the ${name} has been chosen to keep it simple to style, so it earns its place in your wardrobe season after season.`;
    const paragraphs: string[] = [opening];
    while (paragraphs.join(" ").split(/\s+/).length < 640) paragraphs.push(styling, care);
    const content: PageContent = {
      meta_title: `${name}${brand}`.length <= 60 ? `${name}${brand}` : name.slice(0, 60),
      meta_description: mockMeta(name, type),
      description: paragraphs.join("\n\n"),
    };
    return { content, usage: NO_USAGE };
  }
}

/** Writes a data sheet from the facts alone (no invented details), so the whole flow runs without Claude. */
export class MockSheetWriter implements SheetWriter {
  calls = 0;
  async write(payload: Record<string, unknown>) {
    this.calls++;
    const p = payload as { product_name: string; product_type?: string | null; product_facts?: { colour?: string[]; length?: string[]; features?: string[]; material?: string[] } };
    const f = p.product_facts ?? {};
    const type = (p.product_type ?? "piece").toLowerCase();
    const bits = [...(f.colour ?? []), ...(f.length ?? []), ...(f.features ?? [])];
    const highlights = [`${p.product_name}`, ...bits.slice(0, 4).map((b) => `${b[0].toUpperCase()}${b.slice(1)} ${type}`)].slice(0, 6);
    if (highlights.length < 2) highlights.push(`An easy ${type} to style`);
    let short = `The ${p.product_name} is a ${bits.join(", ") || "versatile"} ${type}.`;
    while (short.length < 480) short += ` It is easy to style and simple to wear, from one plan to the next.`;
    const sheet: SheetDraft = {
      highlights, details: (f.length ?? []).slice(0, 1).map((l) => ({ name: "Length", value: l })), short_description: short.slice(0, 880),
      google_category_id: null, ideal_for: [{ tag: "everyday", confidence: "high", reason: "An easy, versatile piece." }], season: null, care: null,
      image_alt: `${p.product_name}`.slice(0, 120),
    };
    return { sheet, usage: NO_USAGE };
  }
}

/** Example search figures (never real ones: their own cache namespace), so the live-keyword step runs without DataForSEO. */
export class MockKeywordData implements KeywordDataProvider {
  readonly cacheNamespace = "mock";
  calls = 0;
  constructor(private table: Record<string, number> = { "girls maxi dress": 590, "girls dress": 2400, "girls cream dress": 90, "girls party dress": 880, "black slip dress": 1900, "black satin slip dress": 260 }) {}
  async volumes(phrases: string[]) {
    this.calls++;
    return { volumes: Object.fromEntries(phrases.map((p) => [p.toLowerCase(), this.table[p.toLowerCase()] ?? null])), costUsd: 0 };
  }
  async suggestions(seed: string, limit: number) {
    this.calls++;
    // Like Google's: phrases with every word of the seed, in any order.
    const words = seed.toLowerCase().split(/\s+/);
    const has = (k: string) => { const ks = k.split(/\s+/); return words.every((w) => ks.includes(w)); };
    return { items: Object.entries(this.table).filter(([k]) => has(k) && k !== seed.toLowerCase()).map(([keyword, volume]) => ({ keyword, volume })).slice(0, limit), costUsd: 0 };
  }
}


/** Example words about a brand's voice. MOCK, not AI: lets "learn from your catalogue" run without paid keys (the screen says so). */
export class MockStyleReader implements StyleReader {
  calls = 0;
  async describe(samples: { title: string; description?: string }[]) {
    this.calls++;
    return { voice: { tone: `Example only: warm and confident, read from ${samples.length} of your products.`, audience: "Example only: women shopping for everyday and going-out pieces.", description_style: "Example only: opens with the piece, then its details, then how to wear it, in short paragraphs." }, usage: NO_USAGE };
  }
}
