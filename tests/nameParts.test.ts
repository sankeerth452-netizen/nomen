import { describe, expect, it } from "vitest";
import { anatomy } from "@/lib/nameParts";
import { detailNamesFor } from "@/lib/sheet/catalog";
import { emptyFacts } from "./helpers";

const show = (parts: { text: string; kind: string }[]) => parts.map((p) => `${p.kind}:${p.text}`);

describe("the name's parts on the result screen", () => {
  it("never shows '&' as a part, keeps a detail's words together and labels a pattern (seen on a saree, 18 Nov)", () => {
    const parts = anatomy("Maroon & Gold Check Saree With Zari Border", ["maroon", "gold", "check", "woven zari border"], "saree");
    expect(show(parts)).toEqual(["colour:Maroon", "colour:Gold", "pattern:Check", "product:Saree", "detail:Zari Border"]);
  });

  it("reads 'Square Neck' in the name as the buyer's 'square neckline'", () => {
    const parts = anatomy("Cream Square Neck Lace Trim Top", ["cream", "square neckline", "lace trim"], "top");
    expect(show(parts)).toEqual(["colour:Cream", "detail:Square Neck", "detail:Lace Trim", "product:Top"]);
  });

  it("still splits a name whose details weren't grouped by the buyer", () => {
    expect(show(anatomy("Black Mesh Sleeve Midi Dress", ["black", "mesh sleeve", "midi"], "dress"))).toEqual(["colour:Black", "detail:Mesh Sleeve", "length:Midi", "product:Dress"]);
  });
});

describe("product details for traditional pieces", () => {
  it("names a saree's details the way they're sold", () => {
    expect(detailNamesFor({ ...emptyFacts, product_type: "saree" })).toEqual(expect.arrayContaining(["Border", "Blouse", "Drape", "Fabric"]));
    expect(detailNamesFor({ ...emptyFacts, product_type: "dress" })).toContain("Neckline");
  });
});

describe("colour swatches", () => {
  it("paints each colour in a Google value, a brand's own shade as its plain colour, and leaves an unknown one as words", async () => {
    const { swatchesFor } = await import("@/lib/sheet/swatches");
    expect(swatchesFor("Maroon/Gold").map((s) => [s.name, !!s.paint])).toEqual([["Maroon", true], ["Gold", true]]);
    expect(swatchesFor("Cocoa")[0].paint).toBe(swatchesFor("Brown")[0].paint);
    expect(swatchesFor("Zorblax")[0].paint).toBeNull();
    expect(swatchesFor(null)).toEqual([]);
  });
});

describe("keyword list search phrases", () => {
  it("makes real plurals (dresses, never 'dresss'), so no search is wasted on a word nobody types", async () => {
    const { searchVariants } = await import("@/lib/keywords/retrieve");
    const v = searchVariants({ ...emptyFacts, product_type: "dress", colour: ["black"] });
    expect(v).toContain("black dresses");
    expect(v.some((x) => /dresss/.test(x))).toBe(false);
    expect(searchVariants({ ...emptyFacts, product_type: "top" })).toContain("tops");
  });
});
