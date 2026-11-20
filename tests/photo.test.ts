import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { MAX_THUMB_BYTES, focusFractions, imageSize, parsePhoto } from "@/lib/photo";
import { frameAround } from "@/lib/frame";
import { ClaudeClient, ClaudePhotoReader } from "@/lib/providers/anthropic";
import { MockPhotoReader } from "@/lib/providers/mock";
import { PHOTO_SYSTEM } from "@/lib/prompts";
import { createGeneration } from "@/lib/pipeline/run";
import { loadGenerationFor, presentGeneration } from "@/lib/pipeline/access";
import { resetDb, seedBrand } from "./helpers";

// Smallest byte runs that carry each format's signature; enough for the checks, not real pictures.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(60)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(60)]);
const url = (type: string, b: Buffer) => `data:${type};base64,${b.toString("base64")}`;

describe("checking a photo before anything reads it", () => {
  it("accepts JPEG, PNG and WebP whose bytes match their type", () => {
    expect(parsePhoto(url("image/jpeg", JPEG), MAX_THUMB_BYTES)).toMatchObject({ mediaType: "image/jpeg" });
    expect(parsePhoto(url("image/png", PNG), MAX_THUMB_BYTES)).toMatchObject({ mediaType: "image/png" });
    expect(parsePhoto(url("image/webp", WEBP), MAX_THUMB_BYTES)).toMatchObject({ mediaType: "image/webp" });
  });

  it("refuses anything else: other types, mislabelled bytes, text, nothing", () => {
    expect(parsePhoto(url("image/jpeg", PNG), MAX_THUMB_BYTES)).toBe("not_a_photo"); // says JPEG, is PNG
    expect(parsePhoto(url("image/gif", JPEG), MAX_THUMB_BYTES)).toBe("not_a_photo");
    expect(parsePhoto(url("image/svg+xml", Buffer.from("<svg onload=alert(1)>")), MAX_THUMB_BYTES)).toBe("not_a_photo");
    expect(parsePhoto("https://example.com/a.jpg", MAX_THUMB_BYTES)).toBe("not_a_photo");
    expect(parsePhoto(url("image/jpeg", Buffer.from("hello")), MAX_THUMB_BYTES)).toBe("not_a_photo");
    expect(parsePhoto(undefined, MAX_THUMB_BYTES)).toBe("not_a_photo");
  });

  it("refuses an oversize photo before decoding it", () => {
    expect(parsePhoto(url("image/jpeg", Buffer.concat([JPEG, Buffer.alloc(300_000)])), MAX_THUMB_BYTES)).toBe("too_large");
  });
});

describe("framing the photo on the piece", () => {
  // JPEG start, an APP0 segment to skip, then the frame header: 600 high, 800 wide.
  const sized = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  it("reads the photo's size from its header", () => {
    expect(imageSize({ mediaType: "image/jpeg", data: sized })).toEqual({ width: 800, height: 600 });
    const png = Buffer.concat([PNG.subarray(0, 8), Buffer.from([0, 0, 0, 13]), Buffer.from("IHDR"), Buffer.from([0, 0, 4, 0, 0, 0, 3, 0])]);
    expect(imageSize({ mediaType: "image/png", data: png })).toEqual({ width: 1024, height: 768 });
    expect(imageSize({ mediaType: "image/jpeg", data: JPEG })).toBeNull(); // no frame header: unknown, not a guess
  });

  it("turns Claude's pixel box into fractions, clamped, and drops nonsense", () => {
    expect(focusFractions({ left: 200, top: 0, right: 600, bottom: 660 }, { width: 800, height: 600 })).toEqual({ left: 0.25, top: 0, right: 0.75, bottom: 1 });
    expect(focusFractions({ left: 500, top: 10, right: 400, bottom: 20 }, { width: 800, height: 600 })).toBeNull();
    expect(focusFractions(null, { width: 800, height: 600 })).toBeNull();
    expect(focusFractions({ left: 0, top: 0, right: 10, bottom: 10 }, null)).toBeNull();
  });

  it("crops a 4:5 portrait around the piece, with room, inside the photo", () => {
    // A dress in the middle of a wide photo: a portrait crop centred on it that holds all of it.
    const f = frameAround({ left: 0.4, top: 0.1, right: 0.6, bottom: 0.95 }, 1200, 800);
    expect(f.y).toBeLessThanOrEqual(0.1 * 800);
    expect(f.y + f.h).toBeGreaterThanOrEqual(0.95 * 800);
    expect(f.w / f.h).toBeCloseTo(0.8);
    expect(f.x + f.w / 2).toBeCloseTo(600);
    // A skirt in the lower half of a tall photo: the crop moves down to it, and stays inside the photo.
    const g = frameAround({ left: 0.1, top: 0.55, right: 0.65, bottom: 1 }, 1200, 1800);
    expect(g.y + g.h).toBeLessThanOrEqual(1800);
    expect(g.y).toBeGreaterThan(600);
    expect(g.x).toBeGreaterThanOrEqual(0);
  });
});

describe("reading a photo", () => {
  it("sends the photo first, then the request, with the buyer's product type and low effort", async () => {
    let sent: Record<string, unknown> = {};
    const details = { not_a_product: false, product_type: "dress", colour: "red", pattern: null, material: null, fit: null, length: "midi", feature: "one-shoulder, ruffle", occasion: null, audience: null, description: "red one-shoulder ruffle midi dress", unsure: ["fabric"], focus: { left: 300, top: 40, right: 560, bottom: 760 }, attributes: [], images: [{ view: "front", alt: "Red dress", problem: "none" }] };
    const client = new ClaudeClient("k", "claude-opus-5-5", { beta: { messages: { parse: async (p: Record<string, unknown>) => { sent = p; return { stop_reason: "end_turn", parsed_output: details, usage: { input_tokens: 1800, output_tokens: 90 }, model: "claude-opus-5-5" }; } } } } as never);
    const r = await new ClaudePhotoReader(client).read({ image: { mediaType: "image/jpeg", data: JPEG }, productType: "dress" });
    expect(r.details.colour).toBe("red");
    expect(r.usage).toMatchObject({ inputTokens: 1800, model: "claude-opus-5-5" });
    expect(sent.system).toEqual([{ type: "text", text: PHOTO_SYSTEM, cache_control: { type: "ephemeral" } }]); // cached: the same on every call
    const content = (sent.messages as { content: { type: string; source?: { media_type: string; data: string }; text?: string }[] }[])[0].content;
    expect(content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: JPEG.toString("base64") } });
    expect(JSON.parse(content[1].text!)).toMatchObject({ buyer_product_type: "dress" });
    expect((sent.output_config as { effort: string }).effort).toBe("low");
  });

  it("the example reader (preview version) follows the buyer's product type", async () => {
    const r = await new MockPhotoReader().read({ productType: "Skirt" });
    expect(r.details).toMatchObject({ product_type: "skirt", length: "midi", not_a_product: false });
  });
});

describe("the buyer's photo kept with the name", () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it("stores the photo apart from the input, notes what it filled in, and says so to the screens", async () => {
    const { brand, user } = await seedBrand({}, false);
    const id = await createGeneration(user, brand.id, { freeText: "red one-shoulder ruffle dress", productType: "dress", photo: "ignored", fromPhoto: ["x"] }, { photo: { mediaType: "image/jpeg", data: JPEG }, fromPhoto: ["colour", "productType"] });
    const g = await db.generation.findUniqueOrThrow({ where: { id }, include: { photo: true } });
    expect(Buffer.from(g.photo!.data).equals(JPEG)).toBe(true);
    expect(g.originalInput).not.toHaveProperty("photo"); // the input stays plain text
    expect((g.usage as { notes: string[] }).notes.join()).toMatch(/photo.*colour, productType/);
    const su = { id: user.id, username: user.username, displayName: user.displayName, role: user.role as "buyer", brandId: user.brandId, brandName: null };
    expect(presentGeneration(await loadGenerationFor(su, id), su)).toMatchObject({ hasPhoto: true });

    const plain = await createGeneration(user, brand.id, { freeText: "black midi dress", productType: "dress" });
    expect(presentGeneration(await loadGenerationFor(su, plain), su)).toMatchObject({ hasPhoto: false });
  });

  it("another buyer can't reach it, and it goes when the generation goes", async () => {
    const { brand, user } = await seedBrand({}, false);
    const other = await db.user.create({ data: { username: "other", displayName: "O", passwordHash: "x", role: "buyer", brandId: brand.id } });
    const id = await createGeneration(user, brand.id, { freeText: "pink saddle bag with tassel", productType: "bag" }, { photo: { mediaType: "image/png", data: PNG } });
    const su = (u: typeof user) => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role as "buyer", brandId: u.brandId, brandName: null });
    await expect(loadGenerationFor(su(other), id)).rejects.toMatchObject({ status: 404 });
    await db.generation.delete({ where: { id } });
    expect(await db.generationPhoto.count()).toBe(0);
  });
});
