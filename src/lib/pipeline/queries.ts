import type { ProductFacts } from "../providers/types";
import type { KeywordEvidenceItem, OrderGuidance } from "./types";
import { normalizeKeyword } from "../keywords/normalize";
import { COPY } from "../copy";
import { isDefaultAudience, isUseWord } from "../vocab/fashion";

export type PlannedQuery = { query: string; reason: string };
const MAX_WORDS = 6; // real shopper phrasing, not a sentence

const jaccard = (a: string, b: string) => {
  const A = new Set(a.split(" ")), B = new Set(b.split(" "));
  return [...A].filter((x) => B.has(x)).length / new Set([...A, ...B]).size;
};

/**
 * Stage 4. Deterministic and bounded: at most `max` queries, each distinct, each describing the real product.
 *  1. the strongest dataset keyword
 *  2. the buyer's attributes in learned order + product type (their most commercially meaningful combination)
 *  3. an alternative phrasing: the next dataset keyword that is clearly different, else a shorter attribute combo
 */
export function planQueries(facts: ProductFacts, keywords: KeywordEvidenceItem[], order: OrderGuidance, max: number): PlannedQuery[] {
  if (max <= 0 || !facts.product_type) return [];
  const noun = facts.product_type.toLowerCase();
  const out: PlannedQuery[] = [];
  const ok = (q: string) => q.split(" ").length <= MAX_WORDS && out.every((o) => jaccard(o.query, q) < 0.75);
  const add = (query: string, reason: string) => {
    const q = normalizeKeyword(query);
    if (out.length < max && q && ok(q)) out.push({ query: q, reason });
  };

  const best = keywords[0];
  if (best) add(best.keyword, COPY.query.mostSearched(best.searchVolume));

  // Who it's for ("girls") and what it's made for ("tennis") change the market entirely, so the searches lead with
  // them: "girls burgundy tennis dress" finds girls' tennis dresses, not women's party dresses.
  const who = facts.audience && !isDefaultAudience(facts.audience) ? facts.audience.trim().toLowerCase() : null;
  const use = facts.occasion_or_style.map((o) => o.trim().toLowerCase()).find(isUseWord) ?? null;
  // Shoppers search "viscose", never "73% viscose": percentages come out of the searches (the fibre word stays).
  const attrs = [...new Set(order.final.filter((a) => a.toLowerCase() !== use).map((a) => a.replace(/\d+(?:\.\d+)?\s*%\s*/g, "").trim()).filter(Boolean))];
  const head = who ? [who] : [], tail = [...(use ? [use] : []), noun];
  const words = (parts: string[]) => parts.join(" ").split(" ").length;
  const mid: string[] = [];
  for (const a of attrs.slice(0, 3)) if (words([...head, ...mid, a, ...tail]) <= MAX_WORDS) mid.push(a);
  // The order only reflects shopper searches when it came with matching keywords; otherwise it's the usual order for the type.
  if (mid.length || who || use) add([...head, ...mid, ...tail].join(" "), keywords.length ? COPY.query.yourDetails : COPY.query.yourDetailsUsualOrder);
  else add(noun, COPY.query.typeOnly);

  const second = keywords.find((k) => k !== best && out.every((o) => jaccard(o.query, k.keyword) < 0.75));
  if (second) add(second.keyword, COPY.query.anotherWay);
  else if (who || use) add([...head, ...tail].join(" "), COPY.query.whoAndWhat);
  else if (attrs.length > 1) add([attrs[0], noun].join(" "), COPY.query.broader);

  return out;
}
