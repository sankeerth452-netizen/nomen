// In-memory sliding window. Fine for the single-instance MVP; swap for a shared store if we scale out.
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) { hits.set(key, recent); return false; }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

/** Take `n` uses at once, all or nothing (naming a whole range counts every piece). */
export function rateLimitMany(key: string, n: number, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length + n > max) { hits.set(key, recent); return false; }
  hits.set(key, [...recent, ...Array(n).fill(now)]);
  return true;
}
