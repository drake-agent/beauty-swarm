import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;
const TIMEOUT_MS = 60_000;
const MAX_CONCURRENT_LLM_CALLS = 6; // [M10] panel concurrency limit

// [M9] Singleton Anthropic client — shared across all modules
let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ timeout: TIMEOUT_MS });
  }
  return client;
}

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  text: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export async function callLLM(
  systemPrompt: string,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const anthropic = getAnthropicClient();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const text = textBlock && "text" in textBlock ? textBlock.text : "";

  return {
    text,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}

// [M10] Bounded parallel LLM calls with semaphore
let activeCalls = 0;
const waitQueue: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (activeCalls < MAX_CONCURRENT_LLM_CALLS) {
    activeCalls++;
    return;
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(() => { activeCalls++; resolve(); });
  });
}

function releaseSlot(): void {
  activeCalls--;
  const next = waitQueue.shift();
  if (next) next();
}

export async function callLLMParallel(
  calls: Array<{ systemPrompt: string; messages: LLMMessage[] }>
): Promise<LLMResponse[]> {
  return Promise.all(
    calls.map(async (call) => {
      await acquireSlot();
      try {
        return await callLLM(call.systemPrompt, call.messages);
      } finally {
        releaseSlot();
      }
    })
  );
}

// [C6] Runtime JSON validation helpers
export function parseLLMJson<T>(
  text: string,
  schema: z.ZodSchema<T>
): T {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object found in LLM response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Invalid JSON in LLM response");
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`LLM response validation failed: ${result.error.issues.map((i) => i.message).join(", ")}`);
  }

  return result.data;
}

// Reusable zod schemas
export const SkinAnalysisSchema = z.object({
  detected_concerns: z.array(z.string()),
  skin_type_estimate: z.string(),
  severity: z.string(),
  key_observations: z.array(z.string()),
  recommended_focus: z.string(),
});

export const ClassificationSchema = z.object({
  concerns: z.array(z.string()),
  intent: z.string(),
  confidence: z.number().min(0).max(1),
});
