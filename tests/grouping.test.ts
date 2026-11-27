import { afterAll, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { db } from "@/lib/db";
import { anyGrouped, groupByFileName, photoKey } from "@/lib/images/grouping";
import { addPhotoPiece, rangeItems } from "@/lib/batch/ranges";
import { drain } from "@/lib/batch/worker";
import { photoCopies } from "@/lib/feed/image";
import { MockContentWriter, MockFactExtractor, MockPhotoReader, MockRecommender, MockSerpProvider, MockSheetWriter } from "@/lib/providers/mock";
import type { Providers } from "@/lib/providers";
import { resetDb, seedBrand } from "./helpers";

// Each group as file names: [main, ...more].
const named = (names: string[]) => groupByFileName(names).map((g) => [names[g.main], ...g.more.map((i) => names[i])]);

describe("grouping dropped photos by file name", () => {
  it("puts numbered and labelled photos of one piece together, main photo first", () => {
    expect(named(["dress-2.jpg", "top.png", "dress-1.jpg", "dress-back.jpg", "dress_3.JPG"])).toEqual([
      ["dress-1.jpg", "dress-2.jpg", "dress_3.JPG", "dress-back.jpg"],
      ["top.png"],
    ]);
    expect(named(["Ava Heels (2).jpg", "Ava Heels.jpg"])).toEqual([["Ava Heels.jpg", "Ava Heels (2).jpg"]]);
    expect(named(["SG1234_02.jpg", "SG1234_01.jpg", "SG1235_01.jpg"])).toEqual([["SG1234_01.jpg", "SG1234_02.jpg"], ["SG1235_01.jpg"]]);
    expect(named(["linen-shirt-side.jpg", "linen-shirt-front.jpg", "linen-shirt-close-up.jpg"])).toEqual([["linen-shirt-front.jpg", "linen-shirt-side.jpg", "linen-shirt-close-up.jpg"]]);
    expect(photoKey("dress-back-2.webp")).toEqual({ base: "dress", num: 2, view: "back", plain: false });
  });

  it("keeps different pieces apart", () => {
    // Camera and phone names, a bikini top and bottoms, short codes, dates and plain numbers are each their own piece.
    for (const names of [
      ["IMG_4512.jpg", "IMG_4513.jpg"],
      ["photo-1.jpg", "photo-2.jpg"],
      ["Screenshot 2026-11-20 at 10.15.32.png", "Screenshot 2026-11-20 at 10.15.32 (2).png"],
      ["bikini-top.jpg", "bikini-bottoms.jpg"],
      ["SG-12.jpg", "SG-13.jpg"],
      ["look 2026-11-20.jpg", "look 2026-11-21.jpg"],
      ["1.jpg", "2.jpg", "3.jpg"],
      ["back.jpg", "front.jpg"],
    ]) {
      const groups = groupByFileName(names);
      expect(groups, names.join(" ")).toHaveLength(names.length);
      expect(anyGrouped(groups)).toBe(false);
    }
  });

  it("keeps a piece to six photos and says which are left out", () => {
    const names = Array.from({ length: 8 }, (_, i) => `coat-${i + 1}.jpg`);
    const [g] = groupByFileName(names);
    expect([g.main, ...g.more].map((i) => names[i])).toEqual(names.slice(0, 6));
    expect(g.leftOut.map((i) => names[i])).toEqual(["coat-7.jpg", "coat-8.jpg"]);
    expect(anyGrouped(groupByFileName(["a.jpg", "b.jpg"]))).toBe(false);
  });
});

describe("adding a grouped piece to a range", () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it("saves every photo with the piece, so it is read once with all of them", async () => {
    const { brand, user } = await seedBrand();
    const b = await db.batch.create({ data: { brandId: brand.id, userId: user.id, title: "Drop" } });
    const pic = (fill: string) => sharp({ create: { width: 1000, height: 1200, channels: 3, background: fill } }).jpeg().toBuffer().then(photoCopies);
    const [front, back, side] = await Promise.all([pic("#222"), pic("#555"), pic("#888")]);
    const item = await addPhotoPiece(b.id, { filename: "dress-1.jpg", position: null, photo: front.keep, image: front.read, more: [{ photo: back.keep, image: back.read }, { photo: side.keep, image: side.read }] });
    expect(item.position).toBe(1);
    expect(item.images.map((x) => x.position)).toEqual([1, 2]);

    const reader = new MockPhotoReader();
    let extras = -1;
    const read = reader.read.bind(reader);
    reader.read = (input) => { extras = input.extras?.length ?? 0; return read(input); };
    const p: Providers = { extractor: new MockFactExtractor(), recommender: new MockRecommender(), serp: new MockSerpProvider(), photo: reader, content: new MockContentWriter(), sheet: new MockSheetWriter(), modelName: "mock" };
    await drain(p);
    const [it] = await rangeItems(b.id);
    expect(it.status).toBe("review");
    expect(it.morePhotos).toEqual([1, 2]);
    expect(it.details?.photos).toHaveLength(3);
    expect(reader.calls).toBe(1);
    expect(extras).toBe(2);

    // A piece added on its own still goes to the end of the range.
    const alone = await addPhotoPiece(b.id, { filename: "top.jpg", position: null, photo: side.keep, image: side.read });
    expect(alone.position).toBe(2);
    expect(alone.images).toEqual([]);
  });
});
