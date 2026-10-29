import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { EXTRACTION_SYSTEM, RECOMMEND_SYSTEM } from "../prompts";
import { ExtractedFacts, Recommendation } from "../pipeline/types";
import { AiError, type AiUsage, type FactExtractor, type ProductFacts, type Recommender } from "./types";

/** Models that accept server-side refusal fallbacks in the "default" form on the Claude API. */
const FALLBACK_DEFAULT = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

type Effort = "low" | "medium" | "high";

/**
 * Claude via the Messages API with structured outputs. The model name comes from ANTHROPIC_MODEL (never hard-coded).
 * Current models reject temperature/prefill and forced tool use, so we send none of them: JSON shape is enforced by
 * output_config.format. Thinking is always on for Opus 5.5 and counts toward max_tokens, so the ceiling is generous
 * (only tokens actually used are billed) and effort is set per call. If the model declines a request, the server
 * re-runs it on Anthropic's recommended fallback (fallbacks: "default") instead of failing.
 */
export class ClaudeClient {
  private client: Anthropic;
  constructor(apiKey: string, public model: string, client?: Anthropic) {
    this.client = client ?? new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
  }

  async json<T extends z.ZodType>(system: string, user: string, schema: T, effort: Effort = "medium", maxTokens = 16000): Promise<{ data: z.infer<T>; usage: AiUsage }> {
    try {
      const fallback = FALLBACK_DEFAULT.has(this.model);
      const res = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
        output_config: { format: betaZodOutputFormat(schema), effort },
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
      const usage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
      if (res.stop_reason === "refusal") throw new AiError("The model declined this request", "ai_refusal");
      if (res.stop_reason === "max_tokens") throw new AiError("Model output was cut off", "ai_invalid");
      if (!res.parsed_output) throw new AiError("Model returned unreadable output", "ai_invalid");
      return { data: res.parsed_output as z.infer<T>, usage };
    } catch (e) {
      if (e instanceof AiError) throw e;
      if (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.NotFoundError) {
        throw new AiError(`Anthropic rejected the request (${e.status}): ${e.message}`, "ai_invalid");
      }
      throw new AiError(e instanceof Error ? e.message : "Anthropic unavailable", "ai_unavailable");
    }
  }
}

export class ClaudeFactExtractor implements FactExtractor {
  constructor(private c: ClaudeClient) {}
  async extract(input: { freeText: string; fields: Record<string, string | undefined> }) {
    const user = JSON.stringify({ buyer_request: input.freeText, fields: Object.fromEntries(Object.entries(input.fields).filter(([, v]) => v)) });
    const { data, usage } = await this.c.json(EXTRACTION_SYSTEM, user, ExtractedFacts, "low"); // reading facts: simple
    return { facts: data as ProductFacts, usage };
  }
}

export class ClaudeRecommender implements Recommender {
  constructor(private c: ClaudeClient) {}
  async recommend(payload: Record<string, unknown>, repair?: { errors: string[]; previous: unknown }) {
    const user = JSON.stringify(repair ? { ...payload, repair: { your_previous_answer: repair.previous, validation_errors: repair.errors, instruction: "Fix every validation error. Change nothing else." } } : payload);
    const { data, usage } = await this.c.json(RECOMMEND_SYSTEM, user, Recommendation, "medium");
    return { recommendation: data, usage };
  }
}
