import { describe, expect, it } from "vitest";
import { brandWordsFor, insteadTermsIn, parseBrandSettings } from "@/lib/brand";
import { validateRecommendation } from "@/lib/pipeline/validate";
import { buildPayload } from "@/lib/pipeline/run";
import { checkContent, allowedFrom } from "@/lib/pipeline/content";
import type { EvidenceBundle, Recommendation } from "@/lib/pipeline/types";
import type { ProductFacts } from "@/lib/providers/types";
import { emptyFacts } from "./helpers";

const brand = parseBrandSettings({ profile: { audience: "Women 18 to 30", tone: "Warm and playful", descriptionStyle: "Short paragraphs", seo: "Lead with the colour", terms: [{ use: "Pants", instead: ["trousers"], kind: "product" }, { use: "Ecru", instead: ["cream", "off white"], kind: "colour" }] } });
const facts: ProductFacts = { ...emptyFacts, product_type: "trousers", colour: ["cream"], fit_or_silhouette: ["wide leg"], buyer_terms: ["cream wide leg trousers"] };
const bundle = { datasetId: null, limitedKeywordEvidence: true, keywords: [], queries: [], serp: [], serpStatus: "skipped", patterns: null, order: { keywordOrder: [], serpOrder: [], final: [] } } as unknown as EvidenceBundle;
const rec = (title: string) => ({ recommended_title: title, primary_keyword: null, supporting_keywords: [], alternatives: [], reason: "r", confidence: "high", warnings: [], evidence_keyword_ids: [], evidence_serp_result_ids: [] }) as unknown as Recommendation;

describe("a brand's profile", () => {
  it("is empty until a brand fills it in, so names come out as before", () => {
    expect(parseBrandSettings({}).profile).toEqual({ audience: "", tone: "", descriptionStyle: "", seo: "", terms: [] });
  });

  it("finds the brand's words for what the facts say, and the words it replaces", () => {
    expect(brandWordsFor("cream wide leg trousers", brand.profile.terms)).toEqual(["Pants", "Ecru"]);
    expect(insteadTermsIn("Cream Wide Leg Trousers", brand.profile.terms)).toEqual([{ found: "trousers", use: "Pants" }, { found: "cream", use: "Ecru" }]);
    expect(insteadTermsIn("Ecru Wide Leg Pants", brand.profile.terms)).toEqual([]);
  });

  it("names use the brand's words, never the ones they replace", () => {
    expect(validateRecommendation(rec("Ecru Wide Leg Pants"), facts, bundle, brand).errors).toEqual([]);
    const errors = validateRecommendation(rec("Cream Wide Leg Trousers"), facts, bundle, brand).errors.join(" ");
    expect(errors).toMatch(/uses "trousers": the brand's word is "Pants"/);
    expect(errors).toMatch(/uses "cream": the brand's word is "Ecru"/);
    // Without the facts saying trousers, "Pants" is not the brand's word for anything here.
    expect(validateRecommendation(rec("Ecru Wide Leg Pants"), { ...facts, product_type: "jeans", buyer_terms: ["cream wide leg jeans"] }, bundle, brand).errors.join(" ")).toMatch(/did not supply: pants/);
  });

  it("goes to the naming step with who the brand sells to and how it likes names", () => {
    expect(buildPayload(facts, brand, bundle)).toMatchObject({ brand_rules: { preferred_terms: [{ use: "Pants", instead_of: ["trousers"] }, { use: "Ecru", instead_of: ["cream", "off white"] }], audience: "Women 18 to 30", seo_preferences: "Lead with the colour" } });
    expect(buildPayload(facts, parseBrandSettings({}), bundle).brand_rules).not.toHaveProperty("preferred_terms");
  });

  it("product pages are sent back when they use a replaced word", () => {
    const page = { meta_title: "Ecru Wide Leg Pants | T", meta_description: "x".repeat(150), description: "word ".repeat(650) + "These cream trousers." };
    const source = "cream wide leg trousers\nPants\nEcru";
    expect(checkContent(page, allowedFrom([source]), source, brand).problems.join(" ")).toMatch(/uses "trousers": the brand's word is "Pants"/);
  });
});
