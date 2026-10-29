import { COLOURS, LENGTHS, MATERIALS, OCCASIONS, STYLES, isGarmentPart, singular, wordStem } from "../vocab/fashion";
import type { ProductFacts } from "../providers/types";
import type { GenerationInput } from "./types";
import { COPY } from "../copy";

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9'-]+/).filter(Boolean);
const empty = (): ProductFacts => ({ product_type: null, colour: [], material: [], pattern: [], fit_or_silhouette: [], length: [], features: [], occasion_or_style: [], audience: null, buyer_terms: [], unknowns: [], conflicts: [] });
const splitList = (s?: string) => (s ?? "").split(/[,;/&]|\band\b/i).map((x) => x.trim().toLowerCase()).filter(Boolean);

/** Same word in another form: "ruching" ~ "ruched", "sleeves" ~ "sleeve". Never an opposite: "strappy" !~ "strapless". */
const sameWord = (a: string, b: string) => wordStem(a) === wordStem(b);
const phraseKey = (s: string) => words(s).map(wordStem).join(" ");

/**
 * Facts straight from the structured form fields (no AI needed), plus a vocabulary scan of the free text.
 * Structured fields are the buyer's explicit statement, so they win.
 */
export function deterministicFacts(input: GenerationInput): ProductFacts {
  const f = empty();
  f.product_type = input.productType.toLowerCase();
  f.colour = splitList(input.colour);
  f.material = splitList(input.material);
  f.pattern = splitList(input.pattern);
  f.fit_or_silhouette = splitList(input.fit);
  f.length = splitList(input.length);
  f.features = splitList(input.feature);
  f.occasion_or_style = splitList(input.occasion);
  f.audience = input.audience?.trim().toLowerCase() || null;
  f.buyer_terms = input.freeText.split(/[,;]/).map((x) => x.trim().toLowerCase()).filter(Boolean);

  const scan = (list: string[], into: string[]) => {
    for (const w of words(`${input.freeText} ${input.extra ?? ""}`)) {
      const v = list.find((x) => sameWord(x, w));
      if (v && !into.some((x) => sameWord(x, v))) into.push(v);
    }
  };
  scan(COLOURS, f.colour); scan(MATERIALS, f.material); scan(LENGTHS, f.length);
  scan(STYLES.filter((s) => !LENGTHS.includes(s)), f.features); scan(OCCASIONS, f.occasion_or_style);
  const scoped = scopeToParts(f, inputSegments(input));
  scoped.conflicts = detectConflicts(scoped);
  return scoped;
}

/** Contradictions we can see without AI. Never resolved silently. */
export function detectConflicts(f: ProductFacts): string[] {
  const out: string[] = [];
  const len = f.length.filter((l) => ["mini", "midi", "maxi"].includes(l));
  if (new Set(len).size > 1) out.push(COPY.lengthConflict(len));
  const details = [...f.features, ...f.fit_or_silhouette, ...f.pattern, ...f.material];
  for (const neg of details.flatMap(words).filter((w) => /less$/.test(w))) {
    const base = wordStem(neg.slice(0, -4));
    const pos = details.find((d) => words(d).some((w) => w !== neg && wordStem(w).startsWith(base)));
    if (pos) out.push(COPY.oppositeConflict(neg, pos));
  }
  return out;
}

/**
 * Guard against extraction invention: keep only values the buyer actually wrote. Anything dropped is reported
 * so it shows as a warning rather than vanishing.
 */
export function groundFacts(facts: ProductFacts, input: GenerationInput): { facts: ProductFacts; dropped: string[] } {
  const src = inputSegments(input).flatMap(words);
  const grounded = (v: string) => words(v).every((w) => src.some((s) => sameWord(s, w)));
  const dropped: string[] = [];
  const keep = (arr: string[]) => arr.filter((v) => (grounded(v) ? true : (dropped.push(v), false)));
  const g: ProductFacts = {
    ...facts,
    colour: keep(facts.colour), material: keep(facts.material), pattern: keep(facts.pattern),
    fit_or_silhouette: keep(facts.fit_or_silhouette), length: keep(facts.length), features: keep(facts.features),
    occasion_or_style: keep(facts.occasion_or_style), buyer_terms: keep(facts.buyer_terms),
    audience: facts.audience && grounded(facts.audience) ? facts.audience : null,
  };
  if (facts.audience && !g.audience) dropped.push(facts.audience);
  g.product_type = input.productType.toLowerCase(); // the buyer's chosen product type is authoritative
  const scoped = scopeToParts(g, inputSegments(input));
  scoped.conflicts = [...new Set([...facts.conflicts, ...detectConflicts(scoped)])];
  return { facts: scoped, dropped };
}

/** The buyer's input as separate pieces of text: a field's value never runs on into the next field's words. */
function inputSegments(input: GenerationInput): string[] {
  return [input.freeText, input.productType, input.colour, input.material, input.pattern, input.fit, input.length, input.feature, input.occasion, input.audience, input.extra].filter((x): x is string => !!x);
}

/**
 * A colour or material the buyer only ever wrote right before a garment part ("mesh sleeves", "lace trim", "white
 * collar") describes that part, not the product. It moves out of colour/material into a feature unit ("mesh sleeve"),
 * so nothing downstream can call the whole dress mesh. Written on its own anywhere ("mesh dress", the Material field),
 * it stays a whole-product fact.
 */
export function scopeToParts(f: ProductFacts, segments: string[]): ProductFacts {
  const noun = wordStem(singular((f.product_type ?? "").toLowerCase().split(/\s+/).pop() ?? ""));
  const out: ProductFacts = { ...f, colour: [...f.colour], material: [...f.material], features: [...f.features] };
  for (const field of ["colour", "material"] as const) {
    for (const value of f[field]) {
      const v = words(value);
      if (!v.length) continue;
      const parts: (string | null)[] = []; // per occurrence: the part it sits before, or null when standalone
      for (const seg of segments.map(words)) {
        for (let i = 0; i + v.length <= seg.length; i++) {
          if (!v.every((w, j) => sameWord(w, seg[i + j]))) continue;
          const next = seg[i + v.length];
          parts.push(next && isGarmentPart(next) && wordStem(next) !== noun ? singular(next) : null);
        }
      }
      if (!parts.length || parts.includes(null)) continue;
      out[field] = out[field].filter((x) => x !== value);
      for (const part of new Set(parts as string[])) {
        const unit = `${v.join(" ")} ${part}`;
        out.features = out.features.filter((x) => phraseKey(x) !== wordStem(part)); // the bare part is now covered
        if (!out.features.some((x) => phraseKey(x) === phraseKey(unit))) out.features.push(unit);
      }
    }
  }
  return out;
}
