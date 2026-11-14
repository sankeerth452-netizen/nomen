import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseBrandSettings } from "@/lib/brand";
import { allowedFrom, checkContent, fitContent, writeContent } from "@/lib/pipeline/content";
import { createGeneration, runPipeline } from "@/lib/pipeline/run";
import { MockContentWriter, MockFactExtractor, MockPhotoReader, MockRecommender, MockSerpProvider } from "@/lib/providers/mock";
import type { Providers } from "@/lib/providers";
import type { ContentWriter } from "@/lib/providers/types";
import type { PageContent } from "@/lib/pipeline/types";
import { resetDb, seedBrand } from "./helpers";

const brand = parseBrandSettings({});
const source = "black midi dress with ruching · dress · black · midi · ruched · Fabric: 100% cotton";
const allowed = allowedFrom([source]);
const words = (n: number, w = "lovely") => Array(n).fill(w).join(" ");
const page = (description: string, extra: Partial<PageContent> = {}): PageContent => ({ meta_title: "Black Ruched Midi Dress | Sportsgirl", meta_description: "An easy black midi dress with ruching.", description, ...extra });
const check = (c: PageContent) => checkContent(c, allowed, source, brand);

describe("checking a product page", () => {
  it("passes a page that sticks to the facts and the limits", () => {
    expect(check(page(`The black midi dress with ruching is made from 100% cotton. ${words(620)}. Wear it on a long weekend with your favourite sneakers.`))).toEqual({ problems: [], invented: [] });
  });

  it("enforces the limits: 60 and 160 characters, 600 to 800 words, plain paragraphs", () => {
    const p = check(page(`# Heading\n\n- ${words(500)}`, { meta_title: "x".repeat(61), meta_description: "y".repeat(161) })).problems.join(" | ");
    expect(p).toMatch(/meta_title is 61 characters/);
    expect(p).toMatch(/meta_description is 161 characters/);
    expect(p).toMatch(/description is \d+ words; it must be 600 to 800/);
    expect(p).toMatch(/plain paragraphs/);
  });

  it("catches details the buyer never gave, styling suggestions included", () => {
    const c = page(`${words(620)} Cut from soft linen, this organic piece is machine washable and 110cm long. Style it with white sneakers. Perfect for girls.`);
    expect(check(c).invented.sort()).toEqual(["110cm", "girls", "linen", "machine washable", "organic", "white"].sort());
  });

  it("doesn't flag everyday words or the buyer's own numbers", () => {
    expect(check(page(`${words(620)} Great for a long weekend or a short walk, it is 100% cotton and made to feel full of ease.`)).invented).toEqual([]);
  });

  it("trims to the limits at clean boundaries when a repair still runs over", () => {
    const fitted = fitContent({ meta_title: "Black Ruched Mesh Sleeve Midi Dress With Square Neck | Sportsgirl", meta_description: `${"An easy dress for every plan. ".repeat(7)}`, description: [words(500), words(250), words(200)].join("\n\n") }, "Sportsgirl");
    expect(fitted.meta_title).toBe("Black Ruched Mesh Sleeve Midi Dress With Square Neck");
    expect(fitted.meta_description.length).toBeLessThanOrEqual(160);
    expect(fitted.meta_description.endsWith(".")).toBe(true);
    expect(fitted.description.split(/\s+/).length).toBe(750); // the last paragraph went, not half a sentence
  });
});

describe("writing the page after the name", () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());
  const providers = (content: ContentWriter = new MockContentWriter()): Providers => ({ extractor: new MockFactExtractor(), recommender: new MockRecommender(), serp: new MockSerpProvider(), photo: new MockPhotoReader(), content, modelName: "mock" });
  const dress = { freeText: "black midi dress with ruching", productType: "dress", colour: "black", length: "midi", feature: "ruched" };

  it("writes a checked page for the name, within every limit, and records the prompt version", async () => {
    const { brand: b, user } = await seedBrand();
    const id = await createGeneration(user, b.id, dress);
    await runPipeline(id, providers());
    const g = await db.generation.findUniqueOrThrow({ where: { id } });
    const r = g.result as { recommendation: { recommended_title: string }; content: { status: string; for_title: string; meta_title: string; meta_description: string; words: number } };
    expect(g.status).toBe("completed");
    expect(r.content).toMatchObject({ status: "ready", for_title: r.recommendation.recommended_title });
    expect(r.content.meta_title.length).toBeLessThanOrEqual(60);
    expect(r.content.meta_description.length).toBeLessThanOrEqual(160);
    expect(r.content.words).toBeGreaterThanOrEqual(600);
    expect((g.promptVersions as Record<string, string>).content).toMatch(/^content-v/);
  });

  it("sends a page back once to fix, then keeps the fixed one", async () => {
    const { brand: b, user } = await seedBrand();
    let calls = 0;
    const mock = new MockContentWriter();
    const writer: ContentWriter = { write: async (p, repair) => { calls++; const r = await mock.write(p); return repair ? r : { ...r, content: { ...r.content, meta_title: "x".repeat(70) } }; } };
    const id = await createGeneration(user, b.id, dress);
    await runPipeline(id, providers(writer));
    const g = await db.generation.findUniqueOrThrow({ where: { id } });
    expect(calls).toBe(2);
    expect((g.result as { content: { status: string; meta_title: string } }).content.meta_title.length).toBeLessThanOrEqual(60);
    expect((g.usage as { notes: string[] }).notes.join()).toMatch(/Product page \(first draft\): meta_title is 70 characters/);
  });

  it("withholds a page that keeps inventing details, and the name still stands", async () => {
    const { brand: b, user } = await seedBrand();
    const mock = new MockContentWriter();
    const writer: ContentWriter = { write: async (p) => { const r = await mock.write(p); return { ...r, content: { ...r.content, description: `${r.content.description}\n\nCut from pure silk.` } }; } };
    const id = await createGeneration(user, b.id, dress);
    await runPipeline(id, providers(writer));
    const g = await db.generation.findUniqueOrThrow({ where: { id } });
    expect(g.status).toBe("completed");
    expect((g.result as { content: { status: string } }).content.status).toBe("failed");
    expect((g.usage as { notes: string[] }).notes.join()).toMatch(/not shown.*silk/);
  });

  it("rewrites the page for a chosen alternative name", async () => {
    const { brand: b, user } = await seedBrand();
    const id = await createGeneration(user, b.id, dress);
    await runPipeline(id, providers());
    await writeContent(id, { title: "Black Ruched Dress", providers: providers() });
    const g = await db.generation.findUniqueOrThrow({ where: { id } });
    expect((g.result as { content: { status: string; for_title: string; meta_title: string } }).content).toMatchObject({ status: "ready", for_title: "Black Ruched Dress" });
  });
});
