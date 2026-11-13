import type { SerpProvider, SerpResponse, SerpResult } from "./types";
import { classifyPage } from "../serp/reduce";

const ENDPOINT = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";
const TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 3;

export class SerpProviderError extends Error {
  constructor(message: string, public retryable: boolean) {
    super(message);
  }
}

type Item = { type?: string; rank_group?: number; domain?: string; title?: string; url?: string; description?: string; breadcrumb?: string; website_name?: string };

/**
 * DataForSEO Google Organic Live Advanced.
 * NOTE: written from the public docs and covered by mocked-response tests only. It has NOT been run against the live API.
 */
export class DataForSeoProvider implements SerpProvider {
  // "live2": results cached before Google-wrapped links were read (Nov 2026) came back empty, so they are never reused.
  readonly cacheNamespace = "live2";
  constructor(private login: string, private password: string, private fetchImpl: typeof fetch = fetch) {}

  async search(opts: { query: string; location: string; language: string; device: string; depth: number }): Promise<SerpResponse> {
    const body = JSON.stringify([{ keyword: opts.query, location_name: opts.location, language_name: opts.language, device: opts.device, depth: opts.depth }]);
    const auth = "Basic " + Buffer.from(`${this.login}:${this.password}`).toString("base64");

    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
        const res = await this.fetchImpl(ENDPOINT, { method: "POST", headers: { Authorization: auth, "content-type": "application/json" }, body, signal: ctl.signal }).finally(() => clearTimeout(timer));
        if (res.status === 401 || res.status === 403) throw new SerpProviderError(`DataForSEO credentials rejected (HTTP ${res.status}). Check the login and the API password (not the website password), and that the account has credit.`, false);
        if (res.status === 429 || res.status >= 500) throw new SerpProviderError(`DataForSEO ${res.status}`, true);
        if (!res.ok) throw new SerpProviderError(`DataForSEO ${res.status}`, false);
        return parseResponse(opts.query, await res.json());
      } catch (e) {
        lastErr = e;
        const retryable = e instanceof SerpProviderError ? e.retryable : true; // network/abort -> retry
        if (!retryable || attempt === MAX_ATTEMPTS) break;
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1) + Math.random() * 400)); // backoff + jitter
      }
    }
    throw lastErr instanceof SerpProviderError ? lastErr : new SerpProviderError("DataForSEO request failed", true);
  }
}

/** Reduce the raw payload to what we keep. Credentials/headers never reach here; snippet text is truncated. */
export function parseResponse(query: string, json: unknown): SerpResponse {
  const j = json as { status_code?: number; tasks?: { status_code?: number; status_message?: string; cost?: number; result?: { items?: Item[] }[] }[] };
  const task = j.tasks?.[0];
  if (j.status_code !== 20000 || !task || task.status_code !== 20000) {
    throw new SerpProviderError(`DataForSEO task failed: ${task?.status_message ?? "unknown"}`, false);
  }
  // Google now wraps result links (google.com/goto?url=...) and reports google.com as the domain. The shop's real
  // address is in the breadcrumb ("https://www.shop.com.au › collections › lace-tops"), so read it from there.
  // Google's own pages (shopping and image links) aren't competitors' titles, so they still aren't evidence.
  const items = (task.result?.[0]?.items ?? []).filter((i) => i.type === "organic" && i.title && i.url).map((i) => ({ ...i, ...realPage(i) }))
    .filter((i): i is typeof i & { url: string; domain: string } => !!i.url && !!i.domain && !isGoogle(i.domain));
  const results: SerpResult[] = items.slice(0, 10).map((i, idx) => ({
    rank: i.rank_group ?? idx + 1,
    title: String(i.title).slice(0, 200),
    domain: i.domain,
    url: i.url.slice(0, 300),
    resultType: "organic",
    snippet: String(i.description ?? "").slice(0, 200),
    pageClass: classifyPage(i.url, String(i.title), i.domain),
  }));
  return { query, checkedAt: new Date().toISOString(), results, costUsd: task.cost };
}

const safeHost = (u: string) => { try { return new URL(u).host; } catch { return ""; } };
const isGoogle = (host: string) => /(^|\.)google\.[a-z.]+$/i.test(host);

/** The page a result really points to: its own URL, or for a Google-wrapped link, the address in its breadcrumb. */
function realPage(i: Item): { url: string | undefined; domain: string | undefined } {
  const host = i.domain || safeHost(i.url ?? "");
  if (!isGoogle(host) || !/^https?:\/\/[^/]*google\.[a-z.]+\/(goto|url)\b/i.test(i.url ?? "")) return { url: i.url, domain: host };
  const m = /^(https?:\/\/[^\s›]+)((?:\s*›\s*[^›]+)*)$/.exec((i.breadcrumb ?? "").trim());
  const bHost = m ? safeHost(m[1]) : "";
  if (!bHost) return { url: undefined, domain: undefined }; // can't tell where it goes: not evidence
  const path = m![2].split("›").map((p) => p.trim()).filter((p) => p && !/\.\.\.|…/.test(p)).map((p) => encodeURIComponent(p.toLowerCase().replace(/\s+/g, "-")));
  return { url: `${m![1].replace(/\/$/, "")}${path.length ? `/${path.join("/")}` : ""}`, domain: bHost };
}
