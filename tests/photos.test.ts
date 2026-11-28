import { afterAll, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { db } from "@/lib/db";
import { imageStats, photoProblems, hammingDistance } from "@/lib/images/quality";
import { cleanAlt, photoInfo, sanitizePhotoInfo } from "@/lib/images/info";
import { photoContradictions } from "@/lib/batch/shared";
import { moreImagesFor, importFeed, suggestFeedMapping } from "@/lib/feed/import";
import { openCsv } from "@/lib/keywords/readers";
import { photoCopies, ImageFetchError, type ImageFetcher } from "@/lib/feed/image";
import { drain } from "@/lib/batch/worker";
import { rangeItems } from "@/lib/batch/ranges";
import { createGeneration } from "@/lib/pipeline/run";
import { loadGenerationFor, presentGeneration } from "@/lib/pipeline/access";
import { MockContentWriter, MockFactExtractor, MockPhotoReader, MockRecommender, MockSerpProvider, MockSheetWriter } from "@/lib/providers/mock";
import type { Providers } from "@/lib/providers";
import { resetDb, seedBrand } from "./helpers";

// A photo with real edges: stripes in two colours, so it has detail to blur and a fingerprint.
const stripes = (w: number, h: number, a = "#111", b = "#eee") => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${Array.from({ length: 24 }, (_, i) => `<rect x="${(i * w) / 24}" y="0" width="${w / 48}" height="${h}" fill="${i % 2 ? a : b}"/><circle cx="${(i * w) / 24}" cy="${(i * h) / 30}" r="${w / 30}" fill="${a}"/>`).join("")}</svg>`)).flatten({ background: b }).jpeg({ quality: 90 }).toBuffer();

describe("checking photos without AI", () => {
  it("finds photos too small for Google, small for zoom, blurry, or the same photo twice", async () => {
    const sharpPhoto = await stripes(1200, 1500);
    const blurred = await sharp(sharpPhoto).blur(12).toBuffer();
    const resaved = await sharp(sharpPhoto).resize(600).jpeg({ quality: 60 }).toBuffer();
    const tiny = await stripes(200, 240);
    const other = await stripes(1200, 1500, "#a22", "#225");
    const stats = await Promise.all([sharpPhoto, blurred, resaved, tiny, other].map((b) => imageStats(b)));
    const [ok, blur, twin, small, diff] = photoProblems(stats);
    expect(ok).toEqual([]);
    expect(blur).toContain("It looks blurry.");
    expect(twin.join(" ")).toMatch(/Small \(600 × 750\).*The same photo as photo 1/);
    expect(small[0]).toMatch(/Too small for Google \(200 × 240\)/);
    expect(diff.some((p) => /same photo/.test(p))).toBe(false);
    expect(hammingDistance("ff00", "ff01")).toBe(1);
  });

  it("judges a file's photo by its original size, not the shrunk copy", async () => {
    const s = await imageStats(await stripes(900, 1100), { width: 2000, height: 2400 });
    expect(photoProblems([s])[0]).toEqual([]);
  });
});

describe("what each photo shows", () => {
  it("puts the reading, the checks and the photos that didn't load in position order", () => {
    const out = photoInfo([0, 2], [
      { view: "front", alt: "Image of a black midi dress", problem: "none" },
      { view: "back", alt: "Back view of the dress with a tie back", problem: "different_product" },
    ], [[], ["It looks blurry."]], new Map([[1, "The image link didn't work (404)."]]));
    expect(out).toEqual([
      { position: 0, view: "front", alt: "A black midi dress", problems: [] },
      { position: 1, view: null, alt: null, problems: ["The image link didn't work (404)."] },
      { position: 2, view: "back", alt: "Back view of the dress with a tie back", problems: ["It looks blurry.", "It looks like a different product from the other photos."] },
    ]);
  });

  it("keeps alt text short and plain, and checks what the browser sends back", () => {
    expect(cleanAlt("photo of " + "a very long description ".repeat(10))!.length).toBeLessThanOrEqual(125);
    expect(sanitizePhotoInfo([{ view: "back", alt: "Back view", problems: ["x"] }, { view: "nonsense", alt: 3 }], 2)).toEqual([
      { position: 0, view: "back", alt: "Back view", problems: ["x"] }, { position: 1, view: null, alt: null, problems: [] },
    ]);
    expect(sanitizePhotoInfo([{}, {}, {}], 1)).toHaveLength(1);
  });

  it("notices when the photo disagrees with the brand's file, by colour family", () => {
    expect(photoContradictions({ colour: "Navy" }, { colour: "black" })).toEqual(["The photo looks black, but the file says Navy."]);
    expect(photoContradictions({ colour: "Navy" }, { colour: "dark blue" })).toEqual([]);
    expect(photoContradictions({ length: "midi" }, { length: "mini" })).toEqual(["The photo looks mini, but the file says midi."]);
  });
});

describe("a product file's other photos", () => {
  it("takes additional image links, other rows' images and Shopify's extra image rows", async () => {
    const g = [{ row: 2, attrs: { id: "A-8", image_link: "https://cdn/a1.jpg", additional_image_link: "https://cdn/a2.jpg, https://cdn/a3.jpg", item_group_id: "a" } }, { row: 3, attrs: { id: "A-10", image_link: "https://cdn/a4.jpg", item_group_id: "a" } }];
    expect(moreImagesFor(g, "https://cdn/a1.jpg", new Map([["a", ["https://cdn/a5.jpg", "https://cdn/a2.jpg"]]]))).toEqual(["https://cdn/a2.jpg", "https://cdn/a3.jpg", "https://cdn/a4.jpg", "https://cdn/a5.jpg"]);

    const csv = [
      "Handle,Title,Body (HTML),Option1 Name,Option1 Value,Variant SKU,Variant Price,Image Src,Image Position",
      "ivy-dress,Ivy Satin Slip Dress,<p>Satin slip</p>,Size,8,IVY-8,89.95,https://cdn/ivy1.jpg,1",
      "ivy-dress,,,,10,IVY-10,89.95,,",
      "ivy-dress,,,,,,,https://cdn/ivy2.jpg,2",
      "ivy-dress,,,,,,,https://cdn/ivy3.jpg,3",
    ].join("\n");
    const source = await openCsv(Buffer.from(csv));
    const { pieces } = await importFeed(source, suggestFeedMapping(source.headers));
    expect(pieces).toHaveLength(1);
    expect(pieces[0].imageUrl).toBe("https://cdn/ivy1.jpg");
    expect(pieces[0].moreImageUrls).toEqual(["https://cdn/ivy2.jpg", "https://cdn/ivy3.jpg"]);
  });
});

describe("reading several photos of one piece", () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());
  const providers = (): Providers => ({ extractor: new MockFactExtractor(), recommender: new MockRecommender(), serp: new MockSerpProvider(), photo: new MockPhotoReader(), content: new MockContentWriter(), sheet: new MockSheetWriter(), modelName: "mock" });

  it("reads them together, notes the link that didn't work, and the named piece keeps every photo", async () => {
    const { brand, user } = await seedBrand();
    const b = await db.batch.create({ data: { brandId: brand.id, userId: user.id, title: "Feed", source: "file" } });
    const item = await db.batchItem.create({ data: { batchId: b.id, position: 1, filename: "Ava heels", imageUrl: "https://cdn/ava1.jpg", status: "queued", details: { fields: { productType: "heels", freeText: "Ava block heels", colour: "Navy" }, fromPhoto: [], unsure: [] }, feed: { rows: [], issues: [] } } });
    const back = await photoCopies(await stripes(1000, 1200));
    await db.productImage.createMany({ data: [
      { batchItemId: item.id, position: 1, url: "https://cdn/ava2.jpg" },
      { batchItemId: item.id, position: 2, url: "https://cdn/ava3.jpg" },
      { batchItemId: item.id, position: 3, photo: new Uint8Array(back.keep.data), photoType: "image/jpeg", readImage: new Uint8Array(back.read.data), readType: "image/jpeg" },
    ] });
    const p = providers();
    const fetcher: ImageFetcher = async (link) => { if (link.endsWith("ava3.jpg")) throw new ImageFetchError("The image link didn't work (404)."); return photoCopies(await stripes(1600, 2000)); };
    await drain(p, fetcher);
    let [it] = await rangeItems(b.id);
    expect(it.status).toBe("review");
    expect(it.morePhotos).toEqual([1, 2, 3]);
    expect(it.details?.photos?.map((x) => [x.position, x.view])).toEqual([[0, "front"], [1, "back"], [2, null], [3, "detail"]]);
    expect(it.details?.photos?.[2].problems).toEqual(["The image link didn't work (404)."]);
    expect(it.details?.photos?.[1].problems.join(" ")).toMatch(/same photo as photo 1/); // the stand-in fetcher returned the same picture
    expect(it.details?.fields.extra).toBe("Heel type: block."); // clearly visible; the toe was only partly visible
    expect(it.details?.unsure).toContain("toe");
    expect(it.details?.contradictions).toEqual(["The photo looks black, but the file says Navy."]);
    expect((await db.productImage.findFirstOrThrow({ where: { batchItemId: item.id, position: 3 } })).readImage).toBeNull();
    expect((await db.productImage.findFirstOrThrow({ where: { batchItemId: item.id, position: 1 } })).photo).toBeTruthy();

    // The buyer adds the material (photos can't show it), then names the piece.
    await db.batchItem.update({ where: { id: item.id }, data: { status: "to_name", details: { ...it.details!, fields: { ...it.details!.fields, material: "cotton" } } as never } });
    await drain(p, fetcher);
    [it] = await rangeItems(b.id);
    expect(it.status).toBe("named");
    const g = await db.generation.findUniqueOrThrow({ where: { id: it.generationId! }, include: { images: true } });
    expect(g.images.map((x) => x.position).sort()).toEqual([1, 2, 3]);
    expect((g.photos as { position: number }[]).length).toBe(4);
  });

  it("a buyer's own photos go with a single piece too", async () => {
    const { brand, user } = await seedBrand();
    const photo = { mediaType: "image/jpeg" as const, data: (await photoCopies(await stripes(900, 1100))).keep.data };
    const id = await createGeneration({ id: user.id, brandId: brand.id }, brand.id, { freeText: "black heels", productType: "heels" }, { photo, morePhotos: [photo, photo], photos: [{ position: 0, view: "front", alt: "Black block heels", problems: [] }] });
    const su = { id: user.id, username: "buyer", displayName: "B", role: user.role, brandId: brand.id, brandName: null };
    const shown = presentGeneration(await loadGenerationFor(su, id), su);
    expect(shown.morePhotos).toEqual([1, 2]);
    expect(shown.photos[0]).toMatchObject({ view: "front", alt: "Black block heels" });
  });
});
