import type { AiUsage } from "../providers/types";
import { updateGeneration } from "./store";

/** Usage and technical notes for engineers. Stored with the generation, never shown on screen. */
export async function addUsage(id: string, add: { ai?: AiUsage; serpCalls?: number; serpCached?: number; serpCostUsd?: number; errorMessage?: string; notes?: string[] }) {
  // Under the row lock: the product page and product data add usage at the same time.
  await updateGeneration(id, (g) => ({ usage: tally(g.usage, add) }));
}

function tally(usage: unknown, add: Parameters<typeof addUsage>[1]) {
  const g = { usage };
  type Tally = { input: number; output: number; cacheRead?: number; cacheWrite?: number };
  const u = (g.usage ?? {}) as { ai?: Tally & { calls: number; models?: string[]; byModel?: Record<string, Tally> }; serp?: { calls: number; cached: number; costUsd: number }; errorMessage?: string; notes?: string[] };
  const models = [...new Set([...(u.ai?.models ?? []), ...(add.ai?.model ? [add.ai.model] : [])])];
  // Per model too, so the cost of each step is known exactly when steps run on different models.
  const byModel = { ...(u.ai?.byModel ?? {}) };
  if (add.ai?.model) {
    const t = byModel[add.ai.model] ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    byModel[add.ai.model] = { input: t.input + add.ai.inputTokens, output: t.output + add.ai.outputTokens, cacheRead: (t.cacheRead ?? 0) + (add.ai.cacheReadTokens ?? 0), cacheWrite: (t.cacheWrite ?? 0) + (add.ai.cacheWriteTokens ?? 0) };
  }
  u.ai = {
    input: (u.ai?.input ?? 0) + (add.ai?.inputTokens ?? 0), output: (u.ai?.output ?? 0) + (add.ai?.outputTokens ?? 0),
    cacheRead: (u.ai?.cacheRead ?? 0) + (add.ai?.cacheReadTokens ?? 0), cacheWrite: (u.ai?.cacheWrite ?? 0) + (add.ai?.cacheWriteTokens ?? 0),
    calls: (u.ai?.calls ?? 0) + (add.ai ? 1 : 0), ...(models.length ? { models, byModel } : {}),
  };
  u.serp = { calls: (u.serp?.calls ?? 0) + (add.serpCalls ?? 0), cached: (u.serp?.cached ?? 0) + (add.serpCached ?? 0), costUsd: +((u.serp?.costUsd ?? 0) + (add.serpCostUsd ?? 0)).toFixed(5) };
  if (add.errorMessage) u.errorMessage = add.errorMessage;
  if (add.notes?.length) u.notes = [...(u.notes ?? []), ...add.notes];
  return u;
}
