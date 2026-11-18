import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createGeneration, runPipeline } from "@/lib/pipeline/run";
import { allowedFrom } from "@/lib/pipeline/content";
import { assembleSheet, checkSheet, fitText, writeSheet, type StoredSheet } from "@/lib/pipeline/sheet";
import { breadcrumbFor, categoryFor, genderAge, googleColour, googleMaterial, googlePattern, plainColour, sizeType } from "@/lib/sheet/catalog";
import { idealForSentence, judgeSeason, judgeTags } from "@/lib/sheet/idealFor";
import { MockContentWriter, MockFactExtractor, MockPhotoReader, MockRecommender, MockSerpProvider, MockSheetWriter } from "@/lib/providers/mock";
import type { Providers } from "@/lib/providers";
import type { ProductFacts, SheetWriter } from "@/lib/providers/types";
import type { SheetDraft } from "@/lib/pipeline/types";
import { resetDb, seedBrand } from "./helpers";

const facts = (o: Partial<ProductFacts> & { product_type: string }): ProductFacts => ({
  colour: [], material: [], pattern: [], fit_or_silhouette: [], length: [], features: [], occasion_or_style: [], audience: null, buyer_terms: [], unknowns: [], conflicts: [], ...o,
} as ProductFacts);

describe("what the rules decide (never Claude)", () => {
  it("puts each piece in the right Google category, with Google's own IDs", () => {
    expect(categoryFor(facts({ product_type: "dress" }))?.id).toBe(2271);
    expect(categoryFor(facts({ product_type: "baggy jeans" }))?.id).toBe(204);
    expect(categoryFor(facts({ product_type: "tote bag" }))?.id).toBe(3032);
    expect(categoryFor(facts({ product_type: "backpack" }))?.id).toBe(100);
    expect(categoryFor(facts({ product_type: "earrings" }))?.path).toBe("Clothing & Accessories > Jewellery & Watches > Earrings");
    expect(categoryFor(facts({ product_type: "leggings", occasion_or_style: ["gym"] }))?.id).toBe(5322);
    expect(categoryFor(facts({ product_type: "dress", audience: "baby" }))?.id).toBe(5424);
    expect(categoryFor(facts({ product_type: "dress", features: ["bridal"] }))?.id).toBe(5329);
    expect(categoryFor(facts({ product_type: "thingamajig" }))).toBeNull();
    expect(categoryFor(facts({ product_type: "culotte" }))?.id).toBe(204);
    expect(categoryFor(facts({ product_type: "crochet vest" }))?.id).toBe(212); // a sweater vest is a top
    expect(categoryFor(facts({ product_type: "vest", features: ["puffer"] }))?.id).toBe(1831);
  });

  it("builds the breadcrumb from who it's for, the category and the style", () => {
    expect(breadcrumbFor(facts({ product_type: "dress", length: ["maxi"] }))).toBe("Women > Dresses > Maxi Dresses");
    expect(breadcrumbFor(facts({ product_type: "dress", length: ["maxi"], audience: "girls" }))).toBe("Girls > Dresses > Maxi Dresses");
    expect(breadcrumbFor(facts({ product_type: "jeans", fit_or_silhouette: ["baggy"] }))).toBe("Women > Jeans & Denim > Baggy Jeans");
    expect(breadcrumbFor(facts({ product_type: "blouse" }))).toBe("Women > Tops > Blouses");
    expect(breadcrumbFor(facts({ product_type: "top" }))).toBe("Women > Tops");
    expect(breadcrumbFor(facts({ product_type: "tote bag" }))).toBe("Women > Bags > Tote Bags");
  });

  it("sends the plain colour Google wants, main colour first, at most three", () => {
    expect(plainColour("cocoa")).toBe("Brown");
    expect(plainColour("light dusty pink")).toBe("Pink");
    expect(plainColour("rose gold")).toBe("Gold");
    expect(plainColour("light wash")).toBe("Blue");
    expect(plainColour("black wash")).toBe("Black");
    expect(googleColour(["cream"]).value).toBe("Cream");
    expect(googleColour(["black", "white", "sage", "red"]).value).toBe("Black/White/Green");
    expect(googleColour(["cocoa", "latte"]).value).toBe("Brown/Beige");
    // A shade that isn't a colour shoppers recognise is not sent (a person is asked to add one).
    expect(googleColour(["hibisicus and frangipani"])).toEqual({ value: null, unmapped: ["hibisicus and frangipani"] });
    expect(googleColour(["pink", "green", "zorblax"]).value).toBe("Pink/Green");
    // Two-colour names, and shade words that only describe a colour.
    expect(googleColour(["chocolate ecru"]).value).toBe("Brown/Cream");
    expect(googleColour(["pink red"]).value).toBe("Pink/Red");
    expect(googleColour(["pink and green"]).value).toBe("Pink/Green");
    expect(googleColour(["navy blue"]).value).toBe("Navy");
    expect(googleColour(["olive green"]).value).toBe("Olive");
    expect(googleColour(["coral pink"]).value).toBe("Pink");
    expect(googleColour(["ice blue"]).value).toBe("Blue");
    expect(googleColour(["matcha ombre"]).value).toBe("Green");
    expect(googleColour(["brights"]).value).toBe("Multicolour");
    expect(googleColour(["blues"]).value).toBe("Blue");
    expect(googleColour([]).value).toBeNull();
  });

  it("only sends a material that was stated, without percentages", () => {
    expect(googleMaterial(["55% linen 45% viscose"])).toBe("Linen/Viscose");
    expect(googleMaterial(["satin"])).toBe("Satin");
    expect(googleMaterial(["100% cotton denim"])).toBe("Cotton");
    expect(googleMaterial(["silk satin"])).toBe("Silk");
    // The main fibre first by its share, even when the blend is named after the smaller one.
    expect(googleMaterial(["linen blend", "73% viscose", "27% linen"])).toBe("Viscose/Linen");
    expect(googleMaterial(["50% recy poly 40% poly 10% vis"])).toBe("Polyester/Viscose");
    expect(googleMaterial(["pu"])).toBe("Polyurethane");
    expect(googleMaterial(["woven"])).toBeNull(); // a weave on its own isn't a material
    expect(googleMaterial(["raffia"])).toBe("Raffia");
    expect(googleMaterial([])).toBeNull();
    expect(googlePattern(["ditsy floral print"])).toBe("Floral");
    expect(googlePattern(["pinstripe"])).toBe("Striped");
    expect(googlePattern([])).toBeNull();
  });

  it("works out gender, age group and size type, women's adult by default", () => {
    expect(genderAge(null)).toEqual({ gender: "Female", ageGroup: "Adult" });
    expect(genderAge("girls")).toEqual({ gender: "Female", ageGroup: "Kids" });
    expect(genderAge("men")).toEqual({ gender: "Male", ageGroup: "Adult" });
    expect(genderAge("toddler")).toEqual({ gender: "Unisex", ageGroup: "Toddler" });
    expect(genderAge("toddler", "dress")).toEqual({ gender: "Female", ageGroup: "Toddler" });
    expect(genderAge("kids", "tee")).toEqual({ gender: "Unisex", ageGroup: "Kids" });
    expect(sizeType("black midi dress")).toBe("Regular");
    expect(sizeType("petite wide-leg pants")).toBe("Petite");
    expect(sizeType("maternity dress")).toBe("Maternity");
  });
});

describe("ideal for", () => {
  const vols = new Map([["wedding guest dress", 26000], ["cocktail dress", 9900], ["funeral dress", 1600], ["casual dress", 5400], ["races dress", 40]]);
  const satinSlip = facts({ product_type: "dress", material: ["satin"], length: ["midi"], features: ["slip"], colour: ["black"] });

  it("tags an occasion only when the details support it and shoppers search for it", () => {
    const v = judgeTags([{ tag: "cocktail", confidence: "high", reason: "Satin slip midi." }, { tag: "wedding_guest", confidence: "high", reason: "Dressy satin." }], satinSlip, vols);
    expect(v.map((x) => [x.key, x.outcome])).toEqual([["cocktail", "live"], ["wedding_guest", "live"]]);
    expect(idealForSentence(v)).toBe("Ideal for cocktail evenings and wedding guests.");
  });

  it("never calls a cotton t-shirt dress wedding guest", () => {
    const v = judgeTags([{ tag: "wedding_guest", confidence: "high", reason: "x" }], facts({ product_type: "t-shirt dress", material: ["cotton"] }), vols);
    expect(v[0]).toMatchObject({ outcome: "dropped" });
    expect(v[0].reason).toMatch(/too casual/);
  });

  it("sends doubtful tags to review, not to the live copy: Claude unsure, weak details, or few searches", () => {
    const plainDress = facts({ product_type: "dress", colour: ["blue"], material: ["cotton"] });
    const v = judgeTags([
      { tag: "cocktail", confidence: "high", reason: "x" }, // nothing dressy
      { tag: "everyday", confidence: "low", reason: "Could work day to day." }, // Claude unsure
    ], plainDress, vols);
    expect(v.map((x) => x.outcome)).toEqual(["review", "review"]);
    expect(judgeTags([{ tag: "races", confidence: "high", reason: "x" }], satinSlip, vols)[0]).toMatchObject({ outcome: "review", reason: expect.stringMatching(/Only about 40 searches/) });
    expect(judgeTags([{ tag: "cocktail", confidence: "high", reason: "x" }], satinSlip, null)[0].reason).toMatch(/no keyword list/);
    expect(idealForSentence(v)).toBeNull();
  });

  it("is conservative with church and funeral: only plainly sober pieces", () => {
    const sober = facts({ product_type: "dress", colour: ["black"], length: ["midi"], fit_or_silhouette: ["a-line"] });
    expect(judgeTags([{ tag: "church_funeral", confidence: "high", reason: "x" }], sober, vols)[0].outcome).toBe("live");
    for (const f of [facts({ product_type: "dress", colour: ["red"], length: ["midi"] }), facts({ product_type: "dress", colour: ["black"], material: ["sequin"] }), facts({ product_type: "dress", colour: ["black"], length: ["mini"] }), facts({ product_type: "dress", colour: ["navy"], pattern: ["floral"] })]) {
      expect(judgeTags([{ tag: "church_funeral", confidence: "high", reason: "x" }], f, vols)[0].outcome).toBe("dropped");
    }
  });

  it("keeps at most four tags and ignores anything outside the list", () => {
    const many = ["cocktail", "wedding_guest", "date_night", "going_out", "formal", "made_up"].map((tag) => ({ tag, confidence: "high" as const, reason: "x" }));
    expect(judgeTags(many, satinSlip, vols).filter((v) => v.outcome !== "dropped").length).toBeLessThanOrEqual(4);
    expect(judgeTags(many, satinSlip, vols).some((v) => v.key === "made_up")).toBe(false);
  });

  it("doubts a season the details contradict", () => {
    expect(judgeSeason({ value: "summer", confidence: "high", reason: "x" }, facts({ product_type: "coat", material: ["wool"] }))?.confidence).toBe("low");
    expect(judgeSeason({ value: "summer", confidence: "high", reason: "x" }, facts({ product_type: "dress", material: ["linen"] }))?.confidence).toBe("high");
  });
});

describe("checking Claude's words", () => {
  const f = facts({ product_type: "dress", colour: ["black"], length: ["midi"], features: ["ruched"] });
  const source = "black midi dress with ruching · dress · black · midi · ruched";
  const ctx = { facts: f, allowed: allowedFrom([source]), source, detailNames: ["Neckline", "Length", "Fabric", "Details"] };
  const long = (s: string) => `${s} ${"It is easy to wear and simple to style. ".repeat(12)}`.trim();
  const draft = (o: Partial<SheetDraft> = {}): SheetDraft => ({
    highlights: ["Ruched through the body", "Midi length"], details: [{ name: "Length", value: "Midi" }], short_description: long("A black midi dress with ruching."),
    google_category_id: null, ideal_for: [], season: null, care: null, image_alt: "Black ruched midi dress", ...o,
  });

  it("passes a draft that sticks to the facts", () => {
    expect(checkSheet(draft(), ctx).problems).toEqual([]);
  });

  it("catches invented details, care that wasn't given, slimming claims and broken limits", () => {
    const c = checkSheet(draft({
      highlights: ["Soft linen fabric", "Slimming fit", "Midi length", "a", "b", "c", "d"], details: [{ name: "Fabric", value: "Silk" }, { name: "Collar", value: "Peter Pan" }],
      care: "Machine wash cold", image_alt: "Image of a white dress",
    }), ctx);
    const all = c.problems.join(" | ");
    expect(all).toMatch(/highlights has 7 items/);
    expect(all).toMatch(/"Soft linen fabric" states details that are not in the facts: linen/);
    expect(all).toMatch(/slimming/);
    expect(all).toMatch(/detail "Fabric: Silk"/);
    expect(all).toMatch(/detail name "Collar" isn't one of detail_names/);
    expect(all).toMatch(/care instructions weren't given/);
    expect(all).toMatch(/must not start with "Image of"/);
    expect(all).toMatch(/image_alt states details that are not in the facts: white/);
    expect([...c.badHighlights].sort()).toEqual([0, 1]);
    expect(c.badCare && c.badAlt).toBe(true);
  });

  it("leaves out whatever still invents after the repair, and fills the rest from the rules", () => {
    const d = draft({ highlights: ["Soft linen fabric", "Ruched through the body", "Midi length"], ideal_for: [{ tag: "cocktail", confidence: "high", reason: "Ruched midi." }], image_alt: "White dress" });
    const s = assembleSheet(d, checkSheet(d, ctx), { ...ctx, volumes: new Map([["cocktail dress", 9900]]), bundle: null, cited: [], inputText: source });
    expect(s.highlights).toEqual(["Ruched through the body", "Midi length"]);
    expect(s.imageAlt).toBeNull();
    expect(s.google).toMatchObject({ category: { id: 2271 }, productType: "Women > Dresses > Midi Dresses", colour: "Black", material: null, gender: "Female", ageGroup: "Adult", sizeType: "Regular", sizeSystem: "AU" });
    expect(s.google.customLabels[0]).toBe("Cocktail");
    expect(s.shortDescription!.endsWith("Ideal for cocktail evenings.")).toBe(true);
    expect(s.shortDescription!.length).toBeLessThanOrEqual(1000);
    expect(s.details).toEqual([{ section: "Fit", name: "Length", value: "Midi" }]);
    expect(s.checks.join(" ")).toMatch(/Material left blank/);
  });

  it("trims at a sentence, never mid-word", () => {
    expect(fitText("One sentence here. Another one that runs on and on.", 30)).toBe("One sentence here.");
    expect(fitText("Short.", 30)).toBe("Short.");
  });
});

describe("product data after the name", () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());
  const providers = (sheet: SheetWriter = new MockSheetWriter()): Providers => ({ extractor: new MockFactExtractor(), recommender: new MockRecommender(), serp: new MockSerpProvider(), photo: new MockPhotoReader(), content: new MockContentWriter(), sheet, modelName: "mock" });
  const dress = { freeText: "black midi dress with ruching", productType: "dress", colour: "black", length: "midi", feature: "ruched" };

  it("writes the product data beside the product page, and neither overwrites the other", async () => {
    const { brand, user } = await seedBrand();
    const id = await createGeneration(user, brand.id, dress);
    await runPipeline(id, providers());
    const g = await db.generation.findUniqueOrThrow({ where: { id } });
    const r = g.result as { recommendation: unknown; content: { status: string }; sheet: StoredSheet };
    expect(r.recommendation).toBeTruthy();
    expect(r.content.status).toBe("ready");
    expect(r.sheet.status).toBe("ready");
    if (r.sheet.status !== "ready") return;
    expect(r.sheet.google).toMatchObject({ category: { id: 2271 }, colour: "Black", gender: "Female", sizeSystem: "AU" });
    expect(r.sheet.highlights.length).toBeGreaterThanOrEqual(2);
    expect(r.sheet.shortDescription!.length).toBeGreaterThanOrEqual(500);
    expect(g.promptVersions).toMatchObject({ content: "content-v2", sheet: "sheet-v2" });
  });

  it("asks once to fix a draft that invents, and a sheet that keeps failing never touches the name", async () => {
    const { brand, user } = await seedBrand();
    const id = await createGeneration(user, brand.id, dress);
    let calls = 0;
    const inventing: SheetWriter = { write: async (p) => { calls++; const r = await new MockSheetWriter().write(p); return { ...r, sheet: { ...r.sheet, highlights: ["Pure silk", ...r.sheet.highlights] } }; } };
    await runPipeline(id, providers(inventing));
    let g = await db.generation.findUniqueOrThrow({ where: { id } });
    expect(calls).toBe(2);
    const sheet = (g.result as { sheet: StoredSheet }).sheet;
    expect(sheet.status === "ready" && sheet.highlights.some((h) => /silk/i.test(h))).toBe(false); // left out after the repair
    expect((g.usage as { notes: string[] }).notes.join(" ")).toMatch(/Product data \(first draft\).*silk/);

    const broken: SheetWriter = { write: async () => { throw new Error("service unavailable"); } };
    await writeSheet(id, { providers: providers(broken) });
    g = await db.generation.findUniqueOrThrow({ where: { id } });
    expect(g.status).toBe("completed");
    expect((g.result as { sheet: StoredSheet }).sheet.status).toBe("failed");
  });
});
