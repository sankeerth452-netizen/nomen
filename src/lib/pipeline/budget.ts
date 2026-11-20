// Time limits for the steps that call outside services, so one slow reply can't hold up a name.

/** Google results: the whole search step gets this long. A search still out after it is left out of this name. */
export const SEARCH_BUDGET_MS = () => Number(process.env.SEARCH_BUDGET_MS) || 15_000;
/** Live keyword figures (DataForSEO Labs): the same idea, before the searches are planned. */
export const LIVE_KEYWORDS_BUDGET_MS = () => Number(process.env.LIVE_KEYWORDS_BUDGET_MS) || 10_000;

/**
 * The promise's result, or `late()` if it takes longer than `ms`. The promise itself keeps running either way, so a
 * slow search still lands in the cache and the next piece that needs it gets it at once.
 */
export function within<T>(p: Promise<T>, ms: number, late: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((resolve) => { timer = setTimeout(() => resolve(late()), ms); });
  return Promise.race([p.finally(() => clearTimeout(timer)), deadline]);
}
