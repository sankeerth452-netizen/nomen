import { env } from "../env";
import { ClaudeClient, ClaudeFactExtractor, ClaudePhotoReader, ClaudeRecommender } from "./anthropic";
import { DataForSeoProvider } from "./dataforseo";
import { MockFactExtractor, MockPhotoReader, MockRecommender, MockSerpProvider } from "./mock";
import type { FactExtractor, PhotoReader, Recommender, SerpProvider } from "./types";

export type Providers = { extractor: FactExtractor; recommender: Recommender; serp: SerpProvider; photo: PhotoReader; modelName: string };

let cached: Providers | undefined;
export function getProviders(): Providers {
  if (cached) return cached;
  const e = env();
  if (e.PROVIDER_MODE === "mock") {
    cached = { extractor: new MockFactExtractor(), recommender: new MockRecommender(), serp: new MockSerpProvider(), photo: new MockPhotoReader(), modelName: "mock" };
  } else {
    const claude = new ClaudeClient(e.ANTHROPIC_API_KEY!, e.ANTHROPIC_MODEL!);
    cached = { extractor: new ClaudeFactExtractor(claude), recommender: new ClaudeRecommender(claude), serp: new DataForSeoProvider(e.DATAFORSEO_LOGIN!, e.DATAFORSEO_PASSWORD!), photo: new ClaudePhotoReader(claude), modelName: e.ANTHROPIC_MODEL! };
  }
  return cached;
}
