import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { PresentedItem } from "@/lib/batch/ranges";
import { reportCsv, reportRows } from "@/lib/batch/report";
import { catalogueIssues } from "@/lib/catalogue/check";
import { parseTaxonomy, storeTaxonomy } from "@/lib/sheet/taxonomy";
import type { FileCheck } from "@/lib/feed/shared";
import { resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

const sheet = (o: Record<string, unknown> = {}, google: Record<string, unknown> = {}) => ({
  status: "ready", highlights: ["Easy to wear", "Midi length"], details: [{ section: "Design", name: "Length", value: "Midi" }], shortDescription: "A dress.", imageAlt: "Front view",
  idealFor: { live: [], review: [], sentence: null }, season: null, care: null, searchQueries: [], checks: [],
  google: { category: { id: 2271, path: "Clothing > Dresses" }, productType: "Women > Dresses", colour: "Black", pattern: null, material: null, gender: "Female", ageGroup: "Adult", sizeType: "Regular", sizeSystem: "AU", customLabels: ["", "", "", "", ""], ...google },
  ...o,
});
const item = (id: string, name: string | null, o: Record<string, unknown> = {}) =>
  ({ id, position: 1, filename: `${id}.jpg`, status: name ? "named" : "review", name, alternatives: [], confidence: "high", question: null, page: { status: "ready" }, sheet: sheet(), file: null, details: null, ...o }) as unknown as PresentedItem;
const categories = new Map([[2271, "Clothing & Accessories > Clothing > Dresses"], [212, "Clothing & Accessories > Clothing > Shirts & Tops"]]);

describe("checking a whole range", () => {
  it("flags the same web address twice and one thing called two ways", () => {
    const rows = catalogueIssues([item("a", "Grey Knit Jumper"), item("b", "Grey Knit Jumper!"), item("c", "Gray Wool Jumper")], { categories });
    expect(rows.filter((r) => /Same web address/.test(r.problem))).toHaveLength(2);
    expect(rows.some((r) => r.product === "Whole range" && /"grey" \(2\) and "gray" \(1\)/.test(r.problem))).toBe(true);
  });

  it("holds every attribute to Google's rules, including the category against Google's own list", () => {
    const bad = item("x", "Black Midi Dress", { sheet: sheet({ imageAlt: null, highlights: Array(11).fill("A highlight") }, { category: { id: 999999, path: "Made up" }, gender: "Women", colour: "Black/White/Red/Blue" }) });
    const problems = catalogueIssues([bad], { categories }).map((r) => r.problem).join(" | ");
    expect(problems).toMatch(/999999 isn't in Google's current list/);
    expect(problems).toMatch(/Gender "Women"/);
    expect(problems).toMatch(/4 colours/);
    expect(problems).toMatch(/11 highlights/);
    expect(problems).toMatch(/No image alt text/);
    expect(catalogueIssues([item("ok", "Black Midi Dress")], { categories })).toEqual([]);
  });

  it("checks the brand's own Google category and mixed size systems", () => {
    const rows = catalogueIssues([item("p", "Black Midi Dress")], {
      categories, brandCategoriesByItem: new Map([["p", ["2271", "Apparel & Accessories > Clothing > Dresses", "Dresses"]]]), sizesByItem: new Map([["p", ["8", "10", "S", "M"]]]),
    });
    expect(rows.filter((r) => /isn't in Google's list/.test(r.problem)).map((r) => r.problem)).toEqual([expect.stringMatching(/"Dresses"/)]);
    expect(rows.some((r) => /Sizes mix numbers and letters/.test(r.problem))).toBe(true);
  });
});

describe("the problems report", () => {
  it("puts each product-file problem against its product, errors first, with photo and naming problems", () => {
    const check: FileCheck = { format: "Spreadsheet", rows: 3, products: 2, skippedRows: 0, leftOut: 0, issues: [
      { kind: "no_gtin_mpn", level: "warning", message: "No GTIN or MPN", rows: [2] },
      { kind: "bad_price", level: "error", message: "Price Google can't read", rows: [3] },
    ] };
    const items = [item("a", "Black Midi Dress", { file: { skus: ["S1"], issues: [] } }), item("b", null, { status: "read_failed", file: { skus: ["S2"], issues: [], imageError: "The image link didn't load." } })];
    const rows = reportRows(items, check, new Map([["a", [2]], ["b", [3]]]));
    expect(rows[0]).toMatchObject({ level: "Error" });
    expect(rows.find((r) => /Price/.test(r.problem))).toMatchObject({ product: "b.jpg", skus: "S2", where: "Product file" });
    expect(rows.find((r) => r.where === "Photo")).toMatchObject({ level: "Error", problem: "The image link didn't load." });
    expect(reportCsv(rows).split("\r\n")[0]).toBe("Product,SKUs,Level,Where,Problem");
  });
});

describe("Google's category list", () => {
  it("reads Google's file, adds new categories, updates renamed ones and never removes any", async () => {
    const text = ["# Google_Product_Taxonomy_Version: 2015-02-19", ...Array.from({ length: 1000 }, (_, k) => `${k + 1} - Category ${k + 1}`)].join("\n");
    expect(parseTaxonomy(text)).toHaveLength(1000);
    expect(await storeTaxonomy(parseTaxonomy(text))).toEqual({ total: 1000, added: 1000, renamed: 0 });
    const next = parseTaxonomy(text.replace("5 - Category 5", "5 - Category Five") + "\n1001 - Category 1001");
    expect(await storeTaxonomy(next)).toEqual({ total: 1001, added: 1, renamed: 1 });
    await expect(storeTaxonomy(parseTaxonomy("1 - Too short"))).rejects.toThrow(/full category list/);
  });
});
