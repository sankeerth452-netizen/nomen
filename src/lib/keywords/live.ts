// Live Google search figures (DataForSEO Labs, Australia) for phrases the brand's keyword list doesn't have: monthly
// searches for the piece's own phrase variants ("girls maxi dress"), and the phrases shoppers use around it. They join
// the list's matches before scoring, so the same rules (no detail the buyer didn't give) decide what counts.
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import type { KeywordDataProvider, ProductFacts } from "../providers/types";
import { categoryForType, isDefaultAudience, singular } from "../vocab/fashion";
import { normalizeKeyword } from "./normalize";
import type { MonthlyPoint } from "./seasonal";
import { attributeTerms, searchVariants, type RawCandidate } from "./retrieve";

const TTL_DAYS = 30; // Google's figures are monthly
const MAX_VOLUME_PHRASES = 20;
const SUGGESTIONS = 30;
const STRONG = 100; // a list match with at least this many searches a month counts as covering the piece

export type LiveTally = { calls: number; cached: number; costUsd: number };
export const newTally = (): LiveTally => ({ calls: 0, cached: 0, costUsd: 0 });

const json = (v: unknown) => v as Prisma.InputJsonValue;
const cacheRow = (key: string, query: string, reducedResponse: unknown) => ({
  cacheKey: key, query, location: "Australia", language: "English", device: "labs", expiresAt: new Date(Date.now() + TTL_DAYS * 86_400_000), reducedResponse: json(reducedResponse), providerStatus: "ok",
});

type CachedVolume = { volume: number | null; monthly?: MonthlyPoint[] };
const volumeKey = (provider: KeywordDataProvider, p: string) => `${provider.cacheNamespace}:labs-volume:${p}`;

/**
 * Monthly searches for phrases: cached figures first, one request for the rest. null = Google has no figure.
 * Each reply's monthly history is kept with the figure; `needMonthly` phrases cached before history was kept are
 * asked for again (same request, a fraction of a cent each).
 */
export async function liveVolumes(provider: KeywordDataProvider, phrases: string[], tally: LiveTally, opts: { needMonthly?: string[] } = {}): Promise<Map<string, number | null>> {
  const ps = [...new Set(phrases.map(normalizeKeyword).filter(Boolean))];
  const wantMonthly = new Set((opts.needMonthly ?? []).map(normalizeKeyword));
  const out = new Map<string, number | null>();
  const hits = await db.serpCache.findMany({ where: { cacheKey: { in: ps.map((p) => volumeKey(provider, p)) }, expiresAt: { gt: new Date() } }, select: { query: true, reducedResponse: true } });
  for (const h of hits) {
    const c = h.reducedResponse as CachedVolume;
    if (wantMonthly.has(h.query) && !c.monthly && c.volume) continue; // a figure without its history: ask again
    out.set(h.query, c.volume);
    tally.cached++;
  }
  const misses = ps.filter((p) => !out.has(p));
  if (!misses.length) return out;
  const r = await provider.volumes(misses);
  tally.calls++; tally.costUsd += r.costUsd;
  await db.$transaction(misses.map((p) => {
    const v = r.volumes[p] ?? null;
    out.set(p, v);
    const row = cacheRow(volumeKey(provider, p), p, { volume: v, ...(r.monthly?.[p]?.length ? { monthly: r.monthly[p] } : {}) });
    return db.serpCache.upsert({ where: { cacheKey: row.cacheKey }, create: row, update: { fetchedAt: new Date(), expiresAt: row.expiresAt, reducedResponse: row.reducedResponse } });
  }));
  return out;
}

/** The monthly history kept with phrases' figures (no request): phrase -> history, for phrases that have one. */
export async function cachedMonthly(provider: KeywordDataProvider, phrases: string[]): Promise<Map<string, MonthlyPoint[]>> {
  const ps = [...new Set(phrases.map(normalizeKeyword).filter(Boolean))];
  const rows = ps.length ? await db.serpCache.findMany({ where: { cacheKey: { in: ps.map((p) => volumeKey(provider, p)) } }, select: { query: true, reducedResponse: true, fetchedAt: true } }) : [];
  return new Map(rows.filter((r) => (r.reducedResponse as CachedVolume).monthly?.length).map((r) => [r.query, (r.reducedResponse as CachedVolume).monthly!]));
}

/** Searched phrases containing the seed, most searched first, cached for a month. */
export async function liveSuggestions(provider: KeywordDataProvider, seed: string, tally: LiveTally): Promise<{ keyword: string; volume: number }[]> {
  const s = normalizeKeyword(seed);
  const key = `${provider.cacheNamespace}:labs-suggest:${s}`;
  const hit = await db.serpCache.findUnique({ where: { cacheKey: key } });
  if (hit && hit.expiresAt > new Date()) { tally.cached++; return (hit.reducedResponse as { items: { keyword: string; volume: number }[] }).items; }
  const r = await provider.suggestions(s, SUGGESTIONS);
  tally.calls++; tally.costUsd += r.costUsd;
  const row = cacheRow(key, s, { items: r.items });
  await db.serpCache.upsert({ where: { cacheKey: key }, create: row, update: { fetchedAt: new Date(), expiresAt: row.expiresAt, reducedResponse: row.reducedResponse } });
  return r.items;
}

/** "girls", "boys", "kids"... as shoppers type it, or null for women's (the default, never searched with). */
export function audienceWord(audience: string | null): string | null {
  const a = (audience ?? "").toLowerCase().replace(/[^a-z ]/g, "").trim();
  if (!a || isDefaultAudience(a)) return null;
  if (/\bgirls?\b/.test(a)) return "girls";
  if (/\bboys?\b/.test(a)) return "boys";
  if (/\b(kids?|children|child)\b/.test(a)) return "kids";
  if (/\b(baby|babies|toddlers?|infants?)\b/.test(a)) return "baby";
  if (/\bmen|mens\b/.test(a)) return "mens";
  if (/\bmaternity\b/.test(a)) return "maternity";
  return null;
}

/** The piece's phrases with its audience in front ("girls maxi dress"), which the plain variants leave out. */
export function audienceVariants(f: ProductFacts): string[] {
  const aud = audienceWord(f.audience);
  const t = f.product_type?.toLowerCase().trim();
  if (!aud || !t) return [];
  const plural = singular(t) !== t ? t : /(s|x|z|ch|sh)$/.test(t) ? `${t}es` : `${t}s`; // "jeans" is already plural
  const bits = [f.colour[0], f.length[0], f.features[0], f.material[0]].filter(Boolean).map((b) => b!.toLowerCase());
  return [...new Set([`${aud} ${t}`, `${aud} ${plural}`, ...bits.map((b) => `${aud} ${b} ${t}`)])];
}

/** Where to look for suggestions: the audience and type, else the main colour or detail with the type ("black slip dress"). */
export function suggestionSeed(f: ProductFacts): string | null {
  const t = f.product_type?.toLowerCase().trim();
  if (!t) return null;
  const aud = audienceWord(f.audience);
  if (aud) return `${aud} ${t}`;
  const first = f.colour[0] ?? f.features[0] ?? f.fit_or_silhouette[0] ?? f.length[0] ?? f.material[0];
  return first ? `${first.toLowerCase()} ${t}` : t;
}

const wordSet = (p: string) => p.split(/\s+/).map((w) => singular(w)).sort().join(" ");

/**
 * Live candidates to rank beside the list's matches: figures for the piece's own phrases the list doesn't have, and,
 * when the list barely covers the piece, the phrases shoppers use around it. Word-order twins ("slip dress black",
 * "black slip dress") share one figure in Google's data, so only one is kept.
 */
export async function liveCandidates(facts: ProductFacts, existing: RawCandidate[], provider: KeywordDataProvider, tally: LiveTally): Promise<RawCandidate[]> {
  const have = new Set(existing.map((c) => c.normalizedKeyword));
  const variants = [...new Set([...searchVariants(facts), ...audienceVariants(facts)].map(normalizeKeyword))].filter((v) => !have.has(v)).slice(0, MAX_VOLUME_PHRASES);
  const found = new Map<string, number>();
  if (variants.length) for (const [p, v] of await liveVolumes(provider, variants, tally)) if (v && v > 0) found.set(p, v);

  const attrs = attributeTerms(facts);
  const strong = existing.filter((c) => (c.searchVolume ?? 0) >= STRONG && attrs.some((a) => c.normalizedKeyword.split(/\s+/).includes(a))).length;
  const seed = suggestionSeed(facts);
  if (seed && (strong < 3 || audienceWord(facts.audience))) for (const s of await liveSuggestions(provider, seed, tally)) if (!have.has(s.keyword) && !found.has(s.keyword)) found.set(s.keyword, s.volume);

  const seen = new Set([...existing.map((c) => wordSet(c.normalizedKeyword))]);
  const out: RawCandidate[] = [];
  for (const [phrase, volume] of [...found].sort((a, b) => b[1] - a[1])) {
    const ws = wordSet(phrase);
    if (seen.has(ws)) continue;
    seen.add(ws);
    out.push({ id: `google:${phrase}`, originalKeyword: phrase, normalizedKeyword: phrase, searchVolume: volume, category: categoryForType(facts.product_type), subcategory: null, source: "google" });
  }
  return out;
}
