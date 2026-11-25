import type { KeywordDataProvider } from "./types";
import type { MonthlyPoint } from "../keywords/seasonal";
import { SerpProviderError, taskError } from "./dataforseo";

const BASE = "https://api.dataforseo.com/v3/dataforseo_labs/google";
const AUSTRALIA = { location_code: 2036, language_code: "en" };
const TIMEOUT_MS = 20_000; // a normal reply takes about 4 seconds, but under load it can take 10-20
const MAX_ATTEMPTS = 2;

type Task = { status_code?: number; status_message?: string; cost?: number; result?: { items?: { keyword?: string; keyword_info?: { search_volume?: number | null; monthly_searches?: { year: number; month: number; search_volume: number | null }[] | null } }[] }[] | null };

/** DataForSEO Labs, Google Australia: search volumes (keyword_overview) and suggestions (keyword_suggestions). Checked live 15 Nov 2026. */
export class DataForSeoLabs implements KeywordDataProvider {
  readonly cacheNamespace = "live";
  constructor(private login: string, private password: string, private fetchImpl: typeof fetch = fetch) {}

  private async call(path: string, task: Record<string, unknown>): Promise<Task> {
    const auth = "Basic " + Buffer.from(`${this.login}:${this.password}`).toString("base64");
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await this.fetchImpl(`${BASE}/${path}`, { method: "POST", headers: { Authorization: auth, "content-type": "application/json" }, body: JSON.stringify([{ ...AUSTRALIA, ...task }]), signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (res.status === 401 || res.status === 403) throw new SerpProviderError(`DataForSEO credentials rejected (HTTP ${res.status})`, false);
        if (res.status === 429 || res.status >= 500) throw new SerpProviderError(`DataForSEO ${res.status}`, true);
        if (!res.ok) throw new SerpProviderError(`DataForSEO ${res.status}`, false);
        const j = (await res.json()) as { status_code?: number; tasks?: Task[] };
        const t = j.tasks?.[0];
        if (j.status_code !== 20000 || !t || t.status_code !== 20000) throw taskError("DataForSEO Labs task failed", t);
        return t;
      } catch (e) {
        lastErr = e;
        if (!(e instanceof SerpProviderError ? e.retryable : true) || attempt === MAX_ATTEMPTS) break;
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1) + Math.random() * 400));
      }
    }
    throw lastErr instanceof SerpProviderError ? lastErr : new SerpProviderError("DataForSEO Labs request failed", true);
  }

  async volumes(phrases: string[]) {
    const keywords = [...new Set(phrases.map((p) => p.toLowerCase().trim()).filter((p) => p && p.length <= 80 && p.split(/\s+/).length <= 10))].slice(0, 700);
    const volumes: Record<string, number | null> = Object.fromEntries(keywords.map((k) => [k, null]));
    const monthly: Record<string, MonthlyPoint[]> = {};
    if (!keywords.length) return { volumes, monthly, costUsd: 0 };
    const t = await this.call("keyword_overview/live", { keywords });
    for (const it of t.result?.[0]?.items ?? []) {
      if (!it.keyword) continue;
      volumes[it.keyword.toLowerCase()] = it.keyword_info?.search_volume ?? null;
      // The same reply carries years of monthly figures (checked live 25 Nov 2026): the last three years are kept.
      const m = (it.keyword_info?.monthly_searches ?? []).filter((p) => typeof p.search_volume === "number").slice(0, 36).map((p) => ({ year: p.year, month: p.month, volume: p.search_volume! }));
      if (m.length) monthly[it.keyword.toLowerCase()] = m;
    }
    return { volumes, monthly, costUsd: t.cost ?? 0 };
  }

  async suggestions(seed: string, limit: number) {
    const t = await this.call("keyword_suggestions/live", { keyword: seed.toLowerCase().trim(), limit, filters: ["keyword_info.search_volume", ">", 0], order_by: ["keyword_info.search_volume,desc"] });
    const items = (t.result?.[0]?.items ?? []).filter((i) => i.keyword && (i.keyword_info?.search_volume ?? 0) > 0).map((i) => ({ keyword: i.keyword!.toLowerCase(), volume: i.keyword_info!.search_volume! }));
    return { items, costUsd: t.cost ?? 0 };
  }
}
