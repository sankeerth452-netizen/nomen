// Time limits for the steps that call outside services, so one slow reply can't hold up a name.

/**
 * Google results: the whole search step gets this long. A search still out after it is left out of this name.
 * A piece named on its own has someone waiting for it; a range runs in the background, three pieces at a time, when
 * DataForSEO answers more slowly, so it waits longer rather than lose evidence (seen 20 Nov: 6 of 36 searches cut off).
 */
export const SEARCH_BUDGET_MS = (background = false) => Number(process.env.SEARCH_BUDGET_MS) || (background ? 45_000 : 20_000);
/** Live keyword figures (DataForSEO Labs): the same idea, before the searches are planned. */
export const LIVE_KEYWORDS_BUDGET_MS = (background = false) => Number(process.env.LIVE_KEYWORDS_BUDGET_MS) || (background ? 30_000 : 12_000);

/**
 * The promise's result, or `late()` if it takes longer than `ms`. The promise itself keeps running either way, so a
 * slow search still lands in the cache and the next piece that needs it gets it at once.
 */
export function within<T>(p: Promise<T>, ms: number, late: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((resolve) => { timer = setTimeout(() => resolve(late()), ms); });
  return Promise.race([p.finally(() => clearTimeout(timer)), deadline]);
}
