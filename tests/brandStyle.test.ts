import { describe, expect, it } from "vitest";
import { analyseCatalogue, voiceSample } from "@/lib/brandStyle";
import { catalogueIssues } from "@/lib/catalogue/check";
import type { PresentedItem } from "@/lib/batch/ranges";

const colours = ["Black", "Ecru", "Chocolate", "Navy", "Sage"];
const titles = [
  ...colours.map((c) => `${c} Satin Midi Dress`), ...colours.map((c) => `${c} Linen Wide Leg Pants`), ...colours.map((c) => `${c} Ruched Mini Skirt`),
  ...colours.map((c) => `${c} Knit Cardigan`), "Black Tailored Trousers", "Ecru Cotton Tee", "Navy Cotton Tee", "Black Cotton Tee",
];
const rows = titles.map((t, i) => ({ title: t, description: `<p>Meet the ${t.toLowerCase()}, made for warm days and late nights.</p><p>Wear it with sandals and a light jacket. Number ${i}.</p>` }));

describe("learning a brand's style from its catalogue", () => {
  const p = analyseCatalogue(rows);

  it("measures its names: length, capitals and the order of details", () => {
    expect(p.products).toBe(24);
    expect(p.titles.titleCase).toBe("title");
    expect(p.titles.averageWords).toBeGreaterThan(3);
    expect(p.suggestedMaxLength).toBeGreaterThanOrEqual(p.titles.longest90);
    expect(p.attributeOrder?.[0]).toBe("colour");
    expect(p.attributeOrder!.indexOf("material")).toBeLessThan(p.attributeOrder!.indexOf("length"));
  });

  it("finds which of two words it uses, only when one clearly leads", () => {
    expect(p.terms[0]).toMatchObject({ use: "Pants", instead: ["trousers"], kind: "product", counts: [{ word: "pants", count: 5 }, { word: "trousers", count: 1 }] });
    // Always "Tee", never "t-shirt": suggested, so a buyer's "t-shirt" comes out as the brand writes it.
    expect(p.terms).toContainEqual(expect.objectContaining({ use: "Tee", instead: ["t-shirt"] }));
    expect(analyseCatalogue([...rows, ...["a", "b"].map((x) => ({ title: `Black ${x} Trousers` }))]).terms.some((t) => t.use === "Pants")).toBe(false); // 5 against 3: no clear lead
  });

  it("lists its colours, product words and how its descriptions are built", () => {
    expect(p.colours.map((c) => c.word)).toEqual(expect.arrayContaining(["Black", "Ecru", "Navy"]));
    expect(p.nouns[0].count).toBeGreaterThanOrEqual(4);
    expect(p.descriptions).toMatchObject({ averageParagraphs: 2, usesLists: false, withDescription: 24 });
    expect(p.examples.length).toBeGreaterThan(0);
  });

  it("reads its voice from a small, varied sample without its markup", () => {
    const s = voiceSample(rows);
    expect(s.length).toBeLessThanOrEqual(12);
    expect(s[0].description).not.toMatch(/<p>/);
  });
});

describe("brand consistency across a range", () => {
  const item = (id: string, name: string) => ({ id, name, filename: `${id}.jpg`, status: "named", sheet: null, page: null, details: null, file: null }) as unknown as PresentedItem;

  it("suggests the brand's own word, never changing anything itself", () => {
    const rows = catalogueIssues([item("1", "Black Tailored Trousers")], { terms: [{ use: "Pants", instead: ["trousers"], kind: "product" }] });
    expect(rows).toContainEqual(expect.objectContaining({ where: "Brand words", problem: `Uses "trousers": your word is "Pants" (Black Tailored Pants)` }));
  });

  it("points out names whose details are in a different order from the rest", () => {
    const names = [...colours.map((c, i) => item(`a${i}`, `${c} Satin Midi Dress`)), ...colours.map((c, i) => item(`b${i}`, `${c} Linen Maxi Skirt`)), item("odd", "Midi Black Satin Dress")];
    const odd = catalogueIssues(names).filter((r) => r.where === "Brand words");
    expect(odd.map((r) => r.product)).toEqual(["Midi Black Satin Dress"]);
    expect(odd[0].problem).toMatch(/mostly goes colour, material, length/);
  });
});
