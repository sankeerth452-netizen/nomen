import { describe, expect, it } from "vitest";
import { cleanAttributes, kindOf, materialLabel, unsupportedClaims } from "@/lib/category/rules";
import { detailsFromPhoto, mergePhotoDetails } from "@/lib/batch/shared";
import { inventedInText, allowedFrom } from "@/lib/pipeline/content";
import { detailNamesFor } from "@/lib/sheet/catalog";
import { PHOTO_SYSTEM } from "@/lib/prompts";
import type { PhotoDetails } from "@/lib/pipeline/types";
import type { ProductFacts } from "@/lib/providers/types";

const facts = (product_type: string, more: Partial<ProductFacts> = {}): ProductFacts => ({ product_type, colour: [], material: [], pattern: [], fit_or_silhouette: [], length: [], features: [], occasion_or_style: [], audience: null, buyer_terms: [], unknowns: [], conflicts: [], ...more });
const photo = (more: Partial<PhotoDetails>): PhotoDetails => ({ not_a_product: false, product_type: "heels", colour: "black", pattern: null, material: null, fit: null, length: null, feature: null, occasion: null, audience: null, description: "black heels", unsure: [], focus: null, attributes: [], images: [], ...more });

describe("which kind of piece it is", () => {
  it.each([
    ["sneakers", "shoes"], ["ballet flats", "shoes"], ["knee-high boots", "shoes"], ["thong sandals", "shoes"],
    ["one-piece swimsuit", "swimwear"], ["one piece", "swimwear"], ["bikini top", "swimwear"], ["bikini bottoms", "swimwear"], ["tankini", "swimwear"],
    ["bra", "lingerie"], ["bralette", "lingerie"], ["thong", "lingerie"], ["pyjama set", "lingerie"],
    ["sports bra", "activewear"], ["gym leggings", "activewear"], ["bike shorts", "activewear"], ["tracksuit", "activewear"],
    ["hoop earrings", "jewellery"], ["necklace", "jewellery"], ["crossbody bag", "bags"], ["bucket hat", "accessories"], ["claw clip", "accessories"],
    ["midi dress", "apparel"], ["tennis dress", "apparel"], ["denim shorts", "apparel"], ["leggings", "apparel"],
  ])("%s is %s", (type, kind) => expect(kindOf(type)).toBe(kind));

  it("everyday pieces are activewear only when what they're for says so", () => {
    expect(kindOf("leggings", "yoga")).toBe("activewear");
    expect(kindOf("crop top", "gym")).toBe("activewear");
    expect(kindOf("crop top", "party")).toBe("apparel");
  });

  it("asks for the material in the kind's own words", () => {
    expect(materialLabel("heels")[0]).toBe("Upper material");
    expect(materialLabel("earrings")[0]).toBe("Metal or material");
    expect(materialLabel("bikini top")[0]).toBe("Fabric (from the label)");
    expect(materialLabel("midi dress")[0]).toBe("Material");
  });
});

describe("what a photo may say", () => {
  it("keeps only the kind's details a photo can show, never the retailer-only ones", () => {
    const out = cleanAttributes("heels", [
      { name: "heel type", value: " block ", seen: "clear" }, { name: "Heel type", value: "stiletto", seen: "clear" },
      { name: "Upper", value: "leather", seen: "clear" }, { name: "Toe", value: "pointed", seen: "partly" }, { name: "Colour", value: "black", seen: "clear" },
    ]);
    expect(out).toEqual([{ name: "Heel type", value: "block", seen: "clear" }, { name: "Toe", value: "pointed", seen: "partly" }]);
    expect(cleanAttributes("sports bra", [{ name: "Support", value: "high", seen: "clear" }])).toEqual([]);
    expect(cleanAttributes("midi dress", [{ name: "Neckline", value: "V", seen: "clear" }])).toEqual([]);
  });

  it("clearly visible details become facts to check; partly visible ones are only flagged", () => {
    const d = detailsFromPhoto(photo({ attributes: [{ name: "Heel type", value: "block", seen: "clear" }, { name: "Toe", value: "pointed", seen: "partly" }], unsure: ["upper material"] }));
    expect(d.fields.extra).toBe("Heel type: block.");
    expect(d.fromPhoto).toContain("extra");
    expect(d.unsure).toEqual(["upper material", "toe"]);
    expect(d.attributes).toHaveLength(2);
  });

  it("a product file's own notes stay first, with the photo's details after them", () => {
    const fromPhoto = detailsFromPhoto(photo({ attributes: [{ name: "Heel type", value: "block", seen: "clear" }] }));
    const merged = mergePhotoDetails({ fields: { productType: "heels", freeText: "Ava heels", extra: "Upper: synthetic." }, fromPhoto: [], unsure: [] }, fromPhoto);
    expect(merged.fields.extra).toBe("Upper: synthetic. Heel type: block.");
    expect(merged.fromPhoto).not.toContain("extra");
  });

  it("the photo instructions carry every kind's rules", () => {
    expect(PHOTO_SYSTEM).toMatch(/Shoes \(sneakers, boots/);
    expect(PHOTO_SYSTEM).toMatch(/one-piece swimsuit, bikini top, bikini bottoms/);
    expect(PHOTO_SYSTEM).toMatch(/Never from a photo: padding, underwire, support level/);
    expect(PHOTO_SYSTEM).toMatch(/Never name the metal itself/);
  });
});

describe("claims each kind never makes without the retailer's data", () => {
  it("finds them, and lets through what the retailer said", () => {
    expect(unsupportedClaims("lingerie", "Offers all-day comfort and gentle support.", "lace triangle bralette")).toEqual(expect.arrayContaining(["all-day", "comfort", "support"]));
    expect(unsupportedClaims("lingerie", "A padded plunge bra.", "padded plunge bra, black lace")).toEqual([]);
    expect(unsupportedClaims("jewellery", "Crafted in 18k gold plated brass.", "gold hoop earrings")).toEqual(expect.arrayContaining(["18k", "gold plated"]));
    expect(unsupportedClaims("jewellery", "Chunky gold-tone hoops.", "gold hoop earrings")).toEqual([]);
    expect(unsupportedClaims("swimwear", "UPF 50+ fabric that's chlorine resistant.", "black one-piece swimsuit")).toEqual(expect.arrayContaining(["upf 50", "chlorine resistant"]));
    expect(unsupportedClaims("activewear", "Sweat-wicking and squat-proof.", "Fabric: sweat-wicking nylon.")).toEqual(["squat-proof"]);
  });

  it("durability is a claim too, for any kind of piece", () => {
    const allowed = allowedFrom(["indigo denim shorts"]);
    expect(inventedInText("Hard-wearing cotton denim built to last.", allowed, "indigo denim shorts")).toEqual(expect.arrayContaining(["hard-wearing", "built to last"]));
    expect(inventedInText("A durable denim short.", allowed, "durable 100% cotton denim")).toEqual([]);
  });

  it("product pages and data are checked with the kind's claims", () => {
    const allowed = allowedFrom(["black sports bra"]);
    expect(inventedInText("A high-support sports bra.", allowed, "black sports bra", "activewear")).toEqual(expect.arrayContaining(["high-support"]));
    expect(inventedInText("A high-support sports bra.", allowed, "black sports bra")).toEqual([]); // the general check alone doesn't know it
  });

  it("product data asks for each kind's own details", () => {
    expect(detailNamesFor(facts("one-piece swimsuit"))).toEqual(expect.arrayContaining(["Neckline", "Back", "Coverage"]));
    expect(detailNamesFor(facts("bra"))).toEqual(expect.arrayContaining(["Padding", "Underwire", "Support"]));
    expect(detailNamesFor(facts("leggings", { occasion_or_style: ["gym"] }))).toEqual(expect.arrayContaining(["Waistband", "Leg length"]));
    expect(detailNamesFor(facts("hoop earrings"))).toEqual(expect.arrayContaining(["Metal", "Finish"]));
  });
});
