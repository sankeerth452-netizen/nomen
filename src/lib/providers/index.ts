import { env, type Env } from "../env";
import { ClaudeClient, ClaudeContentWriter, ClaudeFactExtractor, ClaudePhotoReader, ClaudeRecommender } from "./anthropic";
import { DataForSeoProvider } from "./dataforseo";
import { MockContentWriter, MockFactExtractor, MockPhotoReader, MockRecommender, MockSerpProvider } from "./mock";
import type { ContentWriter, FactExtractor, PhotoReader, Recommender, SerpProvider } from "./types";

export type Providers = { extractor: FactExtractor; recommender: Recommender; serp: SerpProvider; photo: PhotoReader; content: ContentWriter; modelName: string };

let cached: Providers | undefined;
export function getProviders(): Providers {
  return (cached ??= providersFor(env()));
}

/** The models each step runs on: reading typed details, writing the name, reading a photo, writing the product page. Each defaults to ANTHROPIC_MODEL. */
export function stepModels(e: Pick<Env, "ANTHROPIC_MODEL" | "ANTHROPIC_MODEL_READ" | "ANTHROPIC_MODEL_WRITE" | "ANTHROPIC_MODEL_PHOTO" | "ANTHROPIC_MODEL_CONTENT">) {
  const main = e.ANTHROPIC_MODEL!;
  return { read: e.ANTHROPIC_MODEL_READ ?? main, write: e.ANTHROPIC_MODEL_WRITE ?? main, photo: e.ANTHROPIC_MODEL_PHOTO ?? main, content: e.ANTHROPIC_MODEL_CONTENT ?? main };
}

export function providersFor(e: Env): Providers {
  if (e.PROVIDER_MODE === "mock") {
    return { extractor: new MockFactExtractor(), recommender: new MockRecommender(), serp: new MockSerpProvider(), photo: new MockPhotoReader(), content: new MockContentWriter(), modelName: "mock" };
  }
  const m = stepModels(e);
  const clients = new Map<string, ClaudeClient>(); // one client per distinct model
  const client = (model: string) => clients.get(model) ?? clients.set(model, new ClaudeClient(e.ANTHROPIC_API_KEY!, model)).get(model)!;
  return {
    extractor: new ClaudeFactExtractor(client(m.read)), recommender: new ClaudeRecommender(client(m.write)), photo: new ClaudePhotoReader(client(m.photo)),
    content: new ClaudeContentWriter(client(m.content)),
    serp: new DataForSeoProvider(e.DATAFORSEO_LOGIN!, e.DATAFORSEO_PASSWORD!),
    modelName: m.read === m.write ? m.write : `${m.read} + ${m.write}`, // what named it: details reader + name writer
  };
}
