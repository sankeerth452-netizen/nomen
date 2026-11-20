import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { alsoCalled } from "@/lib/category/rules";
import { openCsv } from "@/lib/keywords/readers";
import { importKeywords } from "@/lib/keywords/import";
import { activateDataset } from "@/lib/keywords/versions";
import { suggestMapping } from "@/lib/keywords/mapping";
import { keywordEvidenceFor } from "@/lib/keywords/evidence";
import { searchVariants } from "@/lib/keywords/retrieve";
import { scoreCandidate } from "@/lib/keywords/score";
import { validateRecommendation } from "@/lib/pipeline/validate";
import { buildPayload } from "@/lib/pipeline/run";
import { parseBrandSettings } from "@/lib/brand";
import type { EvidenceBundle, Recommendation } from "@/lib/pipeline/types";
import type { ProductFacts } from "@/lib/providers/types";
import { emptyFacts, resetDb } from "./helpers";

const swimsuit: ProductFacts = { ...emptyFacts, product_type: "swimsuit", colour: ["black"], features: ["high neck"], buyer_terms: ["black high neck swimsuit"] };
const bikiniTop: ProductFacts = { ...emptyFacts, product_type: "bikini top", colour: ["black"], buyer_terms: ["black bikini top"] };
const brand = parseBrandSettings({});
const bundle: EvidenceBundle = { datasetId: null, limitedKeywordEvidence: true, keywords: [], queries: [], serp: [], serpStatus: "skipped", patterns: null, order: { keywordOrder: [], serpOrder: [], final: [] } } as unknown as EvidenceBundle;
const rec = (title: string): Recommendation => ({ recommended_title: title, primary_keyword: null, supporting_keywords: [], alternatives: [], reason: "r", confidence: "high", warnings: [], evidence_keyword_ids: [], evidence_serp_result_ids: [] } as unknown as Recommendation);
const cand = (k: string, v: number) => ({ id: k, originalKeyword: k, normalizedKeyword: k, searchVolume: v, category: "Swimwear", subcategory: null, source: "exact" as const });

describe("other names a product type goes by", () => {
  it("a swimsuit is a one piece, unless it's a bikini, tankini or two-piece", () => {
    expect(alsoCalled("swimsuit")).toEqual(["one piece swimsuit", "one piece"]);
    expect(alsoCalled("one-piece swimsuit")).toEqual(["swimsuit", "one piece"]);
    expect(alsoCalled("swimsuit", "two-piece")).toEqual([]);
    expect(alsoCalled("bikini top")).toEqual([]);
    expect(alsoCalled("tankini")).toEqual([]);
    // Plain swaps are the brand's own choice ("Your words"), never automatic: Sportsgirl writes "Tee" and "Sweater".
    expect(alsoCalled("tee")).toEqual([]);
    expect(alsoCalled("sweater")).toEqual([]);
    expect(alsoCalled("pants")).toEqual([]);
    expect(alsoCalled("midi dress")).toEqual([]);
  });

  it("searches the keyword list under every name", () => {
    expect(searchVariants(swimsuit)).toEqual(expect.arrayContaining(["black swimsuit", "black one piece swimsuit", "black one piece"]));
    expect(searchVariants(bikiniTop).some((v) => v.includes("one piece"))).toBe(false);
  });

  it("scores a phrase under another name as naming the piece", () => {
    const s = scoreCandidate(cand("black one piece", 1900), swimsuit)!;
    expect(s.breakdown.typeAndIntent).toBeGreaterThan(0);
    expect(s.flags).not.toContain("type_not_last");
    expect(scoreCandidate(cand("black one piece", 1900), bikiniTop)!.breakdown.typeAndIntent).toBe(0);
  });

  it("lets the name use it, in any written form, and only when it's true", () => {
    for (const t of ["Black High Neck One Piece Swimsuit", "Black High Neck One-Piece Swimsuit", "Black High Neck One Piece"]) {
      expect(validateRecommendation(rec(t), swimsuit, bundle, brand).errors).toEqual([]);
    }
    expect(validateRecommendation(rec("Black One Piece Bikini Top"), bikiniTop, bundle, brand).errors.join(" ")).toMatch(/did not supply: one, piece/);
  });

  it("tells the naming step about the other names", () => {
    expect(buildPayload(swimsuit, brand, bundle)).toMatchObject({ product_type_also_called: ["one piece swimsuit", "one piece"] });
    expect(buildPayload(bikiniTop, brand, bundle)).not.toHaveProperty("product_type_also_called");
  });
});

describe("finding one piece phrases in the keyword list", () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it("finds phrases without the word swimsuit, and ranks the most searched first", async () => {
    const b = await db.brand.create({ data: { name: "T", slug: "t" } });
    const csv = "Keyword,Category,Ahrefs Volume (AU)\nblack one piece,Swimwear,1900\nblack swimsuit,Swimwear,600\nblack one piece swimsuit,Swimwear,700\nblack two piece set,Sets,900\nblack high neck swimsuit,Swimwear,90\n";
    const source = await openCsv(Buffer.from(csv));
    const s = await importKeywords({ brandId: b.id, name: "v1", filename: "k.csv", source, mapping: suggestMapping(source.headers), volumeRule: "max" });
    await activateDataset(s.datasetId);
    const ev = await keywordEvidenceFor(b.id, swimsuit);
    const names = ev.top.map((k) => k.normalizedKeyword);
    expect(names).toEqual(expect.arrayContaining(["black one piece", "black swimsuit", "black one piece swimsuit"]));
    expect(names).not.toContain("black two piece set");
    const bikini = await keywordEvidenceFor(b.id, { ...swimsuit, product_type: "bikini", buyer_terms: ["black bikini"] });
    expect(bikini.top.map((k) => k.normalizedKeyword)).not.toContain("black one piece");
  });
});
