// Photos dropped on a range together can be grouped into pieces by their file names: dress-1.jpg, dress-2.jpg and
// dress-back.jpg are three photos of one dress. Only a name that clearly numbers or labels a photo counts, so a
// camera's IMG_4512.jpg and IMG_4513.jpg stay two pieces, and bikini-top.jpg and bikini-bottoms.jpg stay two pieces.
// The range screen shows the grouping and lets the buyer keep every photo as its own piece instead.
import { MAX_PHOTOS } from "./info";

// Words that label a photo of a piece. "top" and "bottom" are left out on purpose: they name different pieces.
const VIEW = "front|back|rear|side|left|right|details?|close[\\s_-]?up|zoom|fabric|texture|worn|on[\\s_-]?model|model|styled|flat[\\s_-]?lay|flat|lifestyle|alt|main|hero|inside";
// A separator then a short photo number ("-1", "_02", " (2)") or a view word, at the end of the name.
const TOKEN = new RegExp(`[\\s_-]+(?:\\(?(\\d{1,2})\\)?|(${VIEW}))$`, "i");
// A name ending in a date ("look 2026-11-20") is not numbered photos.
const DATE_END = /(?:19|20)\d{2}[\s._-]\d{1,2}[\s._-]\d{1,2}$/;
// Names cameras, phones and downloads give: "photo-1" and "photo-2" are not one piece.
const GENERIC = /^(?:img|image|images|photo|photos|pic|pics|picture|dsc|dscn|dscf|pxl|mvimg|screenshot|screen shot|whatsapp image|untitled|untitled design|scan|file|download|downloads|unnamed|copy|product|products|item|shot|frame|new|edit|final)$/;
const FIRST = new Set(["front", "main", "hero"]);

export type PhotoKey = { base: string; num: number | null; view: string | null; plain: boolean };

/** What a file name says: the piece it belongs to (`base`) and which photo of it, if the name says. */
export function photoKey(name: string): PhotoKey {
  let stem = name.replace(/\.[a-z0-9]{2,5}$/i, "").trim().toLowerCase();
  let num: number | null = null, view: string | null = null, stripped = false;
  if (!DATE_END.test(stem)) {
    for (let i = 0; i < 3; i++) { // at most "dress-back-2"
      const m = stem.match(TOKEN);
      if (!m || m.index === undefined) break;
      const rest = stem.slice(0, m.index).trim();
      if (!/[a-z0-9]/.test(rest)) break; // "1.jpg" or "back.jpg" is a name, not a numbered photo
      if (m[1] !== undefined) num ??= Number(m[1]);
      else view ??= m[2].replace(/[\s_-]/g, "");
      stem = rest;
      stripped = true;
    }
  }
  return { base: stem.replace(/[\s_-]+/g, " ").trim(), num, view, plain: !stripped };
}

const groupable = (base: string) => base.length >= 3 && !GENERIC.test(base) && !/^screen ?shot\b/.test(base);

// The main photo: the one with no number (dress.jpg), then front, main or hero, then the lowest number.
const rank = (k: PhotoKey) => (k.plain ? 0 : k.view && FIRST.has(k.view) ? 1 : k.num !== null ? 2 + k.num / 1000 : 3);

export type PhotoGroup = {
  /** What the piece is called from its file names, e.g. "dress". */
  base: string;
  /** Indexes into the dropped files: the main photo, the other photos in order, and any over the photo limit. */
  main: number;
  more: number[];
  leftOut: number[];
};

/** Dropped files -> pieces, in the order the pieces were first dropped. Every file is in exactly one group. */
export function groupByFileName(names: string[], max = MAX_PHOTOS): PhotoGroup[] {
  const keys = names.map(photoKey);
  const byBase = new Map<string, number[]>();
  keys.forEach((k, i) => {
    const id = groupable(k.base) ? k.base : `\u0000${i}`; // a name that can't be grouped is its own piece
    byBase.set(id, [...(byBase.get(id) ?? []), i]);
  });
  return [...byBase.values()].map((idx) => {
    const sorted = [...idx].sort((a, b) => rank(keys[a]) - rank(keys[b]) || a - b);
    return { base: keys[idx[0]].base, main: sorted[0], more: sorted.slice(1, max), leftOut: sorted.slice(max) };
  });
}

/** True when grouping puts at least two photos in one piece (so the screen asks before adding them). */
export const anyGrouped = (groups: PhotoGroup[]) => groups.some((g) => g.more.length > 0 || g.leftOut.length > 0);
