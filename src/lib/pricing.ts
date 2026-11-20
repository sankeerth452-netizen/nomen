// What a step cost, in US dollars, from the tokens it used. Claude's list prices per million tokens (Claude API
// reference, Nov 2026). A cached read is 5% of the input price on Opus 5.5 and 10% on the others; a cache write 125%.
// DataForSEO reports its own cost with each reply, so it's recorded as charged.
const PRICE: Record<string, { input: number; output: number; cachedRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cachedRead: 0.05 },
  "claude-sonnet-5-5": { input: 2, output: 10, cachedRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cachedRead: 0.1 },
};

type Tokens = { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };

export function claudeUsd(model: string, t: Tokens): number {
  const p = PRICE[model.replace(/-\d{8}$/, "")];
  if (!p) return 0;
  return ((t.input ?? 0) * p.input + (t.output ?? 0) * p.output + (t.cacheRead ?? 0) * p.input * p.cachedRead + (t.cacheWrite ?? 0) * p.input * 1.25) / 1e6;
}

/** A generation's cost from its stored usage: Claude (per model) and Google figures (DataForSEO). */
export function generationUsd(usage: unknown): { claude: number; google: number } {
  const u = (usage ?? {}) as { ai?: { byModel?: Record<string, Tokens> }; serp?: { costUsd?: number } };
  const claude = Object.entries(u.ai?.byModel ?? {}).reduce((sum, [m, t]) => sum + claudeUsd(m, t), 0);
  return { claude, google: u.serp?.costUsd ?? 0 };
}

/** Reading one range photo, from the usage the photo reader returned ({ model, inputTokens, outputTokens, ... }). */
export function readUsd(readUsage: unknown): number {
  const r = readUsage as { model?: string; inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number } | null;
  return r?.model ? claudeUsd(r.model, { input: r.inputTokens, output: r.outputTokens, cacheRead: r.cacheReadTokens, cacheWrite: r.cacheWriteTokens }) : 0;
}
