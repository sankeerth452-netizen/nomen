import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { audienceVariants, audienceWord, liveCandidates, liveVolumes, newTally, suggestionSeed } from "@/lib/keywords/live";
import { scoreCandidate } from "@/lib/keywords/score";
import { createGeneration, runPipeline } from "@/lib/pipeline/run";
import type { StoredSheet } from "@/lib/pipeline/sheet";
import { MockContentWriter, MockFactExtractor, MockKeywordData, MockPhotoReader, MockRecommender, MockSerpProvider, MockSheetWriter } from "@/lib/providers/mock";
import type { Providers } from "@/lib/providers";
import type { KeywordDataProvider, ProductFacts } from "@/lib/providers/types";
import type { EvidenceBundle } from "@/lib/pipeline/types";
import { emptyFacts, resetDb, seedBrand } from "./helpers";

const facts = (o: Partial<ProductFacts>): ProductFacts => ({ ...emptyFacts, ...o } as ProductFacts);
const girlsDress = facts({ product_type: "dress", colour: ["cream"], length: ["maxi"], features: ["embroidered"], audience: "girls" });

beforeEach(resetDb);
afterAll(() => db.$disconnect());

describe("which phrases to ask Google about", () => {
  it("puts the audience in front of the piece's phrases, and seeds suggestions with it", () => {
    expect(audienceWord("girls")).toBe("girls");
    expect(audienceWord("Women's")).toBeNull(); // women's is the default: never searched with
    expect(audienceVariants(girlsDress)).toEqual(["girls dress", "girls dresses", "girls cream dress", "girls maxi dress", "girls embroidered dress"]);
    expect(audienceVariants(facts({ product_type: "jeans", audience: "girls" }))).toEqual(["girls jeans"]);
    expect(suggestionSeed(girlsDress)).toBe("girls dress");
    expect(suggestionSeed(facts({ product_type: "dress", colour: ["black"], features: ["slip"] }))).toBe("black dress");
  });

  it("counts the piece's own audience as supported, so 'girls maxi dress' isn't marked down", () => {
    const c = { id: "x", originalKeyword: "girls maxi dress", normalizedKeyword: "girls maxi dress", searchVolume: 590, category: "Dresses", subcategory: null, source: "google" as const };
    const forGirls = scoreCandidate(c, girlsDress)!, forWomen = scoreCandidate(c, { ...girlsDress, audience: null })!;
    expect(forGirls.score).toBeGreaterThan(forWomen.score);
  });
});

describe("live figures", () => {
  it("asks Google only for what isn't cached, and keeps figures for a month", async () => {
    const kd = new MockKeywordData();
    const t1 = newTally();
    const v1 = await liveVolumes(kd, ["girls maxi dress", "girls dress", "nobody searches this"], t1);
    expect([...v1]).toEqual([["girls maxi dress", 590], ["girls dress", 2400], ["nobody searches this", null]]);
    expect(t1).toMatchObject({ calls: 1, cached: 0 });
    const t2 = newTally();
    await liveVolumes(kd, ["girls maxi dress", "girls party dress"], t2);
    expect(t2).toMatchObject({ calls: 1, cached: 1 }); // only "girls party dress" was asked for
    expect(kd.calls).toBe(2);
  });

  it("adds Google's phrases the list doesn't have, without repeating word-order twins", async () => {
    const kd = new MockKeywordData({ "girls maxi dress": 590, "maxi dress girls": 590, "girls dress": 2400, "girls party dress": 880, "cream maxi dress": 350 });
    const listHas = [{ id: "k1", originalKeyword: "cream maxi dress", normalizedKeyword: "cream maxi dress", searchVolume: 350, category: "Dresses", subcategory: null, source: "exact" as const }];
    const out = await liveCandidates(girlsDress, listHas, kd, newTally());
    const phrases = out.map((c) => c.normalizedKeyword);
    expect(phrases).toContain("girls maxi dress");
    expect(phrases).toContain("girls party dress"); // from suggestions around "girls dress"
    expect(phrases).not.toContain("cream maxi dress"); // the list already has it
    expect(phrases.filter((p) => ["girls maxi dress", "maxi dress girls"].includes(p))).toHaveLength(1);
    expect(out.every((c) => c.source === "google" && c.id.startsWith("google:"))).toBe(true);
  });
});

describe("naming with live figures", () => {
  const providers = (keywords?: KeywordDataProvider): Providers => ({ extractor: new MockFactExtractor(), recommender: new MockRecommender(), serp: new MockSerpProvider(), photo: new MockPhotoReader(), content: new MockContentWriter(), sheet: new MockSheetWriter(), keywords, modelName: "mock" });
  const girls = { freeText: "girls cream embroidered maxi dress", productType: "dress", colour: "cream", length: "maxi", feature: "embroidered", audience: "girls" };

  it("names a girls' piece with Google's own figures where the list has none, marked as Google's", async () => {
    const { brand, user } = await seedBrand();
    const id = await createGeneration(user, brand.id, girls);
    await runPipeline(id, providers(new MockKeywordData()));
    const g = await db.generation.findUniqueOrThrow({ where: { id } });
    const ev = g.candidateEvidence as EvidenceBundle;
    const fromGoogle = ev.keywords.filter((k) => k.source === "google");
    expect(fromGoogle.map((k) => k.keyword)).toContain("girls maxi dress");
    expect(g.status).toBe("completed");
    expect((g.usage as { notes: string[] }).notes.join(" ")).toMatch(/Live keyword figures \(DataForSEO Labs\): 2 requests, 0 from cache, \d+ phrases added/);
  });

  it("still names it from the list when Google's figures fail", async () => {
    const { brand, user } = await seedBrand();
    const id = await createGeneration(user, brand.id, girls);
    const broken: KeywordDataProvider = { cacheNamespace: "mock", volumes: async () => { throw new Error("DataForSEO 503"); }, suggestions: async () => { throw new Error("DataForSEO 503"); } };
    await runPipeline(id, providers(broken));
    const g = await db.generation.findUniqueOrThrow({ where: { id } });
    expect(g.status).toBe("completed");
    expect((g.usage as { notes: string[] }).notes.join(" ")).toMatch(/Live keyword figures failed \(named from the list alone\): DataForSEO 503/);
  });

  it("checks an occasion's demand with Google when the list doesn't have the phrase", async () => {
    const { brand, user } = await seedBrand();
    const id = await createGeneration(user, brand.id, girls);
    const kd = new MockKeywordData({ "girls party dress": 880, "party dress": 5700 });
    await runPipeline(id, { ...providers(kd), sheet: { write: async (p) => { const r = await new MockSheetWriter().write(p); return { ...r, sheet: { ...r.sheet, ideal_for: [{ tag: "going_out", confidence: "high", reason: "Embroidered maxi for parties." }] } }; } } });
    const sheet = ((await db.generation.findUniqueOrThrow({ where: { id } })).result as { sheet: StoredSheet }).sheet;
    expect(sheet.status).toBe("ready");
    if (sheet.status !== "ready") return;
    expect(sheet.idealFor.live).toEqual([expect.objectContaining({ key: "going_out", demand: 5700 })]);
  });
});
