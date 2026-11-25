// When shoppers search for something, from Google's monthly search history (DataForSEO Labs, Australia). Shows when a
// phrase peaks, so a buyer knows a piece's searches are seasonal. Google's figures only: never mixed with the keyword
// list's (Ahrefs) numbers, which measure differently. No database code: screens use it too.
export type MonthlyPoint = { year: number; month: number; volume: number };
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A phrase stands out in a month when its searches are at least this many times its yearly average. */
export const PEAK_FACTOR = 1.4;

export type SeasonProfile = {
  /** Average monthly searches for each calendar month, January first, over the last three years. */
  byMonth: number[];
  average: number;
  /** Calendar months (0 = January) at or above PEAK_FACTOR times the average. */
  peaks: number[];
  /** The busiest month's searches over the yearly average (1 = flat all year). */
  strength: number;
};

/** The seasonal shape of a phrase from its monthly history, or null with too little history (under 12 months). */
export function seasonProfile(points: MonthlyPoint[] | null | undefined): SeasonProfile | null {
  const pts = [...(points ?? [])].filter((p) => Number.isFinite(p.volume)).sort((a, b) => b.year - a.year || b.month - a.month).slice(0, 36);
  if (pts.length < 12) return null;
  const sums = Array(12).fill(0), counts = Array(12).fill(0);
  for (const p of pts) { sums[p.month - 1] += p.volume; counts[p.month - 1]++; }
  const byMonth = sums.map((s, i) => (counts[i] ? Math.round(s / counts[i]) : 0));
  const average = byMonth.reduce((a, b) => a + b, 0) / 12;
  if (average <= 0) return null;
  const peaks = byMonth.map((v, i) => [v, i] as const).filter(([v]) => v >= PEAK_FACTOR * average).map(([, i]) => i);
  return { byMonth, average: Math.round(average), peaks, strength: Math.round((Math.max(...byMonth) / average) * 10) / 10 };
}

/** Peak months as a short span or list, wrapping over the new year: [10, 11, 0] -> "Nov–Jan". */
export function monthSpan(months: number[]): string {
  if (!months.length) return "";
  const set = new Set(months);
  // Start each run where the month before isn't a peak, so Nov–Jan stays one run.
  const starts = months.filter((m) => !set.has((m + 11) % 12));
  if (!starts.length) return "all year";
  const runs = starts.sort((a, b) => a - b).map((s) => { let e = s; while (set.has((e + 1) % 12) && (e + 1) % 12 !== s) e = (e + 1) % 12; return e === s ? MONTHS[s] : `${MONTHS[s]}–${MONTHS[e]}`; });
  return runs.join(", ");
}

/** "Searches peak in Nov–Dec (about 5 times the yearly average)", or null when the phrase is steady all year. */
export function describeSeason(p: SeasonProfile | null): string | null {
  if (!p || !p.peaks.length || p.peaks.length > 6 || p.strength < PEAK_FACTOR) return null;
  const times = p.strength >= 2 ? `about ${Math.round(p.strength)} times` : `about ${p.strength.toFixed(1)} times`;
  return `Searches peak in ${monthSpan(p.peaks)} (${times} the yearly average)`;
}

/**
 * How much busier the next `ahead` months are than this month (2 = twice as busy), for "coming up" lists.
 * `now` is a calendar month, 0 = January.
 */
export function riseAhead(p: SeasonProfile, now: number, ahead = 2): number {
  const base = Math.max(1, p.byMonth[now]);
  const next = Array.from({ length: ahead }, (_, i) => p.byMonth[(now + 1 + i) % 12]);
  return Math.round((Math.max(...next) / base) * 10) / 10;
}

/** Seasonal and occasion phrases a fashion retailer in Australia plans around, for the dashboard's calendar. */
export const SEASONAL_PHRASES = [
  "christmas dress", "christmas party dress", "new years eve dress", "party dress", "sequin dress", "wedding guest dress", "races dress",
  "spring racing dress", "formal dress", "school formal dress", "graduation dress", "cocktail dress", "white dress", "valentines day dress",
  "summer dress", "maxi dress", "linen dress", "linen pants", "resort wear", "kaftan", "one piece swimsuit", "bikini", "swimwear", "denim shorts",
  "winter coat", "puffer jacket", "trench coat", "knitwear", "jumper", "cardigan", "boots", "ankle boots", "blazer", "work pants", "jeans",
];
