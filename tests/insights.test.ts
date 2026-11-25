import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addUsage } from "@/lib/pipeline/usage";
import { backfillUsage, recordClaude } from "@/lib/usage/ledger";
import { describeSeason, monthSpan, riseAhead, seasonProfile, type MonthlyPoint } from "@/lib/keywords/seasonal";
import { cachedMonthly, liveVolumes, newTally } from "@/lib/keywords/live";
import { MockKeywordData } from "@/lib/providers/mock";
import { categoryLabel, dashboardData } from "@/lib/insights/dashboard";
import { namingGaps, titleTerms } from "@/lib/insights/competitors";
import { pickSearchQueries } from "@/lib/pipeline/sheet";
import { seasonalCalendar } from "@/lib/insights/seasonal";
import type { EvidenceBundle } from "@/lib/pipeline/types";
import { resetDb, seedBrand } from "./helpers";

// "christmas dress" in Australia, Nov 2023 to Oct 2026 (DataForSEO Labs, checked 25 Nov 2026).
const XMAS = [14800, 4400, 1600, 1000, 590, 390, 320, 390, 210, 390, 49500, 49500, 12100, 4400, 1600, 1000, 720, 590, 480, 480, 320, 590, 60500, 60500, 18100, 5400, 2400, 1900, 1000, 590, 390, 390, 320, 590, 60500, 60500];
const history = (vals: number[]): MonthlyPoint[] => vals.map((volume, i) => { const d = new Date(Date.UTC(2026, 9 - i, 1)); return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, volume }; });

describe("seasons from Google's monthly history", () => {
  it("finds when a phrase peaks and how strongly", () => {
    const p = seasonProfile(history(XMAS))!;
    expect(p.peaks).toEqual([10, 11]);
    expect(describeSeason(p)).toMatch(/^Searches peak in Nov–Dec \(about \d+ times the yearly average\)$/);
    expect(riseAhead(p, 9)).toBeGreaterThan(3); // in October, November is far busier
    expect(seasonProfile(history(XMAS.slice(0, 6)))).toBeNull(); // too little history
    expect(describeSeason(seasonProfile(history(Array(36).fill(1000))))).toBeNull(); // steady all year
  });

  it("writes month spans the way people say them, over the new year too", () => {
    expect(monthSpan([10, 11, 0])).toBe("Nov–Jan");
    expect(monthSpan([5, 6, 11])).toBe("Jun–Jul, Dec");
  });
});

describe("the spend ledger", () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it("records each paid call under its step, with the brand and range it belongs to", async () => {
    const { brand, user } = await seedBrand();
    const b = await db.batch.create({ data: { brandId: brand.id, userId: user.id, title: "Range" } });
    const g = await db.generation.create({ data: { brandId: brand.id, userId: user.id, originalInput: {}, status: "completed" } });
    await db.batchItem.create({ data: { batchId: b.id, position: 1, filename: "a.jpg", generationId: g.id } });
    await addUsage(g.id, { ai: { inputTokens: 1000, outputTokens: 500, model: "claude-opus-5-5" }, op: "name" });
    await addUsage(g.id, { serpCalls: 1, serpCostUsd: 0.006, op: "google_results" });
    await addUsage(g.id, { notes: ["just a note"] }); // nothing paid, nothing recorded
    await recordClaude({ brandId: brand.id }, "photo_read", { inputTokens: 0, outputTokens: 0 }); // the stand-in AI: nothing recorded
    const rows = await db.usageEvent.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => [r.operation, r.provider, r.brandId, r.batchId])).toEqual([["name", "claude", brand.id, b.id], ["google_results", "dataforseo", brand.id, b.id]]);
    expect(rows[0].costUsd).toBeCloseTo((1000 * 4 + 500 * 20) / 1e6); // Opus list price
  });

  it("adds earlier products once, as one total each", async () => {
    const { brand, user } = await seedBrand();
    await db.generation.create({ data: { brandId: brand.id, userId: user.id, originalInput: {}, status: "completed", usage: { ai: { byModel: { "claude-opus-5-5": { input: 2000, output: 1000 } } }, serp: { costUsd: 0.01 } } } });
    expect(await backfillUsage()).toEqual({ generations: 1, readings: 0 });
    expect(await backfillUsage()).toEqual({ generations: 0, readings: 0 });
    const rows = await db.usageEvent.findMany();
    expect(rows.every((r) => r.backfilled && r.operation === "all_steps")).toBe(true);
    expect(rows.reduce((s, r) => s + r.costUsd, 0)).toBeCloseTo(0.008 + 0.02 + 0.01);
  });

  it("keeps Google's monthly history with each figure, and asks again for figures cached without it", async () => {
    const kd = new MockKeywordData();
    const tally = newTally();
    await db.serpCache.create({ data: { cacheKey: "mock:labs-volume:christmas dress", query: "christmas dress", location: "Australia", language: "English", device: "labs", expiresAt: new Date(Date.now() + 86_400_000), reducedResponse: { volume: 9900 }, providerStatus: "ok" } });
    await liveVolumes(kd, ["christmas dress"], tally);
    expect(kd.calls).toBe(0); // a figure is enough here
    await liveVolumes(kd, ["christmas dress"], tally, { needMonthly: ["christmas dress"] });
    expect(kd.calls).toBe(1);
    expect(describeSeason(seasonProfile((await cachedMonthly(kd, ["christmas dress"])).get("christmas dress")))).toMatch(/Nov–Dec/);
  });
});

describe("the dashboard", () => {
  beforeEach(resetDb);

  it("counts real work only, unless tests are asked for, and splits spend by step", async () => {
    const { brand, user } = await seedBrand();
    const mk = (title: string, status = "completed", confidence = "high", productType = "dress", isTest = false) =>
      db.generation.create({ data: { brandId: brand.id, userId: user.id, originalInput: { productType }, status, confidence, isTest, durationMs: 20_000, result: { recommendation: { recommended_title: title } } } });
    const a = await mk("Black Midi Dress"), b2 = await mk("Black Midi Dress", "completed", "medium"), c = await mk("Red Bikini Top", "completed", "high", "bikini top");
    await mk("Test Dress", "completed", "high", "dress", true);
    await mk("", "failed", "low");
    const testRange = await db.batch.create({ data: { brandId: brand.id, userId: user.id, title: "TEST range", isTest: true } });
    const t = await mk("Range Test Dress");
    await db.batchItem.create({ data: { batchId: testRange.id, position: 1, filename: "x.jpg", generationId: t.id, status: "named" } });
    const review = await db.productReview.create({ data: { generationId: a.id, brandId: brand.id, status: "approved" } });
    await db.productReview.create({ data: { generationId: b2.id, brandId: brand.id, status: "needs_review" } });
    await db.reviewRevision.create({ data: { reviewId: review.id, field: "name", source: "human", value: "x", userId: user.id } });
    await addUsage(a.id, { ai: { inputTokens: 1000, outputTokens: 0, model: "claude-opus-5-5" }, op: "name" });
    await addUsage(c.id, { ai: { inputTokens: 1000, outputTokens: 0, model: "claude-opus-5-5" }, op: "page" });
    await addUsage(t.id, { ai: { inputTokens: 1000, outputTokens: 0, model: "claude-opus-5-5" }, op: "name" });

    const d = await dashboardData({ brandIds: [brand.id], period: "30d", category: "all", includeTests: false });
    expect(d.work).toMatchObject({ named: 3, failed: 1, approved: 1, toReview: 1 });
    expect(d.testsLeftOut).toBe(2);
    expect(d.quality).toMatchObject({ duplicates: 2, corrected: 1, reviewed: 2 });
    expect(d.quality.high).toBeCloseTo(2 / 3);
    expect(d.spend.total).toBeCloseTo(0.008); // the test range's spend is left out
    expect(d.spend.byOperation.map((o) => o.label).sort()).toEqual(["Product page", "Writing the name"]);
    expect(d.categories).toEqual(["Dresses", "Swimwear"]);

    const swim = await dashboardData({ brandIds: [brand.id], period: "30d", category: "Swimwear", includeTests: false });
    expect(swim.work.named).toBe(1);
    expect(swim.spend.total).toBeCloseTo(0.004);
    const withTests = await dashboardData({ brandIds: [brand.id], period: "30d", category: "all", includeTests: true });
    expect(withTests.work.named).toBe(5);
    expect(categoryLabel("ballet flats")).toBe("Shoes");
  });

  it("finds words other shops use that the brand's names rarely do, with the evidence, never its own site", async () => {
    expect(titleTerms("Women's Black Satin Cowl Neck Midi Slip Dress")).toEqual(["cowl neck", "slip dress", "satin", "midi"]);
    const { brand, user } = await seedBrand();
    const serp = [
      { title: "Satin Cowl Neck Midi Dress - Black", domain: "www.shopa.com.au", query: "black midi dress", pageClass: "product" },
      { title: "Cowl Neck Satin Slip Dress", domain: "shopb.com", query: "black midi dress", pageClass: "product" },
      { title: "Cowl Neck Midi Dress", domain: "shopc.com", query: "satin midi dress", pageClass: "product" },
      { title: "Ruched Midi Dress", domain: "shopd.com", query: "black midi dress", pageClass: "product" },
      { title: "Square Neck Midi Dress", domain: "shope.com", query: "black midi dress", pageClass: "product" },
      { title: "Cowl Neck Dress", domain: "www.t.com.au", query: "black midi dress", pageClass: "product" }, // the brand's own site ("t")
      { title: "How to wear a cowl neck", domain: "blog.com", query: "black midi dress", pageClass: "editorial" },
    ];
    for (const name of ["Black Ruched Midi Dress", "Black Square Neck Midi Dress"]) await db.generation.create({ data: { brandId: brand.id, userId: user.id, originalInput: { productType: "dress" }, status: "completed", result: { recommendation: { recommended_title: name } }, candidateEvidence: { serp } } });
    const [dresses] = await namingGaps({ brandIds: [brand.id], from: new Date(0), includeTests: false });
    expect(dresses).toMatchObject({ category: "Dresses", ourNames: 2, theirResults: 5, shops: 5 });
    const cowl = dresses.gaps.find((g) => g.term === "cowl neck")!;
    expect(cowl).toMatchObject({ theirCount: 3, ourCount: 0, shops: ["shopa.com.au", "shopb.com", "shopc.com"] });
    expect(dresses.gaps.some((g) => g.term === "midi")).toBe(false); // the brand already uses it
  });

  it("the seasonal calendar shows what's at its peak now and what's rising, leaving out phrases that stay small", async () => {
    const cal = await seasonalCalendar(new MockKeywordData(), {}, new Date("2026-11-25T03:00:00Z")); // late November in Australia
    expect(cal.month).toBe(10);
    expect(cal.inSeason.map((r) => r.phrase)).toEqual(expect.arrayContaining(["christmas dress", "party dress"]));
    expect(cal.comingUp.map((r) => r.phrase)).toEqual(expect.arrayContaining(["one piece swimsuit", "summer dress"])); // the stand-in's summer peaks in Dec-Jan
    expect(cal.comingUp.every((r) => Math.max(r.months[11], r.months[0]) >= 300)).toBe(true);
    expect(await db.usageEvent.count({ where: { operation: "seasonal_figures" } })).toBe(0); // the stand-in costs nothing
  });

  it("product data asks for the history of the phrases it shows", () => {
    const bundle = { limitedKeywordEvidence: false, keywords: [{ keyword: "black midi dress", searchVolume: 4400, flags: [], score: 0.9 }, { keyword: "midi dress", searchVolume: 9900, flags: [], score: 0.8 }] } as unknown as EvidenceBundle;
    expect(pickSearchQueries(bundle, ["black midi dress"]).map((q) => q.phrase)).toEqual(["black midi dress", "midi dress"]);
  });
});
