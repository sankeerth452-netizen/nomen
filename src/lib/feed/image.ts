// Fetches a product photo from the image link in the brand's file, then makes the two copies a dropped photo would
// have: one for Claude to read (1568px) and one to keep for screens (900px). Only public web addresses are fetched:
// a link to this server's own network, a private address or cloud metadata is refused, including after a redirect.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import sharp from "sharp";
import type { Photo } from "../photo";

const MAX_BYTES = 15_000_000;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

export class ImageFetchError extends Error {}

/** Private, loopback, link-local (cloud metadata), carrier-grade NAT, multicast and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v)) return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

async function assertPublic(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) throw new ImageFetchError("The image link isn't a web address.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^localhost$|\.local$|\.internal$/i.test(host)) throw new ImageFetchError("The image link points somewhere private.");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => { throw new ImageFetchError("The image link's website couldn't be found."); });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new ImageFetchError("The image link points somewhere private.");
}

/** Download the image at a public link (following at most three redirects, each checked again). */
export async function downloadImage(link: string): Promise<Buffer> {
  let url: URL;
  try { url = new URL(link); } catch { throw new ImageFetchError("The image link isn't a web address."); }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "image/*" } })
      .catch(() => { throw new ImageFetchError("The image link didn't answer."); });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { url = new URL(res.headers.get("location")!, url); continue; }
    if (!res.ok) throw new ImageFetchError(`The image link didn't work (${res.status}).`);
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new ImageFetchError("The image is too large.");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new ImageFetchError("The image is too large.");
    return buf;
  }
  throw new ImageFetchError("The image link redirects too many times.");
}

/** The two copies Nomen keeps of a photo: one to read, one for screens. Anything that isn't an image is refused. */
export async function photoCopies(buf: Buffer): Promise<{ read: Photo; keep: Photo }> {
  try {
    const base = sharp(buf, { failOn: "error" }).rotate();
    const [read, keep] = await Promise.all([
      base.clone().resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(),
      base.clone().resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer(),
    ]);
    return { read: { mediaType: "image/jpeg", data: read }, keep: { mediaType: "image/jpeg", data: keep } };
  } catch {
    throw new ImageFetchError("The image link isn't a photo we can open.");
  }
}

export type ImageFetcher = (link: string) => Promise<{ read: Photo; keep: Photo }>;
export const fetchProductImage: ImageFetcher = async (link) => photoCopies(await downloadImage(link));
