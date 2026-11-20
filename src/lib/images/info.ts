// What each of a piece's photos shows, its alt text, and the problems found with it, in one shape for screens and
// exports. No image or database code here: the range screen and result pages use it too.
import type { PhotoDetails, PhotoView } from "../pipeline/types";

export type PhotoInfo = { position: number; view: PhotoView | null; alt: string | null; problems: string[] };

/** The most photos read for one piece (the main one plus five more). Google allows ten more; the rest are kept, unread. */
export const MAX_PHOTOS = 6;
export const ALT_MAX = 125;

const PROBLEM: Record<string, string> = {
  different_product: "It looks like a different product from the other photos.",
  several_products: "Several products are in it, so it isn't clear which one is for sale.",
  unclear: "The piece can't be made out clearly.",
};

export const VIEW_LABEL: Record<PhotoView, string> = { front: "Front", back: "Back", side: "Side", detail: "Detail", fabric: "Fabric close-up", lifestyle: "Worn or styled", other: "Other" };

/** Alt text as a page should carry it: trimmed, no "Image of", one sentence, within the limit. */
export function cleanAlt(alt: string | null | undefined): string | null {
  const a = (alt ?? "").replace(/\s+/g, " ").trim().replace(/^(an? )?(image|photo|picture) of\s+/i, "");
  if (!a) return null;
  const t = a.charAt(0).toUpperCase() + a.slice(1);
  return t.length <= ALT_MAX ? t : `${t.slice(0, ALT_MAX - 1).replace(/\s+\S*$/, "")}…`;
}

/**
 * One entry per photo, by position (0 is the main photo). `read` is the photo reader's answer for the photos it saw,
 * in `positions` order; `checks` the code's problems in the same order; `failed` photos that couldn't be loaded.
 */
export function photoInfo(positions: number[], read: PhotoDetails["images"] | undefined, checks: string[][], failed: Map<number, string> = new Map()): PhotoInfo[] {
  const out: PhotoInfo[] = positions.map((position, i) => {
    const r = read?.[i];
    return { position, view: r?.view ?? null, alt: cleanAlt(r?.alt), problems: [...(checks[i] ?? []), ...(r && r.problem !== "none" ? [PROBLEM[r.problem]] : [])] };
  });
  for (const [position, message] of failed) out.push({ position, view: null, alt: null, problems: [message] });
  return out.sort((a, b) => a.position - b.position);
}

export const asPhotoInfo = (j: unknown): PhotoInfo[] => (Array.isArray(j) ? (j as PhotoInfo[]) : []);
export const photoProblemCount = (photos: PhotoInfo[]) => photos.reduce((n, p) => n + p.problems.length, 0);

/** Photo info sent back by the browser (from its last reading), checked and trimmed before it's kept. */
export function sanitizePhotoInfo(raw: unknown, count: number): PhotoInfo[] {
  if (!Array.isArray(raw)) return [];
  const views = new Set<string>(Object.keys(VIEW_LABEL));
  return raw.slice(0, count).map((x, i): PhotoInfo => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    return {
      position: i,
      view: typeof o.view === "string" && views.has(o.view) ? (o.view as PhotoView) : null,
      alt: cleanAlt(typeof o.alt === "string" ? o.alt : null),
      problems: Array.isArray(o.problems) ? o.problems.filter((p): p is string => typeof p === "string").map((p) => p.slice(0, 200)).slice(0, 5) : [],
    };
  });
}
