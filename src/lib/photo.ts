/** Product photos arrive from the browser as data URLs, already shrunk there. Check them before anything else sees them. */

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

/** What Claude reads (the browser shrinks to 1568px on the long edge, plenty for colour and details). */
export const MAX_READ_BYTES = 3_000_000;
/** What we keep with the generation for the result and History screens. */
export const MAX_THUMB_BYTES = 200_000;

// The first bytes of each format: a file named .jpg that isn't one is refused.
const SIGNATURE: Record<PhotoType, (b: Buffer) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
};

export type Photo = { mediaType: PhotoType; data: Buffer };
export type PhotoProblem = "not_a_photo" | "too_large";

/** A data URL -> checked bytes, or why not. */
export function parsePhoto(value: unknown, maxBytes: number): Photo | PhotoProblem {
  if (typeof value !== "string") return "not_a_photo";
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!m) return "not_a_photo";
  // Base64 is 4 characters per 3 bytes: refuse oversize before decoding it.
  if (Math.floor((m[2].length * 3) / 4) > maxBytes + 2) return "too_large";
  const mediaType = m[1] as PhotoType;
  const data = Buffer.from(m[2], "base64");
  if (data.length > maxBytes) return "too_large";
  if (data.length < 12 || !SIGNATURE[mediaType](data)) return "not_a_photo";
  return { mediaType, data };
}

/** Width and height from the file header (JPEG and PNG; the browser always sends JPEG). null when unknown. */
export function imageSize(p: Photo): { width: number; height: number } | null {
  const b = p.data;
  if (p.mediaType === "image/png" && b.length >= 24) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (p.mediaType !== "image/jpeg") return null;
  // Walk the JPEG segments to the frame header (SOF0-SOF15, except the DHT/JPG/DAC markers that share the range).
  for (let i = 2; i + 9 < b.length; ) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

export type Box = { left: number; top: number; right: number; bottom: number };

/** Claude's pixel box around the piece -> fractions of the photo (0-1), or null if it doesn't make sense. */
export function focusFractions(box: Box | null | undefined, size: { width: number; height: number } | null): Box | null {
  if (!box || !size || size.width <= 0 || size.height <= 0) return null;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const f = { left: clamp(box.left / size.width), top: clamp(box.top / size.height), right: clamp(box.right / size.width), bottom: clamp(box.bottom / size.height) };
  return f.right - f.left > 0.02 && f.bottom - f.top > 0.02 ? f : null;
}
