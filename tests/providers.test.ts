import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DataForSeoProvider, parseResponse, SerpProviderError } from "@/lib/providers/dataforseo";
import { ClaudeClient } from "@/lib/providers/anthropic";
import { providersFor, stepModels } from "@/lib/providers";
import { AiError } from "@/lib/providers/types";
import { Recommendation } from "@/lib/pipeline/types";
import { providerCacheKey, serpCacheKey } from "@/lib/serp/cache";
import { MockSerpProvider } from "@/lib/providers/mock";
import { classifyPage, cleanTitle } from "@/lib/serp/reduce";
import { planQueries } from "@/lib/pipeline/queries";
import { emptyFacts } from "./helpers";

const fixture = JSON.parse(readFileSync("tests/fixtures/dataforseo-organic.json", "utf8"));

describe("DataForSEO (mocked HTTP; not run against the live API)", () => {
  it("reduces the payload: organic only, classified, snippets truncated", () => {
    const r = parseResponse("black midi dress", fixture);
    expect(r.results).toHaveLength(3);
    expect(r.results.map((x) => x.pageClass)).toEqual(["product", "category", "editorial"]);
    expect(r.costUsd).toBe(0.002);
    expect(r.results.every((x) => x.snippet.length <= 200)).toBe(true);
  });
  it("sends Basic auth and the Australia/English/desktop body", async () => {
    let seen: { headers: Record<string, string>; body: string } | undefined;
    const f = (async (_u: string, init: RequestInit) => { seen = { headers: init.headers as Record<string, string>, body: String(init.body) }; return new Response(JSON.stringify(fixture), { status: 200 }); }) as unknown as typeof fetch;
    await new DataForSeoProvider("login", "pw", f).search({ query: "black midi dress", location: "Australia", language: "English", device: "desktop", depth: 10 });
    expect(seen!.headers.Authorization).toBe("Basic " + Buffer.from("login:pw").toString("base64"));
    expect(JSON.parse(seen!.body)[0]).toMatchObject({ keyword: "black midi dress", location_name: "Australia", language_name: "English", device: "desktop" });
  });
  it("does not retry bad credentials; retries a 500 then succeeds", async () => {
    let n = 0;
    const bad = (async () => { n++; return new Response("no", { status: 401 }); }) as unknown as typeof fetch;
    await expect(new DataForSeoProvider("a", "b", bad).search({ query: "q", location: "l", language: "e", device: "d", depth: 10 })).rejects.toBeInstanceOf(SerpProviderError);
    expect(n).toBe(1);
    let m = 0;
    const flaky = (async () => (++m < 2 ? new Response("x", { status: 503 }) : new Response(JSON.stringify(fixture), { status: 200 }))) as unknown as typeof fetch;
    const r = await new DataForSeoProvider("a", "b", flaky).search({ query: "q", location: "l", language: "e", device: "d", depth: 10 });
    expect(m).toBe(2);
    expect(r.results.length).toBe(3);
  }, 15_000);

  // Seen in the 16 Nov quality test: 8 of about 100 searches failed once with this, which held those names at Medium.
  it("retries DataForSEO's own server error, but not a bad request; no results is an answer, not a failure", async () => {
    const task = (status_code: number, status_message: string) => new Response(JSON.stringify({ status_code: 20000, tasks: [{ status_code, status_message, cost: 0, result: null }] }), { status: 200 });
    const q = { query: "q", location: "l", language: "e", device: "d", depth: 10 };
    let a = 0;
    const seError = (async () => (++a < 2 ? task(50000, "Internal SE Server Error.") : new Response(JSON.stringify(fixture), { status: 200 }))) as unknown as typeof fetch;
    expect((await new DataForSeoProvider("a", "b", seError).search(q)).results.length).toBe(3);
    expect(a).toBe(2);
    let b = 0;
    const badField = (async () => { b++; return task(40501, "Invalid Field: 'keyword'."); }) as unknown as typeof fetch;
    await expect(new DataForSeoProvider("a", "b", badField).search(q)).rejects.toBeInstanceOf(SerpProviderError);
    expect(b).toBe(1);
    const none = (async () => task(40102, "No Search Results.")) as unknown as typeof fetch;
    expect((await new DataForSeoProvider("a", "b", none).search(q)).results).toEqual([]);
  }, 15_000);
});

describe("Claude client (mocked SDK)", () => {
  const rec = { recommended_title: "Black Midi Dress", confidence: "high", primary_keyword: null, supporting_keywords: [], title_structure: [], alternatives: [], reason: "r", warnings: [], evidence_keyword_ids: [], evidence_serp_result_ids: [] };
  const fake = (res: object) => new ClaudeClient("k", "any-model", { beta: { messages: { parse: async () => res } } } as never);
  it("returns parsed output and token usage", async () => {
    const out = await fake({ stop_reason: "end_turn", parsed_output: rec, usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 900 } }).json("sys", "user", Recommendation);
    expect(out.data.recommended_title).toBe("Black Midi Dress");
    expect(out.usage).toMatchObject({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 900, cacheWriteTokens: 0 });
  });
  it("asks for structured output with an explicit effort, and opts into refusal fallbacks on models that support them", async () => {
    let sent: Record<string, unknown> = {};
    const capture = (model: string) => new ClaudeClient("k", model, { beta: { messages: { parse: async (p: Record<string, unknown>) => { sent = p; return { stop_reason: "end_turn", parsed_output: rec, usage: { input_tokens: 1, output_tokens: 1 } }; } } } } as never);
    await capture("claude-opus-5-5").json("s", "u", Recommendation, "low");
    expect(sent).toMatchObject({ model: "claude-opus-5-5", max_tokens: 16000, fallbacks: "default", betas: ["server-side-fallback-2026-07-01"], output_config: { effort: "low" } });
    await capture("claude-haiku-4-5").json("s", "u", Recommendation);
    expect(sent).not.toHaveProperty("fallbacks");
  });
  it("maps refusal and unparseable output to typed errors", async () => {
    await expect(fake({ stop_reason: "refusal", usage: { input_tokens: 1, output_tokens: 1 } }).json("s", "u", Recommendation)).rejects.toMatchObject({ code: "ai_refusal" });
    await expect(fake({ stop_reason: "end_turn", parsed_output: null, usage: { input_tokens: 1, output_tokens: 1 } }).json("s", "u", Recommendation)).rejects.toBeInstanceOf(AiError);
  });
});

describe("which model each step uses", () => {
  const base = { ANTHROPIC_MODEL: "claude-opus-5-5", ANTHROPIC_MODEL_READ: undefined, ANTHROPIC_MODEL_WRITE: undefined, ANTHROPIC_MODEL_PHOTO: undefined, ANTHROPIC_MODEL_CONTENT: undefined, ANTHROPIC_MODEL_SHEET: undefined };
  it("runs every step on the main model unless told otherwise", () => {
    expect(stepModels(base)).toEqual({ read: "claude-opus-5-5", write: "claude-opus-5-5", photo: "claude-opus-5-5", content: "claude-opus-5-5", sheet: "claude-opus-5-5" });
  });
  it("setup A: typed details on the small model; names and photos stay on the main one", () => {
    expect(stepModels({ ...base, ANTHROPIC_MODEL_READ: "claude-haiku-5-5" })).toEqual({ read: "claude-haiku-5-5", write: "claude-opus-5-5", photo: "claude-opus-5-5", content: "claude-opus-5-5", sheet: "claude-opus-5-5" });
    const p = providersFor({ PROVIDER_MODE: "live", ANTHROPIC_API_KEY: "k", DATAFORSEO_LOGIN: "l", DATAFORSEO_PASSWORD: "p", ...base, ANTHROPIC_MODEL_READ: "claude-haiku-5-5" } as never);
    expect(p.modelName).toBe("claude-haiku-5-5 + claude-opus-5-5");
  });
});

describe("serp helpers", () => {
  it("builds equal cache keys for equivalent queries", () => {
    const s = { location: "Australia", language: "English", device: "desktop", depth: 10 };
    expect(serpCacheKey("  Black  MIDI dress ", s)).toBe(serpCacheKey("black midi dress", s));
    expect(serpCacheKey("black midi dress", { ...s, device: "mobile" })).not.toBe(serpCacheKey("black midi dress", s));
  });
  it("never lets example (mock) results be served as real Google results", () => {
    const s = { location: "Australia", language: "English", device: "desktop", depth: 10 };
    const live = new DataForSeoProvider("a", "b");
    expect(providerCacheKey(new MockSerpProvider(), "black midi dress", s)).not.toBe(providerCacheKey(live, "black midi dress", s));
    expect(providerCacheKey(live, "black midi dress", s)).toBe(`live2:${serpCacheKey("black midi dress", s)}`); // empty results cached before the Nov 2026 fix are never reused
  });
  it("drops Google's own pages from the results", () => {
    const withGoogle = structuredClone(fixture);
    withGoogle.tasks[0].result[0].items.push({ type: "organic", rank_group: 9, domain: "google.com", title: "Shop Ruched Detail Maxi Dress", url: "https://www.google.com/search?q=x" });
    expect(parseResponse("q", withGoogle).results.map((r) => r.domain)).not.toContain("google.com");
  });

  it("reads the real shop from the breadcrumb when Google wraps the link (google.com/goto)", () => {
    const wrapped = { status_code: 20000, tasks: [{ status_code: 20000, cost: 0.002, result: [{ items: [
      { type: "organic", rank_group: 1, domain: "google.com", title: "Lace Tops - Princess Polly", url: "https://google.com/goto?url=CAES123", breadcrumb: "https://www.princesspolly.com.au › collections › lace-tops" },
      { type: "organic", rank_group: 2, domain: "google.com", title: "Black Lace Top Full Sleeves", url: "https://google.com/goto?url=CAES456", breadcrumb: "https://www.revolveclothing.com.au › black-lace-top-fu..." },
      { type: "organic", rank_group: 3, domain: "google.com", title: "Mystery", url: "https://google.com/goto?url=CAES789" },
    ] }] }] };
    const r = parseResponse("black lace top", wrapped).results;
    expect(r.map((x) => x.domain)).toEqual(["www.princesspolly.com.au", "www.revolveclothing.com.au"]); // no breadcrumb: dropped
    expect(r[0].url).toBe("https://www.princesspolly.com.au/collections/lace-tops");
    expect(r[1].url).toBe("https://www.revolveclothing.com.au"); // a cut-off path segment is left out, not guessed
  });
  it("classifies pages and strips site names", () => {
    expect(classifyPage("https://x.com/p/1", "Black Dress", "x.com")).toBe("product");
    expect(classifyPage("https://www.amazon.com.au/dp/1", "Black Dress", "amazon.com.au")).toBe("marketplace");
    expect(classifyPage("https://m.com/blog/x", "Best dresses", "m.com")).toBe("editorial");
    expect(cleanTitle("Black Midi Dress | The Iconic")).toBe("Black Midi Dress");
  });
});

describe("query planning", () => {
  const kw = (k: string, v = 100) => ({ id: "K", keyword: k, searchVolume: v, category: "Dresses", score: 1, flags: [] });
  const order = { keywordOrder: ["black", "midi"], serpOrder: null, final: ["black", "midi"], suggestedTitle: "Black Midi Dress" };
  const facts = { ...emptyFacts, product_type: "dress", colour: ["black"], length: ["midi"] };
  it("caps at max, stays distinct and short", () => {
    const q = planQueries(facts, [kw("black midi dress"), kw("black midi dresses"), kw("midi dress")], order, 3);
    expect(q.length).toBeLessThanOrEqual(3);
    expect(new Set(q.map((x) => x.query)).size).toBe(q.length);
    expect(q.every((x) => x.query.split(" ").length <= 6 && x.reason.length > 0)).toBe(true);
    expect(planQueries(facts, [kw("black midi dress")], order, 0)).toEqual([]);
    expect(planQueries(facts, [kw("black midi dress")], order, 1)).toHaveLength(1);
  });

  it("leads the Google searches with who it's for and what it's made for", () => {
    const kids = { ...emptyFacts, product_type: "dress", colour: ["burgundy"], fit_or_silhouette: ["a-line"], features: ["white contrast trim", "half zip"], occasion_or_style: ["tennis"], audience: "girls" };
    const kidsOrder = { keywordOrder: [], serpOrder: null, final: ["burgundy", "white contrast trim", "a-line", "half zip", "tennis"], suggestedTitle: "" };
    const q = planQueries(kids, [], kidsOrder, 3).map((x) => x.query);
    expect(q[0]).toMatch(/^girls burgundy .*tennis dress$/);
    expect(q[0].split(" ").length).toBeLessThanOrEqual(6); // a long detail that doesn't fit is skipped, not truncated
    expect(q).toContain("girls tennis dress");
    // No audience or sport: the same searches as before.
    expect(planQueries(facts, [], order, 3).map((x) => x.query)).toEqual(["black midi dress", "black dress"]);
    // Women's is the default, so it doesn't lead the searches.
    const pant = { ...emptyFacts, product_type: "pant", material: ["linen blend"], pattern: ["stripe"], audience: "women" };
    const pantOrder = { keywordOrder: [], serpOrder: null, final: ["linen blend", "stripe"], suggestedTitle: "" };
    expect(planQueries(pant, [], pantOrder, 3).map((x) => x.query)[0]).toBe("linen blend stripe pant");
  });

  it("keeps fabric percentages out of searches, but not the fibre or a decade style", () => {
    const pant = { ...emptyFacts, product_type: "pant", material: ["linen blend", "73% viscose"], pattern: ["stripe"] };
    const pantOrder = { keywordOrder: [], serpOrder: null, final: ["linen blend", "73% viscose", "stripe"], suggestedTitle: "" };
    expect(planQueries(pant, [], pantOrder, 3).map((x) => x.query)).toEqual(["linen blend viscose stripe pant", "linen blend pant"]);
    const tee = { ...emptyFacts, product_type: "tee", material: ["100% cotton"], occasion_or_style: ["90s"] };
    const teeOrder = { keywordOrder: [], serpOrder: null, final: ["90s", "100% cotton"], suggestedTitle: "" };
    expect(planQueries(tee, [], teeOrder, 3)[0].query).toBe("90s cotton tee");
  });

  it("only says 'the order shoppers search them' when matching keywords back it", () => {
    expect(planQueries(facts, [], order, 3)[0].reason).not.toMatch(/shoppers/i);
    expect(planQueries(facts, [kw("midi dress")], order, 3).map((q) => q.reason).join()).toMatch(/order shoppers search/);
  });
});
