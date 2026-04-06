import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6-20250514";
const MAX_TOKENS = 4096;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
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
  const anthropic = getClient();

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

export async function callLLMParallel(
  calls: Array<{ systemPrompt: string; messages: LLMMessage[] }>
): Promise<LLMResponse[]> {
  return Promise.all(
    calls.map((call) => callLLM(call.systemPrompt, call.messages))
  );
}
