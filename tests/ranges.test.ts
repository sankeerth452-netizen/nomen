import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { MockContentWriter, MockFactExtractor, MockPhotoReader, MockRecommender, MockSerpProvider, MockSheetWriter } from "@/lib/providers/mock";
import type { Providers } from "@/lib/providers";
import type { PhotoReader } from "@/lib/providers/types";
import { cleanFields, fillEmpty, isReady, loadRangeFor, rangeCsv, rangeItems, withEdits, type ItemDetails } from "@/lib/batch/ranges";
import { MAX_AT_ONCE, drain, kick, recoverStale } from "@/lib/batch/worker";
import { resetDb, seedBrand } from "./helpers";

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60)]);
const providers = (photo: PhotoReader = new MockPhotoReader()): Providers => ({ extractor: new MockFactExtractor(), recommender: new MockRecommender(), serp: new MockSerpProvider(), photo, content: new MockContentWriter(), sheet: new MockSheetWriter(), modelName: "mock" });
const su = (u: { id: string; username: string; displayName: string; role: string; brandId: string | null }) => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role as "buyer", brandId: u.brandId, brandName: null });

async function range(n: number, extra: Record<string, unknown> = {}) {
  const { brand, user } = await seedBrand();
  const b = await db.batch.create({ data: { brandId: brand.id, userId: user.id, title: "Summer drop" } });
  for (let i = 1; i <= n; i++) {
    await db.batchItem.create({ data: { batchId: b.id, position: i, filename: `piece-${i}.jpg`, photo: new Uint8Array(JPEG), photoType: "image/jpeg", readImage: new Uint8Array(JPEG), readType: "image/jpeg", ...extra } });
  }
  return { brand, user, b };
}
const ready: ItemDetails = { fields: { productType: "dress", freeText: "black midi dress with ruching", colour: "black", length: "midi", feature: "ruched" }, fromPhoto: ["colour"], unsure: [] };
const statuses = async (batchId: string) => (await db.batchItem.findMany({ where: { batchId }, orderBy: { position: "asc" } })).map((i) => i.status);

beforeEach(resetDb);
afterAll(() => db.$disconnect());

describe("reading a range's photos", () => {
  it("reads every photo into details for the buyer to check, and lets go of the large copy", async () => {
    const { b } = await range(3);
    await drain(providers());
    const items = await db.batchItem.findMany({ where: { batchId: b.id } });
    expect(items.map((i) => i.status)).toEqual(["review", "review", "review"]);
    const d = items[0].details as unknown as ItemDetails;
    expect(d.fields).toMatchObject({ productType: "dress", colour: "black", freeText: "black dress with a square neckline" });
    expect(d.fromPhoto).toContain("colour");
    expect(items.every((i) => i.readImage === null)).toBe(true);
  });

  it("marks a photo with no fashion piece in it", async () => {
    const { b } = await range(1);
    const notFashion: PhotoReader = { read: async () => ({ details: { not_a_product: true, product_type: null, colour: null, pattern: null, material: null, fit: null, length: null, feature: null, occasion: null, audience: null, description: "", unsure: [], focus: null }, usage: { inputTokens: 0, outputTokens: 0 } }) };
    await drain(providers(notFashion));
    expect(await statuses(b.id)).toEqual(["not_product"]);
  });

  it("gives up on a photo that keeps failing after three tries", async () => {
    const { b } = await range(1);
    let tries = 0;
    const broken: PhotoReader = { read: async () => { tries++; throw new Error("service unavailable"); } };
    await drain(providers(broken));
    const item = await db.batchItem.findFirstOrThrow({ where: { batchId: b.id } });
    expect([item.status, item.attempts, tries]).toEqual(["read_failed", 3, 3]);
    expect(item.readImage).not.toBeNull(); // kept, so "Read again" can try once more
  });
});

describe("naming a range", () => {
  it("names each checked piece through the normal pipeline, with its photo, and it shows up like any other name", async () => {
    const { b } = await range(2, { status: "to_name", details: ready, focus: { left: 0.2, top: 0.1, right: 0.8, bottom: 0.9 }, readImage: null });
    await drain(providers());
    const items = await rangeItems(b.id);
    expect(items.map((i) => i.status)).toEqual(["named", "named"]);
    expect(items[0].name).toMatch(/Dress$/);
    const g = await db.generation.findUniqueOrThrow({ where: { id: items[0].generationId! }, include: { photo: true } });
    expect(g.photo?.focus).toEqual({ left: 0.2, top: 0.1, right: 0.8, bottom: 0.9 });
    expect((g.usage as { notes: string[] }).notes.join()).toMatch(/range "Summer drop"/);
  });

  it("passes on Nomen's question when a piece needs a detail, and won't name a piece with nothing to go on", async () => {
    const vague: ItemDetails = { fields: { productType: "dress", freeText: "nice dress" }, fromPhoto: [], unsure: [] };
    const { b } = await range(1, { status: "to_name", details: vague, readImage: null });
    await db.batchItem.create({ data: { batchId: b.id, position: 2, filename: "blank.jpg", photo: new Uint8Array(JPEG), photoType: "image/jpeg", status: "to_name", details: { fields: { productType: "dress" }, fromPhoto: [], unsure: [] } } });
    await drain(providers());
    const items = await rangeItems(b.id);
    expect(items[0]).toMatchObject({ status: "needs_input" });
    expect(items[0].question).toMatch(/Tell us a little more/);
    expect(items[1].status).toBe("review"); // back to the buyer: no description yet
  });
});

describe("ranges of any size", () => {
  it("names a range well past the old 60-photo limit, and the screen's check fetches only what changed", async () => {
    const before = new Date(Date.now() - 1000);
    const { b } = await range(150, { status: "review", details: ready, readImage: null });
    const cut = new Date();
    // "Name" on the last 10, as the name route does it.
    await db.batchItem.updateMany({ where: { batchId: b.id, position: { gt: 140 } }, data: { status: "to_name", updatedAt: new Date() } });
    await drain(providers());
    expect((await statuses(b.id)).filter((s) => s === "named")).toHaveLength(10);
    const changed = await rangeItems(b.id, cut);
    expect(changed.map((i) => i.position)).toEqual([141, 142, 143, 144, 145, 146, 147, 148, 149, 150]);
    expect(await rangeItems(b.id, before)).toHaveLength(150);
  }, 60_000);
});

describe("work survives a restart", () => {
  it("puts a half-read photo back in the queue, gives up after three tries, and settles a half-named piece from its result", async () => {
    const old = new Date(Date.now() - 10 * 60_000);
    const { b, user, brand } = await range(2, { status: "reading", claimedAt: old, attempts: 1 });
    await db.batchItem.updateMany({ where: { batchId: b.id, position: 2 }, data: { attempts: 3 } });
    const g = await db.generation.create({ data: { brandId: brand.id, userId: user.id, originalInput: {}, status: "completed" } });
    await db.batchItem.create({ data: { batchId: b.id, position: 3, filename: "c.jpg", photo: new Uint8Array(JPEG), photoType: "image/jpeg", status: "naming", claimedAt: old, generationId: g.id } });
    await recoverStale();
    expect(await statuses(b.id)).toEqual(["queued", "read_failed", "named"]);
  });

  it(`never works on more than ${MAX_AT_ONCE} pieces at once, however often it is nudged`, async () => {
    const { b } = await range(7);
    let now = 0, most = 0;
    const slow: PhotoReader = { read: async (input) => { now++; most = Math.max(most, now); await new Promise((r) => setTimeout(r, 40)); now--; return new MockPhotoReader().read(input); } };
    const p = providers(slow);
    kick(p); kick(p); kick(p);
    for (let i = 0; i < 100 && (await statuses(b.id)).some((s) => s !== "review"); i++) await new Promise((r) => setTimeout(r, 30));
    expect(await statuses(b.id)).toEqual(Array(7).fill("review"));
    expect(most).toBeLessThanOrEqual(MAX_AT_ONCE);
    expect(most).toBeGreaterThan(1); // and it does work in parallel
  });
});

describe("range rules", () => {
  it("only lets the right people open a range", async () => {
    const { b, brand, user } = await range(0);
    const other = await db.user.create({ data: { username: "other", displayName: "O", passwordHash: "x", role: "buyer", brandId: brand.id } });
    const admin = await db.user.create({ data: { username: "admin", displayName: "A", passwordHash: "x", role: "admin", brandId: brand.id } });
    await expect(loadRangeFor(su(user), b.id)).resolves.toBeTruthy();
    await expect(loadRangeFor(su(admin), b.id)).resolves.toBeTruthy();
    await expect(loadRangeFor(su(other), b.id)).rejects.toMatchObject({ status: 404 });
  });

  it("treats an edited field as the buyer's own, and 'apply to every piece' never overwrites", () => {
    const d: ItemDetails = { fields: { productType: "dress", colour: "black" }, fromPhoto: ["productType", "colour"], unsure: [] };
    const edited = withEdits(d, { colour: "navy" });
    expect(edited.fields.colour).toBe("navy");
    expect(edited.fromPhoto).toEqual(["productType"]);
    expect(fillEmpty(edited, { colour: "white", audience: "girls" }).fields).toMatchObject({ colour: "navy", audience: "girls" });
    expect(cleanFields({ colour: "  red ", nonsense: "x", freeText: "a".repeat(900) })).toEqual({ colour: "red", freeText: "a".repeat(500) });
    expect([isReady(d), isReady(ready)]).toEqual([false, true]);
  });

  it("downloads a spreadsheet whose cells can't run as formulas, with the product data and duplicate names flagged", () => {
    const page = { status: "ready", metaTitle: "Black Ruched Midi Dress | T", metaDescription: "Shop it.", description: "A dress.\n\nWear it.", words: 4 };
    const sheet = {
      status: "ready" as const, google: { category: { id: 2271, path: "Clothing & Accessories > Clothing > Dresses" }, productType: "Women > Dresses > Midi Dresses", colour: "Black", pattern: null, material: null, gender: "Female", ageGroup: "Adult", sizeType: "Regular", sizeSystem: "AU" as const, customLabels: ["Cocktail", "", "", "", ""] },
      highlights: ["Ruched body", "Midi length"], details: [{ section: "Fit", name: "Length", value: "Midi" }], shortDescription: "A black ruched midi dress.",
      idealFor: { live: [{ key: "cocktail", label: "Cocktail", outcome: "live" as const, reason: "Ruched midi.", demand: 9900 }], review: [], sentence: "Ideal for cocktail evenings." },
      season: null, care: null, imageAlt: "Black ruched midi dress", searchQueries: [{ phrase: "black midi dress", volume: 4200 }], checks: ["Material left blank: it wasn't given, and it's never guessed."],
    };
    const base = { position: 1, status: "named" as const, details: ready, focus: null, generationId: "g", alternatives: ["A", "B"], confidence: "low", question: null, page, sheet, hasPhoto: true, file: null };
    const csv = rangeCsv([{ ...base, id: "1", filename: "=HYPERLINK(\"x\")", name: "Black Midi Dress, Ruched" }, { ...base, id: "2", filename: "b.jpg", name: "Black Midi Dress, Ruched", sheet: null }]);
    expect(csv.startsWith("\uFEFFPhoto,Name,Other options,Confidence,Status,Checks,Meta title,Meta description,Description,Description words,Short description,Highlights")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(`"Black Midi Dress, Ruched",A | B,Low,Named,"Same name as b.jpg | Material left blank: it wasn't given, and it's never guessed.",Black Ruched Midi Dress | T,Shop it.,"A dress.\n\nWear it.",4,A black ruched midi dress.,Ruched body | Midi length,Length: Midi,Cocktail,,Clothing & Accessories > Clothing > Dresses,2271,Women > Dresses > Midi Dresses,Black`);
    expect(csv).toContain("black-midi-dress-ruched,black midi dress (4200),dress,black midi dress with ruching,,");
  });
});
