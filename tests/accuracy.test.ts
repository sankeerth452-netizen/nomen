import { describe, expect, it } from "vitest";
import { parseBrandSettings } from "@/lib/brand";
import { detectConflicts, deterministicFacts, groundFacts } from "@/lib/pipeline/facts";
import { dropBadAlternatives, validateRecommendation } from "@/lib/pipeline/validate";
import type { EvidenceBundle, GenerationInput, Recommendation } from "@/lib/pipeline/types";
import { scoreCandidate } from "@/lib/keywords/score";
import { wordStem } from "@/lib/vocab/fashion";
import type { ProductFacts } from "@/lib/providers/types";
import { emptyFacts } from "./helpers";

const input = (freeText: string, productType: string, more: Partial<GenerationInput> = {}): GenerationInput => ({ freeText, productType, ...more });
const facts = (f: Partial<ProductFacts>): ProductFacts => ({ ...emptyFacts, ...f });
const bundle: EvidenceBundle = {
  datasetId: "d", limitedKeywordEvidence: true, serpStatus: "skipped", patterns: null, queries: [], keywords: [], serp: [],
  order: { keywordOrder: [], serpOrder: null, final: [], suggestedTitle: "" },
};
const rec = (title: string, alternatives: Recommendation["alternatives"] = []): Recommendation => ({
  recommended_title: title, confidence: "medium", primary_keyword: null, supporting_keywords: [], title_structure: [], alternatives,
  reason: "r", warnings: [], evidence_keyword_ids: [], evidence_serp_result_ids: [],
});
const brand = parseBrandSettings({});
const kw = (k: string) => ({ id: k, originalKeyword: k, normalizedKeyword: k, searchVolume: 100, category: "Dresses", subcategory: null, source: "exact" as const });

describe("word forms", () => {
  it("folds inflections together but never an opposite or a look-alike", () => {
    expect(new Set(["ruching", "ruched", "ruche"].map(wordStem)).size).toBe(1);
    expect(new Set(["pleats", "pleated", "pleating"].map(wordStem)).size).toBe(1);
    expect(new Set(["sleeve", "sleeves", "sleeved"].map(wordStem)).size).toBe(1);
    expect(wordStem("knitted")).toBe(wordStem("knit"));
    expect(wordStem("sleeveless")).not.toBe(wordStem("sleeve"));
    expect(wordStem("strapless")).not.toBe(wordStem("strappy"));
    expect(wordStem("backless")).not.toBe(wordStem("back"));
    expect(wordStem("longline")).not.toBe(wordStem("long"));
  });
});

describe("grounding drops an AI fact that contradicts the buyer", () => {
  it.each<[string, string, Partial<ProductFacts>, string]>([
    ["white strappy slip dress", "dress", { features: ["strapless"] }, "strapless"],
    ["puff sleeve midi dress", "dress", { features: ["sleeveless"] }, "sleeveless"],
    ["long sleeve top", "top", { length: ["longline"] }, "longline"],
    ["open back dress", "dress", { features: ["backless"] }, "backless"],
  ])("buyer wrote %j: AI's %j is dropped", (text, type, ai, word) => {
    const g = groundFacts(facts({ product_type: type, ...ai }), input(text, type));
    expect(g.dropped).toContain(word);
    expect(JSON.stringify(g.facts)).not.toContain(word);
  });

  it("keeps the same word in another form (ruching -> ruched, pleats -> pleated)", () => {
    const g = groundFacts(facts({ product_type: "skirt", features: ["ruched", "pleated"] }), input("skirt with ruching and pleats", "skirt"));
    expect(g.facts.features).toEqual(["ruched", "pleated"]);
    expect(g.dropped).toEqual([]);
  });

  it("grounds buyer_terms too, since every buyer term becomes an allowed title word", () => {
    const g = groundFacts(facts({ product_type: "dress", buyer_terms: ["black dress", "elegant evening gown"] }), input("black dress", "dress"));
    expect(g.facts.buyer_terms).toEqual(["black dress"]);
    expect(g.dropped).toContain("elegant evening gown");
  });

  it("flags the buyer's own opposite details as a conflict", () => {
    expect(detectConflicts(facts({ features: ["strapless", "strappy"] })).join()).toMatch(/strapless.*strappy/);
    expect(detectConflicts(facts({ features: ["sleeveless", "puff sleeve"] })).join()).toMatch(/sleeveless.*puff sleeve/);
    expect(detectConflicts(facts({ features: ["sleeveless", "v-neck"] }))).toEqual([]);
  });
});

describe("a detail limited to one part stays attached to that part", () => {
  const meshInput = input("black dress with ruching, midi length, mesh sleeves", "dress");
  const meshFacts = groundFacts(facts({ product_type: "dress", colour: ["black"], material: ["mesh"], features: ["ruched", "sleeve"], length: ["midi"] }), meshInput).facts;

  it("moves 'mesh' out of the material into a 'mesh sleeve' feature", () => {
    expect(meshFacts.material).toEqual([]);
    expect(meshFacts.features).toEqual(["ruched", "mesh sleeve"]);
    expect(meshFacts.colour).toEqual(["black"]); // "black dress": the noun is not a part
  });

  it("does the same without AI, and for colours and other parts", () => {
    expect(deterministicFacts(meshInput)).toMatchObject({ material: [], features: ["ruched", "mesh sleeve"] });
    expect(deterministicFacts(input("lace trim maxi dress", "dress"))).toMatchObject({ material: [], features: ["lace trim"] });
    expect(deterministicFacts(input("black dress with white collar", "dress"))).toMatchObject({ colour: ["black"], features: ["white collar"] });
  });

  it("leaves a whole-product material alone: the Material field, or the material before the noun", () => {
    expect(deterministicFacts(input("dress with mesh sleeves", "dress", { material: "mesh" })).material).toEqual(["mesh"]);
    expect(deterministicFacts(input("black leather boots", "boots")).material).toEqual(["leather"]);
    expect(deterministicFacts(input("satin slip dress", "dress")).material).toEqual(["satin"]);
  });

  it("rejects a title that calls the whole dress mesh, accepts ones that keep 'mesh sleeve'", () => {
    const v = (t: string) => validateRecommendation(rec(t), meshFacts, bundle, brand).errors;
    expect(v("Black Mesh Midi Dress").join()).toMatch(/only the sleeve is mesh/);
    expect(v("Black Ruched Mesh Midi Dress").join()).toMatch(/only the sleeve is mesh/);
    expect(v("Black Ruched Mesh Sleeve Midi Dress")).toEqual([]);
    expect(v("Black Ruched Midi Dress With Mesh Sleeves")).toEqual([]);
  });

  it("accepts a word tied to two parts next to either part ('lace trim' and 'lace inserts')", () => {
    const laceFacts = facts({ product_type: "dress", colour: ["cornflower blue"], length: ["maxi"], features: ["white lace trim", "white lace inserts"] });
    const v = (t: string) => validateRecommendation(rec(t), laceFacts, bundle, brand).errors;
    expect(v("Cornflower Blue Lace Trim Maxi Dress")).toEqual([]);
    expect(v("Cornflower Blue Maxi Dress With White Lace Inserts")).toEqual([]);
    expect(v("Cornflower Blue Lace Maxi Dress").join()).toMatch(/only the trim and inserts are lace/);
  });

  it("excludes keywords that call the whole product mesh", () => {
    expect(scoreCandidate(kw("black mesh midi dress"), meshFacts)?.flags).toContain("unsupported_attribute:mesh");
    expect(scoreCandidate(kw("mesh sleeve midi dress"), meshFacts)?.flags.join()).not.toMatch(/unsupported_attribute/);
  });
});

describe("the buyer's word in its natural retail form", () => {
  it("allows the retail short form 'Crew Neck' for a buyer's 'crew neckline', and only then", () => {
    const sweater = facts({ product_type: "sweater", colour: ["black"], features: ["crew neckline"] });
    const v = (t: string, f = sweater) => validateRecommendation(rec(t), f, bundle, brand).errors;
    expect(v("Black Crew Neck Sweater")).toEqual([]);
    expect(v("Black Crew Neck Sweater", facts({ product_type: "sweater", colour: ["black"], features: ["crew"] })).join()).toMatch(/did not supply: neck/);
    const laceNeck = facts({ product_type: "top", colour: ["cream"], features: ["lace neckline"] });
    expect(v("Cream Lace Neck Top", laceNeck)).toEqual([]); // the part's short form keeps the lace on its part
  });

  const f = facts({ product_type: "dress", colour: ["black"], features: ["ruching"], length: ["midi"] });

  it("accepts 'Ruched' when the buyer wrote 'ruching', but never an opposite form", () => {
    expect(validateRecommendation(rec("Black Ruched Midi Dress"), f, bundle, brand).errors).toEqual([]);
    const sleeve = facts({ product_type: "dress", features: ["puff sleeve"] });
    expect(validateRecommendation(rec("Sleeveless Dress"), sleeve, bundle, brand).errors.join()).toMatch(/sleeveless/);
  });

  it("keeps 'ruched midi dress' as keyword evidence for a buyer who wrote 'ruching'", () => {
    const s = scoreCandidate(kw("ruched midi dress"), f);
    expect(s?.flags.join()).not.toMatch(/unsupported_attribute/);
    expect(s?.coverage).toBeCloseTo(2 / 3); // ruching + midi of black, ruching, midi
  });
});

describe("the brand's maximum title length is a hard limit", () => {
  const f = facts({ product_type: "dress", colour: ["black"], features: ["ruched"], length: ["midi"], occasion_or_style: ["cocktail", "party"] });
  const tight = parseBrandSettings({ maxTitleLength: 25 });

  it("errors on an over-length title so the repair call shortens it", () => {
    const r = validateRecommendation(rec("Black Ruched Cocktail Party Midi Dress"), f, bundle, tight);
    expect(r.errors.join()).toMatch(/Recommended title is 38 characters; the brand maximum is 25/);
  });

  it("drops an over-length alternative with a visible note instead of failing", () => {
    const r = rec("Black Ruched Midi Dress", [{ title: "Black Ruched Cocktail Party Midi Dress", trade_off: "x" }, { title: "Black Midi Dress", trade_off: "y" }]);
    const v = validateRecommendation(r, f, bundle, tight);
    const salvaged = dropBadAlternatives(v, r, f, bundle, tight);
    expect(salvaged.errors).toEqual([]);
    expect(salvaged.cleaned.alternatives.map((a) => a.title)).toEqual(["Black Midi Dress"]);
    expect(salvaged.internal.join()).toMatch(/Dropped alternative "Black Ruched Cocktail Party Midi Dress"/); // for engineers
    expect(salvaged.warnings.join()).not.toMatch(/Dropped/); // never on the buyer's screen
  });
});
