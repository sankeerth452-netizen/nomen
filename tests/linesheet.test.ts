// A buyer's line sheet (Nitin, 28 Nov 2026): one row per piece, photos pasted in or linked, details by column.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { db } from "@/lib/db";
import { columnFor, lineSheetTemplate, readLineSheet } from "@/lib/batch/sheet";
import { addSheetPieces, rangeItems } from "@/lib/batch/ranges";
import { canName, missingToName } from "@/lib/batch/shared";
import { drain } from "@/lib/batch/worker";
import { photoCopies } from "@/lib/feed/image";
import { MockContentWriter, MockFactExtractor, MockPhotoReader, MockRecommender, MockSerpProvider, MockSheetWriter } from "@/lib/providers/mock";
import type { Providers } from "@/lib/providers";
import { resetDb, seedBrand } from "./helpers";

const picture = (fill: string) => sharp({ create: { width: 600, height: 800, channels: 3, background: fill } }).png().toBuffer();
const providers = (): Providers => ({ extractor: new MockFactExtractor(), recommender: new MockRecommender(), serp: new MockSerpProvider(), photo: new MockPhotoReader(), content: new MockContentWriter(), sheet: new MockSheetWriter(), modelName: "mock" });

/** A line sheet as a buyer might make it: a title row, the column names, the template's example row, then pieces. */
async function lineSheet() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Spring");
  ws.addRow(["Spring drop · line sheet"]);
  ws.addRow(["Style #", "Photo", "Category", "Description", "Fabric composition", "Occasion (optional)", "Colour", "RRP"]);
  ws.addRow(["e.g. SG0000", "", "dress", "an example", "cotton", "", "", "$1"]);
  ws.addRow(["SG1001", "", "dress", "navy linen midi dress with tie waist", "100% linen", "office", "navy", "$89.95"]);
  ws.addRow(["SG1002", "https://cdn.example/top.jpg", "top", "white cotton square neck top", "cotton", "", "white", "$49.95"]);
  ws.addRow(["SG1003", "", "skirt", "pleated midi skirt", "", "", "", "$69.95"]);
  // Pictures pasted over the Photo cell: two on SG1001's row (row 4), one on SG1003's (row 6).
  const a = wb.addImage({ buffer: await picture("#203060") as never, extension: "png" });
  const b = wb.addImage({ buffer: await picture("#404040") as never, extension: "png" });
  const c = wb.addImage({ buffer: await picture("#606060") as never, extension: "png" });
  ws.addImage(a, { tl: { col: 1, row: 3 }, ext: { width: 60, height: 80 } });
  ws.addImage(b, "C4:C4");
  ws.addImage(c, { tl: { col: 1, row: 5 }, ext: { width: 60, height: 80 } });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

beforeEach(resetDb);
afterAll(() => db.$disconnect());

describe("reading a buyer's line sheet", () => {
  it("knows the columns by their names, whatever they're called", () => {
    expect(["Style #", "SKU", "Product code"].map(columnFor)).toEqual(["label", "label", "label"]);
    expect(["Category", "Product type", "Garment"].map(columnFor)).toEqual(["productType", "productType", "productType"]);
    expect(["Fabric composition", "Material", "Main fabric"].map(columnFor)).toEqual(["material", "material", "material"]);
    expect(["Occasion (optional)", "Use case"].map(columnFor)).toEqual(["occasion", "occasion"]);
    expect(["Photo", "Image URL", "Photo link", "image_link"].map(columnFor)).toEqual(["image", "image", "image", "image"]);
    expect(["Colour", "Color", "Notes", "Style name"].map(columnFor)).toEqual(["colour", "colour", "extra", "name"]);
    expect(columnFor("RRP")).toBeNull();
  });

  it("finds the column names under a title, skips the example row, and puts each pasted picture on its row", async () => {
    const s = await readLineSheet(await lineSheet(), "spring.xlsx");
    expect(s.examples).toBe(1);
    expect(s.ignored).toEqual(["RRP"]);
    expect(s.pieces.map((p) => p.label)).toEqual(["SG1001", "SG1002", "SG1003"]);
    expect(s.pieces[0].fields).toEqual({ productType: "dress", freeText: "navy linen midi dress with tie waist", material: "100% linen", occasion: "office", colour: "navy" });
    expect(s.pieces[0].images).toHaveLength(2);
    expect(s.pieces[1].images).toHaveLength(0);
    expect(s.pieces[1].links).toEqual(["https://cdn.example/top.jpg"]);
    expect(s.pieces[2].images).toHaveLength(1);
    expect(s.pieces[2].fields.material).toBeUndefined();
  });

  it("reads a CSV with photo links too, and uses a style name when there's no description", async () => {
    const csv = "SKU,Style name,Type,Material,Image\nA1,Ava ruched midi dress,dress,recycled polyester,https://cdn.example/a1.jpg https://cdn.example/a1-back.jpg\n";
    const s = await readLineSheet(Buffer.from(csv), "line.csv");
    expect(s.pieces).toEqual([{ row: 2, label: "A1", fields: { productType: "dress", freeText: "Ava ruched midi dress", material: "recycled polyester" }, links: ["https://cdn.example/a1.jpg", "https://cdn.example/a1-back.jpg"], images: [] }]);
  });

  it("the template reads back as columns Nomen knows, with only its example row", async () => {
    const s = await readLineSheet(await lineSheetTemplate(), "template.xlsx");
    expect(s.pieces).toEqual([]);
    expect(s.examples).toBe(1);
    expect(s.ignored).toEqual([]);
    expect(s.used.map((u) => u.as)).toEqual(["label", "image", "image", "productType", "freeText", "material", "occasion", "colour", "pattern", "fit", "length", "feature", "audience", "extra"]);
  });

  it("refuses a sheet with no column names it knows", async () => {
    await expect(readLineSheet(Buffer.from("Foo,Bar\n1,2\n"), "x.csv")).rejects.toThrow(/couldn't find the column names/);
    await expect(readLineSheet(Buffer.from("x"), "x.pdf")).rejects.toThrow(/Excel \(\.xlsx\) or CSV/);
  });
});

describe("a line sheet's pieces in a range", () => {
  it("adds every row, reads the pasted photos for what the row left blank, and the row's own details win", async () => {
    const { brand, user } = await seedBrand();
    const b = await db.batch.create({ data: { brandId: brand.id, userId: user.id, title: "Spring" } });
    const added = await addSheetPieces(b.id, await readLineSheet(await lineSheet(), "spring.xlsx"));
    expect(added).toMatchObject({ added: 3, pasted: 2, linked: 1, noPhoto: 0, badPictures: [] });

    const fetched: string[] = [];
    await drain(providers(), async (link) => { fetched.push(link); return photoCopies(await picture("#ffffff")); });
    const items = await rangeItems(b.id);
    expect(items.map((i) => [i.filename, i.status])).toEqual([["SG1001", "review"], ["SG1002", "review"], ["SG1003", "review"]]);
    expect(fetched).toEqual(["https://cdn.example/top.jpg"]);
    const [dress, , skirt] = items;
    expect(dress.morePhotos).toEqual([1]);
    expect(dress.details?.fields).toMatchObject({ productType: "dress", material: "100% linen", colour: "navy", occasion: "office", length: "midi" }); // length filled from the photo
    expect(dress.details?.fromPhoto).toContain("length");
    expect(dress.details?.fromPhoto).not.toContain("colour");
    expect(dress.details?.contradictions).toEqual(["The photo looks black, but the file says navy."]); // the stand-in reader always says black
    expect(dress.details?.sheetRow).toBe(4);
    // The skirt has no material: it waits for the buyer, whatever the photo showed.
    expect(missingToName(skirt.details)).toEqual(["material"]);
    expect(canName(dress.details)).toBe(true);
  });

  it("a row without a photo is ready to check straight away", async () => {
    const { brand, user } = await seedBrand();
    const b = await db.batch.create({ data: { brandId: brand.id, userId: user.id, title: "No photos" } });
    const sheet = await readLineSheet(Buffer.from("Category,Description,Material\ntop,white cotton tee,cotton\n"), "x.csv");
    expect(await addSheetPieces(b.id, sheet)).toMatchObject({ added: 1, noPhoto: 1 });
    const [it] = await rangeItems(b.id);
    expect(it).toMatchObject({ filename: "Row 2", status: "review", hasPhoto: false });
    expect(canName(it.details)).toBe(true);
  });
});

describe("the basics a range needs before naming", () => {
  it("are a product type, a description and the material; occasion is optional", () => {
    const d = (fields: Record<string, string>) => ({ fields, fromPhoto: [], unsure: [] });
    expect(missingToName(d({}))).toEqual(["product type", "description", "material"]);
    expect(missingToName(d({ productType: "dress", freeText: "black midi dress" }))).toEqual(["material"]);
    expect(canName(d({ productType: "dress", freeText: "black midi dress", material: "linen" }))).toBe(true);
    expect(canName(null)).toBe(false);
  });
});
