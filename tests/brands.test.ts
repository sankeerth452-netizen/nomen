import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addBrand, brandSlug, BrandError, cleanBrandName, COPIED_LIST_NAME, keywordListsToCopy } from "@/lib/brands";
import { createGeneration, runPipeline } from "@/lib/pipeline/run";
import { MockContentWriter, MockFactExtractor, MockPhotoReader, MockRecommender, MockSerpProvider, MockSheetWriter } from "@/lib/providers/mock";
import type { Providers } from "@/lib/providers";
import { resetDb, seedBrand } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

const owner = () => db.user.create({ data: { username: "owner", displayName: "Owner", passwordHash: "x", role: "owner" } });

describe("adding a brand", () => {
  it("starts with Nomen's default settings, no keyword list, and a record of who added it", async () => {
    const o = await owner();
    const b = await addBrand({ name: "  Cotton   On ", actorId: o.id });
    expect(b).toMatchObject({ name: "Cotton On", slug: "cotton-on", keywords: 0 });
    const row = await db.brand.findUniqueOrThrow({ where: { id: b.id } });
    expect(row.settings).toEqual({});
    expect(row.activeKeywordDatasetId).toBeNull();
    expect(await db.user.count({ where: { brandId: b.id } })).toBe(0);
    expect(await db.auditEvent.findFirst({ where: { brandId: b.id, eventType: "brand.created" } })).toMatchObject({ userId: o.id });
  });

  it("checks the name, and never adds the same brand twice", async () => {
    const o = await owner();
    await addBrand({ name: "Cotton On", actorId: o.id });
    await expect(addBrand({ name: "cotton on", actorId: o.id })).rejects.toThrow("There's already a brand called Cotton On.");
    for (const bad of ["", " ", "x", "!!", "a".repeat(61), 42]) await expect(addBrand({ name: bad, actorId: o.id })).rejects.toBeInstanceOf(BrandError);
    // A different name that makes the same web-safe short name gets the next free one.
    expect((await addBrand({ name: "Cotton-On!", actorId: o.id })).slug).toBe("cotton-on-2");
    expect(brandSlug("Peppermayo & Co.")).toBe("peppermayo-and-co");
    expect(brandSlug("Señorita")).toBe("senorita");
    expect(cleanBrandName("Glassons\n")).toBe("Glassons");
  });

  it("copies another brand's keyword list in use, under a name that doesn't give that brand away", async () => {
    const o = await owner();
    const { brand: sg } = await seedBrand();
    const source = await db.keywordDataset.findUniqueOrThrow({ where: { id: (await db.brand.findUniqueOrThrow({ where: { id: sg.id } })).activeKeywordDatasetId! } });
    expect(await keywordListsToCopy()).toEqual([{ brandId: sg.id, brandName: sg.name, keywords: source.rowsAccepted }]);

    const b = await addBrand({ name: "Cotton On", copyKeywordsFrom: sg.id, actorId: o.id });
    expect(b.keywords).toBe(source.rowsAccepted);
    const copy = await db.keywordDataset.findUniqueOrThrow({ where: { id: (await db.brand.findUniqueOrThrow({ where: { id: b.id } })).activeKeywordDatasetId! } });
    expect(copy).toMatchObject({ brandId: b.id, name: COPIED_LIST_NAME, status: "active", rowsAccepted: source.rowsAccepted, originalFilename: null });
    expect(copy.name).not.toContain(source.name);
    expect(copy.validationSummary).not.toHaveProperty("warnings"); // the source file's own notes stay with it
    expect((copy.validationSummary as { orderModel?: unknown }).orderModel).toEqual((source.validationSummary as { orderModel?: unknown }).orderModel);
    const words = async (datasetId: string) => (await db.keyword.findMany({ where: { datasetId }, select: { normalizedKeyword: true, searchVolume: true }, orderBy: { normalizedKeyword: "asc" } }));
    expect(await words(copy.id)).toEqual(await words(source.id));
    // The original is untouched, and still the first brand's.
    expect((await db.keywordDataset.findUniqueOrThrow({ where: { id: source.id } })).status).toBe("active");
    expect(await db.keyword.count({ where: { datasetId: source.id } })).toBe(source.rowsAccepted);
  });

  it("names a piece for the new brand from its own copy of the list", async () => {
    const o = await owner();
    const { brand: sg } = await seedBrand();
    const b = await addBrand({ name: "Cotton On", copyKeywordsFrom: sg.id, actorId: o.id });
    const p: Providers = { extractor: new MockFactExtractor(), recommender: new MockRecommender(), serp: new MockSerpProvider(), photo: new MockPhotoReader(), content: new MockContentWriter(), sheet: new MockSheetWriter(), modelName: "mock" };
    const id = await createGeneration({ id: o.id, brandId: b.id }, b.id, { freeText: "black midi dress with ruching", productType: "dress", colour: "black", length: "midi", feature: "ruched" });
    await runPipeline(id, p);
    const g = await db.generation.findUniqueOrThrow({ where: { id } });
    expect(g.status).toBe("completed");
    expect(g.brandId).toBe(b.id);
    expect(g.datasetId).toBe((await db.brand.findUniqueOrThrow({ where: { id: b.id } })).activeKeywordDatasetId);
    expect((g.candidateEvidence as { keywords: unknown[] }).keywords.length).toBeGreaterThan(0);
  });

  it("won't copy from a brand that has no list in use", async () => {
    const o = await owner();
    const { brand } = await seedBrand({}, false);
    await expect(addBrand({ name: "Cotton On", copyKeywordsFrom: brand.id, actorId: o.id })).rejects.toThrow("That brand doesn't have a keyword list to copy.");
    expect(await db.brand.count()).toBe(1);
  });
});
