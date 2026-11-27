import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../../config/env.js";
import {
  AiError,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_INTERVIEW_MODEL,
  type AiProviderName,
} from "../openrouter.js";

const REQUEST_TIMEOUT_MS = 30_000;

let sharedClient: Anthropic | null = null;
export function anthropicClient(): Anthropic {
  sharedClient ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
  return sharedClient;
}

export type ResolvedQaProvider =
  | { kind: "anthropic"; client: Pick<Anthropic, "messages"> }
  | { kind: "chat"; provider: AiProviderName; apiKey: string; model: string };

/**
 * Picks the active platform provider for chapter Q&A and practice quizzes:
 * explicit test client / Anthropic first, then OpenRouter, then Gemini.
 */
export function resolveQaProvider(client?: Pick<Anthropic, "messages">): ResolvedQaProvider | null {
  if (client) return { kind: "anthropic", client };
  if (env.ANTHROPIC_API_KEY) return { kind: "anthropic", client: anthropicClient() };
  if (env.OPENROUTER_API_KEY) {
    return {
      kind: "chat",
      provider: "OPENROUTER",
      apiKey: env.OPENROUTER_API_KEY,
      model: env.LEARNER_QA_OPENROUTER_MODEL ?? env.OPENROUTER_REVIEW_MODEL ?? DEFAULT_INTERVIEW_MODEL,
    };
  }
  if (env.GEMINI_API_KEY) {
    return {
      kind: "chat",
      provider: "GEMINI",
      apiKey: env.GEMINI_API_KEY,
      model: env.LEARNER_QA_GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL,
    };
  }
  return null;
}

/** HTTP status of a provider failure, safe to log without leaking raw provider error text. */
export function upstreamErrorStatus(error: unknown): number | undefined {
  if (error instanceof Anthropic.APIError) return error.status;
  if (error instanceof AiError) return error.statusCode;
  return undefined;
}

