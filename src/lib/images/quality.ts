// Checks on a piece's photos that need no AI: too small for Google, blurry, or the same photo twice. Claude adds the
// ones only eyes can make (a different product, several products in one photo) when it reads them.
import sharp from "sharp";

export type ImageStats = { width: number; height: number; sharpness: number; hash: string };

/** Google's minimum for clothing images is 250 x 250 pixels; 800 or more is what zoom on a product page needs. */
export const GOOGLE_MIN_PX = 250;
export const ZOOM_PX = 800;
/**
 * Below this a photo reads as blurry: the spread of edge strength on a 512px grey copy (variance of the Laplacian).
 * Calibrated on the app's 14 stock photos (21 Nov 2026): sharp ones scored 110 to 1,270; the same 1200px photos
 * blurred at radius 3 scored 7 to 57, at radius 6 2 to 10. Set low so a sharp, plain flat-lay is never called blurry.
 */
export const BLURRY_BELOW = 20;
/** Two photos whose fingerprints differ in this many bits or fewer are the same photo (re-saved or resized). */
export const SAME_PHOTO_BITS = 5;

/** Size, sharpness and a fingerprint for one photo. `size` overrides the size when the browser already shrank it. */
export async function imageStats(buf: Buffer, size?: { width: number; height: number }): Promise<ImageStats> {
  const img = sharp(buf, { failOn: "error" }).rotate();
  const meta = await img.metadata();
  const turned = (meta.orientation ?? 1) >= 5;
  const width = size?.width ?? (turned ? meta.height : meta.width) ?? 0;
  const height = size?.height ?? (turned ? meta.width : meta.height) ?? 0;
  const lap = await img.clone().greyscale().resize({ width: 512, height: 512, fit: "inside" })
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 }).raw().toBuffer();
  let sum = 0, sq = 0;
  for (const v of lap) { const d = v - 128; sum += d; sq += d * d; }
  const mean = sum / lap.length;
  const sharpness = sq / lap.length - mean * mean;
  // dHash: 9 x 8 grey pixels, one bit per neighbour pair: does brightness rise left to right?
  const px = await img.clone().greyscale().resize({ width: 9, height: 8, fit: "fill" }).raw().toBuffer();
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += px[y * 9 + x] < px[y * 9 + x + 1] ? "1" : "0";
  const hash = BigInt(`0b${bits}`).toString(16).padStart(16, "0");
  return { width, height, sharpness: Math.round(sharpness * 10) / 10, hash };
}

export function hammingDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`), n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

/** Plain-words problems for each photo of one piece, in order (photo 1 is the main one). */
export function photoProblems(stats: (ImageStats | null)[]): string[][] {
  return stats.map((s, i) => {
    if (!s) return [];
    const out: string[] = [];
    if (Math.min(s.width, s.height) < GOOGLE_MIN_PX) out.push(`Too small for Google (${s.width} × ${s.height}): it needs at least ${GOOGLE_MIN_PX} × ${GOOGLE_MIN_PX} pixels.`);
    else if (Math.max(s.width, s.height) < ZOOM_PX) out.push(`Small (${s.width} × ${s.height}): ${ZOOM_PX} pixels or more looks better when shoppers zoom in.`);
    if (s.sharpness < BLURRY_BELOW) out.push("It looks blurry.");
    const twin = stats.slice(0, i).findIndex((o) => o && hammingDistance(o.hash, s.hash) <= SAME_PHOTO_BITS);
    if (twin >= 0) out.push(`The same photo as photo ${twin + 1}.`);
    return out;
  });
}
