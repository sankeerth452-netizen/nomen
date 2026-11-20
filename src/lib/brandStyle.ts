// Learn how a brand writes from products it has already approved: how long its names are, the order of details, which
// of two words for the same thing it uses, its colour words, and how its descriptions are built. The result is a
// proposal: nothing is applied until a brand admin ticks what they want and saves it.
import { classify, singular, STYLES } from "./vocab/fashion";
import { plainColour } from "./sheet/catalog";
import type { BrandTerm } from "./brand";

export type CatalogueRow = { title: string; description?: string };
type Order = "colour" | "feature" | "material" | "length";
export type Counted = { word: string; count: number };

export type StyleProposal = {
  products: number;
  titles: { averageChars: number; averageWords: number; longest90: number; titleCase: "title" | "sentence" | "lower" };
  suggestedMaxLength: number;
  attributeOrder: Order[] | null;
  terms: (BrandTerm & { counts: Counted[] })[];
  colours: Counted[];
  nouns: Counted[];
  details: Counted[];
  descriptions: { averageWords: number; averageParagraphs: number; usesLists: boolean; withDescription: number } | null;
  examples: string[];
  /** How the brand sounds, from a reading of its own descriptions (written by AI, checked by the admin). */
  voice?: { tone: string; audience: string; descriptionStyle: string };
};

// Two or more words for one thing. The brand's most-used one becomes its word, if it clearly leads.
const SAME_THING: { words: string[]; kind: BrandTerm["kind"] }[] = [
  { words: ["pants", "trousers"], kind: "product" }, { words: ["tee", "t-shirt"], kind: "product" }, { words: ["jumper", "sweater"], kind: "product" },
  { words: ["sneakers", "trainers"], kind: "product" }, { words: ["cardigan", "cardi"], kind: "product" }, { words: ["singlet", "tank"], kind: "product" },
  { words: ["grey", "gray"], kind: "colour" }, { words: ["multi", "multicolour", "multicolor"], kind: "colour" }, { words: ["off white", "off-white"], kind: "colour" },
  { words: ["midi", "mid-length"], kind: "other" }, { words: ["playsuit", "romper"], kind: "product" }, { words: ["bum bag", "belt bag"], kind: "product" },
];
const SMALL = new Set(["a", "an", "and", "the", "of", "with", "in", "on", "for", "to", "&"]);
const words = (s: string) => s.match(/[A-Za-z0-9][A-Za-z0-9'-]*|&/g) ?? [];
const has = (text: string, w: string) => new RegExp(`(^|[^a-z])${w.replace(/[-\s]/g, "[-\\s]?")}s?($|[^a-z])`, "i").test(text);
const top = (m: Map<string, number>, n: number, min = 1): Counted[] => [...m].filter(([, c]) => c >= min).sort((a, b) => b[1] - a[1]).slice(0, n).map(([word, count]) => ({ word, count }));
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const stripHtml = (s: string) => s.replace(/<\s*(br|\/p|\/li|\/div)\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

function caseOf(title: string): "title" | "sentence" | "lower" | null {
  const ws = words(title).filter((w) => /^[a-z]/i.test(w));
  if (ws.length < 2) return null;
  if (ws.every((w) => w === w.toLowerCase())) return "lower";
  const rest = ws.slice(1).filter((w) => !SMALL.has(w.toLowerCase()));
  if (rest.length && rest.every((w) => /^[A-Z]/.test(w))) return "title";
  if (/^[A-Z]/.test(ws[0]) && rest.every((w) => /^[a-z]/.test(w))) return "sentence";
  return null;
}

/** The order the brand puts details in: for each pair of kinds, which usually comes first. Needs 10 or more names. */
export function learnOrder(titles: string[]): Order[] | null {
  const kinds: Order[] = ["colour", "feature", "material", "length"];
  const seen = new Map<Order, number>(), before = new Map<string, number>();
  for (const t of titles) {
    const first = new Map<Order, number>();
    words(t).forEach((w, i) => { const c = classify(w.toLowerCase()); if (c && !first.has(c)) first.set(c, i); });
    for (const k of first.keys()) bump(seen as Map<string, number>, k);
    for (const a of first.keys()) for (const b of first.keys()) if (a !== b && first.get(a)! < first.get(b)!) bump(before, `${a}>${b}`);
  }
  if (titles.length < 10) return null;
  const used = kinds.filter((k) => (seen.get(k) ?? 0) >= Math.max(2, titles.length * 0.1));
  if (used.length < 2) return null;
  const wins = (k: Order) => used.reduce((n, o) => n + ((before.get(`${k}>${o}`) ?? 0) > (before.get(`${o}>${k}`) ?? 0) ? 1 : 0), 0);
  return [...used].sort((a, b) => wins(b) - wins(a));
}

export function analyseCatalogue(rows: CatalogueRow[]): StyleProposal {
  const titles = rows.map((r) => r.title.replace(/\s+/g, " ").trim()).filter(Boolean);
  const n = titles.length || 1;
  const lengths = titles.map((t) => t.length).sort((a, b) => a - b);
  const p90 = lengths[Math.min(lengths.length - 1, Math.floor(lengths.length * 0.9))] ?? 0;
  const cases = new Map<string, number>();
  for (const t of titles) { const c = caseOf(t); if (c) bump(cases, c); }
  const titleCase = (top(cases, 1)[0]?.word ?? "title") as StyleProposal["titles"]["titleCase"];

  // One thing, two words: the brand's word is the one it uses at least three times as often, at least three times.
  const terms: StyleProposal["terms"] = [];
  for (const g of SAME_THING) {
    const counts = g.words.map((w) => ({ word: w, count: titles.filter((t) => has(t, w)).length })).sort((a, b) => b.count - a.count);
    const [lead, ...others] = counts;
    if (lead.count >= 3 && others.every((o) => lead.count >= 3 * o.count)) {
      terms.push({ use: lead.word.replace(/\b\w/g, (c) => c.toUpperCase()), instead: others.map((o) => o.word), kind: g.kind, counts });
    }
  }

  const colours = new Map<string, number>(), nouns = new Map<string, number>(), details = new Map<string, number>();
  const styleWords = new Set(STYLES.map(singular));
  for (const t of titles) {
    const ws = words(t).map((w) => w.toLowerCase());
    for (const w of ws) if (plainColour(w)) bump(colours, w.replace(/^\w/, (c) => c.toUpperCase()));
    for (const w of new Set(ws)) if (styleWords.has(singular(w))) bump(details, w);
    const last = ws.filter((w) => w !== "&").at(-1);
    if (last) bump(nouns, last);
  }

  const descs = rows.map((r) => (r.description ? stripHtml(r.description).trim() : "")).filter((d) => d.length > 20);
  const descriptions = descs.length ? {
    averageWords: Math.round(descs.reduce((s, d) => s + d.split(/\s+/).length, 0) / descs.length),
    averageParagraphs: Math.round((descs.reduce((s, d) => s + d.split(/\n\s*\n|\n/).filter((p) => p.trim()).length, 0) / descs.length) * 10) / 10,
    usesLists: rows.filter((r) => /<li|^\s*[-•*]\s/m.test(r.description ?? "")).length > descs.length / 3,
    withDescription: descs.length,
  } : null;

  // Typical names: near the brand's usual length, in its usual case.
  const avg = titles.reduce((s, t) => s + t.length, 0) / n;
  const examples = [...new Set(titles.filter((t) => caseOf(t) === titleCase))].sort((a, b) => Math.abs(a.length - avg) - Math.abs(b.length - avg)).slice(0, 6);

  return {
    products: titles.length,
    titles: { averageChars: Math.round(avg), averageWords: Math.round((titles.reduce((s, t) => s + words(t).length, 0) / n) * 10) / 10, longest90: p90, titleCase },
    suggestedMaxLength: Math.min(150, Math.max(30, Math.ceil((p90 + 5) / 5) * 5)),
    attributeOrder: learnOrder(titles),
    terms, colours: top(colours, 12, 2), nouns: top(nouns, 10, 2), details: top(details, 12, 2), descriptions, examples,
  };
}

/** A sample of the brand's own products for reading its voice: varied, with descriptions, within a small budget. */
export function voiceSample(rows: CatalogueRow[], max = 12): CatalogueRow[] {
  const withDesc = rows.filter((r) => (r.description ?? "").length > 80);
  const step = Math.max(1, Math.floor(withDesc.length / max));
  return withDesc.filter((_, i) => i % step === 0).slice(0, max).map((r) => ({ title: r.title.slice(0, 150), description: stripHtml(r.description ?? "").replace(/\s+/g, " ").trim().slice(0, 700) }));
}

/** The kinds of detail in a name, in the order they appear ("Black Satin Midi Dress": colour, material, length). */
export function orderIn(title: string): Order[] {
  const out: Order[] = [];
  for (const w of words(title)) { const c = classify(w.toLowerCase()); if (c && !out.includes(c)) out.push(c); }
  return out;
}
