import { afterAll, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { db } from "@/lib/db";
import { openCsv } from "@/lib/keywords/readers";
import { checkFeed, detectFormat, groupProducts, importFeed, productNoun, stripHtml, suggestFeedMapping } from "@/lib/feed/import";
import { feedRows, supplementalFeed } from "@/lib/feed/export";
import { downloadImage, ImageFetchError, isPrivateAddress, photoCopies, type ImageFetcher } from "@/lib/feed/image";
import { priceBand, type FeedRow } from "@/lib/feed/shared";
import { drain } from "@/lib/batch/worker";
import { rangeItems } from "@/lib/batch/ranges";
import { MockContentWriter, MockFactExtractor, MockPhotoReader, MockRecommender, MockSerpProvider, MockSheetWriter } from "@/lib/providers/mock";
import type { Providers } from "@/lib/providers";
import type { ProductSheet } from "@/lib/pipeline/sheet";
import { resetDb, seedBrand } from "./helpers";

const csv = (lines: string[]) => openCsv(Buffer.from(lines.join("\n")));
const GMC = "id,title,description,link,image_link,availability,price,sale_price,brand,condition,gtin,item_group_id,color,size,gender,age_group";
const gmcRow = (id: string, colour: string, size: string, extra: Partial<Record<"price" | "sale" | "availability" | "gtin" | "group", string>> = {}) =>
  `${id},Ivy Satin Slip Dress,"<p>A satin slip dress with a cowl neckline.</p><p>Model wears AU 8. Hand wash cold.</p>",https://shop.example/ivy,https://cdn.example/ivy-${colour}.jpg,${extra.availability ?? "in stock"},${extra.price ?? "89.95 AUD"},${extra.sale ?? ""},Sportsgirl,new,${extra.gtin ?? "9300000000001"},${extra.group ?? "IVY"},${colour},${size},female,adult`;

describe("reading the brand's product file", () => {
  it("recognises Google Merchant Center and Shopify column names", () => {
    const g = suggestFeedMapping(GMC.split(","));
    expect(g).toMatchObject({ id: "id", title: "title", image_link: "image_link", item_group_id: "item_group_id", color: "color", size: "size" });
    expect(detectFormat(GMC.split(","))).toBe("Google Merchant Center feed");
    const shopify = ["Handle", "Title", "Body (HTML)", "Vendor", "Type", "Option1 Name", "Option1 Value", "Variant SKU", "Variant Price", "Variant Compare At Price", "Variant Barcode", "Image Src", "Google Shopping / Gender"];
    expect(suggestFeedMapping(shopify)).toMatchObject({ Handle: "item_group_id", Title: "title", "Body (HTML)": "description", Vendor: "brand", "Variant SKU": "id", "Variant Price": "price", "Variant Barcode": "gtin", "Image Src": "image_link", "Google Shopping / Gender": "gender", "Option1 Value": "metadata" });
    expect(detectFormat(shopify)).toBe("Shopify export");
  });

  it("names each product and colour once, with its sizes as rows, and fills the details from the file", async () => {
    const src = await csv([GMC, gmcRow("IVY-BLK-6", "Black", "6"), gmcRow("IVY-BLK-8", "Black", "8"), gmcRow("IVY-CCO-6", "Cocoa", "6"), gmcRow("IVY-CCO-8", "Cocoa", "8")]);
    const { pieces, check } = await importFeed(src, suggestFeedMapping(src.headers));
    expect(check).toMatchObject({ rows: 4, products: 2, format: "Google Merchant Center feed" });
    expect(pieces.map((p) => [p.filename, p.rows.map((r) => r.attrs.id)])).toEqual([["Ivy Satin Slip Dress · Black", ["IVY-BLK-6", "IVY-BLK-8"]], ["Ivy Satin Slip Dress · Cocoa", ["IVY-CCO-6", "IVY-CCO-8"]]]);
    expect(pieces[0].imageUrl).toBe("https://cdn.example/ivy-Black.jpg");
    expect(pieces[1].details.fields).toMatchObject({ productType: "dress", freeText: "Ivy Satin Slip Dress", colour: "Cocoa", extra: "A satin slip dress with a cowl neckline.\nModel wears AU 8. Hand wash cold." });
    expect(pieces[0].rows[0].attrs.availability).toBe("in_stock"); // "in stock" read the way Google wants it
  });

  it("checks the file the way Google will, and never fixes it", () => {
    const rows: FeedRow[] = [
      { row: 2, attrs: { id: "A", link: "https://s/a", image_link: "https://s/a.jpg", availability: "maybe", price: "59.95", brand: "B", condition: "new", item_group_id: "G", color: "Red", size: "8" } },
      { row: 3, attrs: { id: "A", link: "s/b", image_link: "https://s/b.jpg", availability: "in_stock", price: "59.95 AUD", sale_price: "70 AUD", brand: "B", condition: "new", item_group_id: "G", color: "Red", size: "8", gtin: "1" } },
      { row: 4, attrs: { id: "C", title: "Tee", size: "M" } },
      { row: 5, attrs: { id: "D", title: "Tee", size: "L" } },
      { row: 6, attrs: { id: "E", title: "Bag", color: "Pink" } }, // one product with a colour: no group needed
    ];
    const { issues, byRow } = checkFeed(rows);
    const kinds = Object.fromEntries(issues.map((i) => [i.kind, i.rows]));
    expect(kinds).toMatchObject({ bad_availability: [2], bad_price: [2], sale_not_lower: [3], bad_link: [3], duplicate_id: [3], group_duplicate: [3], variant_no_group: [4, 5], missing_link: [4, 5, 6], missing_price: [4, 5, 6], no_gtin_mpn: [2, 4, 5, 6] });
    expect(issues[0].level).toBe("error"); // errors first
    expect(byRow.get(3)).toContain("ID A is also on row 2");
    const colours = checkFeed([{ row: 2, attrs: { id: "X", color: "Light Wash" } }, { row: 3, attrs: { id: "Y", color: "Red/Black" } }]);
    expect(colours.byRow.get(2)).toContain('Colour "Light Wash": Google prefers "Blue"');
    expect(colours.byRow.get(3) ?? []).not.toContainEqual(expect.stringMatching(/Colour/));
  });

  it("reads a Shopify export: filled down by product, options as colour and size, compare-at as a sale, stock from inventory", async () => {
    const src = await csv([
      "Handle,Title,Body (HTML),Vendor,Type,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Variant SKU,Variant Price,Variant Compare At Price,Variant Inventory Qty,Variant Barcode,Image Src",
      "willow-top,Willow Linen Top,<p>Relaxed <b>linen</b> top.</p>,Sportsgirl,Tops,Colour,White,Size,6,WIL-WHT-6,49.95,69.95,4,111,https://cdn.example/willow.jpg",
      "willow-top,,,,,,White,,8,WIL-WHT-8,49.95,69.95,0,112,",
      "willow-top,,,,,,,,,,,,,,https://cdn.example/willow-back.jpg",
    ]);
    const { pieces, check } = await importFeed(src, suggestFeedMapping(src.headers));
    expect(check).toMatchObject({ format: "Shopify export", rows: 2, products: 1, skippedRows: 1 });
    const [a, b] = pieces[0].rows.map((r) => r.attrs);
    expect(a).toMatchObject({ id: "WIL-WHT-6", title: "Willow Linen Top", color: "White", size: "6", price: "69.95 AUD", sale_price: "49.95 AUD", availability: "in_stock", description: "Relaxed linen top." });
    expect(b).toMatchObject({ id: "WIL-WHT-8", title: "Willow Linen Top", size: "8", availability: "out_of_stock", image_link: "https://cdn.example/willow.jpg" });
    expect(check.issues.find((i) => i.kind === "currency_assumed")).toBeTruthy();
    expect(check.issues.find((i) => i.kind === "missing_link")?.rows).toEqual([2, 3]); // Shopify exports have no product link: flagged, never made up
  });

  it("finds the product noun and cleans descriptions", () => {
    expect(productNoun("Ivy Satin Slip Dress", undefined)).toBe("dress");
    expect(productNoun("Riley Baggy Jeans", undefined)).toBe("jeans");
    expect(productNoun("Riley Jean", undefined)).toBe("jeans");
    expect(productNoun("The Ivy", "Women > Tops > Blouses")).toBe("blouse");
    expect(stripHtml("<ul><li>Cotton</li><li>Model wears AU 8</li></ul>&amp; more")).toBe("• Cotton\n• Model wears AU 8\n& more");
    expect(groupProducts([{ row: 2, attrs: { title: "Tee", color: "Red" } }, { row: 3, attrs: { title: "tee", color: "red" } }]).length).toBe(1);
  });
});

describe("fetching photos from image links", () => {
  it("refuses private, local and cloud-metadata addresses before fetching", async () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.6", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "151.101.1.1", "2606:4700::6810:84e5"]) expect(isPrivateAddress(ip)).toBe(false);
    await expect(downloadImage("http://localhost:3000/x.jpg")).rejects.toThrow(/private/);
    await expect(downloadImage("http://169.254.169.254/latest/meta-data")).rejects.toThrow(/private/);
    await expect(downloadImage("file:///etc/passwd")).rejects.toThrow(/web address/);
  });

  it("makes the same two copies a dropped photo has, and refuses what isn't an image", async () => {
    const png = await sharp({ create: { width: 2400, height: 3000, channels: 3, background: "#c33" } }).png().toBuffer();
    const { read, keep } = await photoCopies(png);
    const [r, k] = await Promise.all([sharp(read.data).metadata(), sharp(keep.data).metadata()]);
    expect([r.format, r.height, k.height]).toEqual(["jpeg", 1568, 900]);
    await expect(photoCopies(Buffer.from("<html>not an image</html>"))).rejects.toBeInstanceOf(ImageFetchError);
  });
});

describe("a range from a product file", () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());
  const providers: Providers = { extractor: new MockFactExtractor(), recommender: new MockRecommender(), serp: new MockSerpProvider(), photo: new MockPhotoReader(), content: new MockContentWriter(), sheet: new MockSheetWriter(), modelName: "mock" };
  const tiny = async () => photoCopies(await sharp({ create: { width: 40, height: 40, channels: 3, background: "#222" } }).jpeg().toBuffer());

  it("reads each photo from its link, keeps the file's details over the photo's, then names it with its SKUs", async () => {
    const { brand, user } = await seedBrand();
    const b = await db.batch.create({ data: { brandId: brand.id, userId: user.id, title: "Feed", source: "file", fileName: "feed.csv" } });
    const rows = [{ row: 2, attrs: { id: "IVY-BLK-8", title: "Ivy Satin Slip Dress", color: "Cocoa", size: "8", price: "89.95 AUD" } }];
    await db.batchItem.create({ data: { batchId: b.id, position: 1, filename: "Ivy · Cocoa", imageUrl: "https://cdn.example/ivy.jpg", status: "queued", details: { fields: { productType: "dress", freeText: "Ivy Satin Slip Dress", colour: "cocoa" }, fromPhoto: [], unsure: [] }, feed: { rows, issues: [] } } });
    const fetched: string[] = [];
    const fetcher: ImageFetcher = async (link) => { fetched.push(link); return tiny(); };
    await drain(providers, fetcher);
    expect(fetched).toEqual(["https://cdn.example/ivy.jpg"]);
    let [item] = await rangeItems(b.id);
    expect(item.status).toBe("review");
    expect(item.hasPhoto).toBe(true);
    expect(item.details?.fields.colour).toBe("cocoa"); // the file said cocoa; the photo reader said black
    expect(item.details?.fromPhoto).not.toContain("colour");
    expect(item.file).toMatchObject({ skus: ["IVY-BLK-8"], sizes: ["8"], price: "89.95 AUD" });

    await db.batchItem.update({ where: { id: item.id }, data: { status: "to_name" } });
    await drain(providers, fetcher);
    [item] = await rangeItems(b.id);
    expect(item.status).toBe("named");
    const g = await db.generation.findUniqueOrThrow({ where: { id: item.generationId! }, include: { photo: true } });
    expect(g.photo).toBeTruthy();
    expect((g.usage as { notes: string[] }).notes.join(" ")).toMatch(/product file "feed.csv" \(SKUs IVY-BLK-8\)/);
  });

  it("still names a piece from the file when its image link doesn't work", async () => {
    const { brand, user } = await seedBrand();
    const b = await db.batch.create({ data: { brandId: brand.id, userId: user.id, title: "Feed", source: "file" } });
    await db.batchItem.create({ data: { batchId: b.id, position: 1, filename: "Tee", imageUrl: "http://10.0.0.5/tee.jpg", status: "queued", details: { fields: { productType: "tee", freeText: "white cotton tee" }, fromPhoto: [], unsure: [] }, feed: { rows: [], issues: [] } } });
    await drain(providers, async () => { throw new ImageFetchError("The image link points somewhere private."); });
    const [item] = await rangeItems(b.id);
    expect(item.status).toBe("review");
    expect(item.hasPhoto).toBe(false);
    expect(item.file?.imageError).toMatch(/private/);
  });
});

describe("the Google supplemental feed", () => {
  const sheet = {
    google: { category: { id: 2271, path: "Clothing & Accessories > Clothing > Dresses" }, productType: "Women > Dresses > Midi Dresses", colour: "Brown", pattern: null, material: "Satin", gender: "Female", ageGroup: "Adult", sizeType: "Regular", sizeSystem: "AU", customLabels: ["Cocktail", "Summer", "", "", ""] },
    highlights: ["Cowl neckline", "Satin finish"], details: [{ section: "Design", name: "Neckline", value: "Cowl" }], shortDescription: "A cocoa satin slip dress.",
    idealFor: { live: [], review: [], sentence: null }, season: null, care: null, imageAlt: null, searchQueries: [], checks: [],
  } as unknown as ProductSheet;
  const rows: FeedRow[] = [
    { row: 2, attrs: { id: "IVY-CCO-6", color: "Cocoa", price: "89.95 AUD", sale_price: "69.95 AUD", gender: "female", custom_label_3: "High margin" } },
    { row: 3, attrs: { id: "IVY-CCO-8", color: "Cocoa", price: "89.95 AUD" } },
  ];

  it("writes one row per SKU, keeps the brand's own values, and fills the rest from Nomen", () => {
    const [a, b] = feedRows([{ name: "Cocoa Satin Cowl Neck Midi Slip Dress", rows, sheet }]);
    expect(a).toMatchObject({ id: "IVY-CCO-6", title: "Cocoa Satin Cowl Neck Midi Slip Dress", description: "A cocoa satin slip dress.", google_product_category: "2271", color: "Cocoa", material: "Satin", gender: "female", age_group: "adult", size_system: "AU", custom_label_0: "Cocktail", custom_label_1: "Summer", custom_label_2: "$50 to $99", custom_label_3: "High margin", custom_label_4: "Sale" });
    expect(b).toMatchObject({ id: "IVY-CCO-8", custom_label_3: "", custom_label_4: "Full price" });
    expect(priceBand("249 AUD")).toBe("$200 and over");
  });

  it("is tab-separated, repeats highlight and detail columns, and never carries tabs or line breaks inside a value", () => {
    const tsv = supplementalFeed([{ name: "Cocoa\tSatin Dress", rows, sheet: { ...sheet, shortDescription: "Line one.\nLine two." } }]);
    const [header, first] = tsv.trim().split("\n");
    expect(header.split("\t").filter((h) => h === "product_highlight").length).toBe(2);
    expect(header.split("\t").filter((h) => h === "product_detail").length).toBe(1);
    expect(first.split("\t")).toHaveLength(header.split("\t").length);
    expect(first).toContain("Cocoa Satin Dress\tLine one. Line two.");
    expect(first).toContain("Design:Neckline:Cowl");
  });
});
