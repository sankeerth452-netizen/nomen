// The dashboard's seasonal calendar: when Australian shoppers search for the season's and occasions' pieces, from
// Google's monthly history. One request a month (cached 30 days, about 1.5 cents), recorded in the spend ledger.
import type { KeywordDataProvider } from "../providers/types";
import { cachedMonthly, liveVolumes, newTally } from "../keywords/live";
import { SEASONAL_PHRASES, describeSeason, riseAhead, seasonProfile } from "../keywords/seasonal";
import { recordGoogle, type UsageWho } from "../usage/ledger";
import { db } from "../db";

export type SeasonRow = { phrase: string; average: number; months: number[]; season: string | null; rise: number };

/** Australia's calendar month now (0 = January). */
export const australianMonth = (d = new Date()) => Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", month: "numeric" }).format(d)) - 1;

/** A phrase counts as rising only when its coming peak reaches this many searches a month: 60 to 4,000 is "62 times", but tiny. */
export const RISING_MIN_SEARCHES = 300;

export async function seasonalCalendar(provider: KeywordDataProvider, who: UsageWho, now = new Date()): Promise<{ rows: SeasonRow[]; comingUp: SeasonRow[]; inSeason: SeasonRow[]; checkedAt: Date | null; month: number }> {
  const tally = newTally();
  try {
    await liveVolumes(provider, SEASONAL_PHRASES, tally, { needMonthly: SEASONAL_PHRASES });
  } catch (e) {
    console.error("seasonal figures failed", e instanceof Error ? e.message : e); // show what's cached
  }
  if (tally.costUsd > 0) await recordGoogle(who, "seasonal_figures", tally.costUsd);
  const history = await cachedMonthly(provider, SEASONAL_PHRASES);
  const month = australianMonth(now);
  const rows: (SeasonRow & { nextPeak: number; peakNow: boolean })[] = [];
  for (const phrase of SEASONAL_PHRASES) {
    const p = seasonProfile(history.get(phrase));
    if (p) rows.push({ phrase, average: p.average, months: p.byMonth, season: describeSeason(p), rise: riseAhead(p, month), nextPeak: Math.max(p.byMonth[(month + 1) % 12], p.byMonth[(month + 2) % 12]), peakNow: !!describeSeason(p) && p.peaks.includes(month) });
  }
  const plain = ({ nextPeak: _n, peakNow: _p, ...r }: (typeof rows)[number]): SeasonRow => r;
  const last = await db.serpCache.findFirst({ where: { cacheKey: { startsWith: `${provider.cacheNamespace}:labs-volume:` }, query: { in: SEASONAL_PHRASES } }, orderBy: { fetchedAt: "desc" }, select: { fetchedAt: true } });
  return {
    rows: [...rows].sort((a, b) => b.average - a.average).map(plain),
    comingUp: rows.filter((r) => r.rise >= 1.5 && r.nextPeak >= RISING_MIN_SEARCHES).sort((a, b) => b.rise - a.rise).slice(0, 8).map(plain),
    inSeason: rows.filter((r) => r.peakNow).sort((a, b) => b.months[month] - a.months[month]).slice(0, 8).map(plain),
    checkedAt: last?.fetchedAt ?? null, month,
  };
}
