import { KnowledgeGraph } from "../knowledge/graph.js";
import { PersonaRegistry } from "../persona/registry.js";
import { callLLM, type LLMMessage } from "../llm/client.js";
import { buildChatContext } from "./context-builder.js";
import { sessionStore, type UserContext } from "./session.js";

export interface ChatRequest {
  session_id?: string;
  persona_id: string;
  message: string;
  user_context?: UserContext;
}

export interface ChatResponse {
  session_id: string;
  persona: {
    id: string;
    name: string;
    avatar: string;
  };
  message: string;
  detected_concerns: string[];
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class ChatEngine {
  constructor(
    private graph: KnowledgeGraph,
    private registry: PersonaRegistry
  ) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const persona = this.registry.get(request.persona_id);
    if (!persona) {
      throw new Error(`Unknown persona: ${request.persona_id}`);
    }

    // Get or create session
    let session = request.session_id
      ? sessionStore.get(request.session_id)
      : undefined;

    if (!session) {
      session = sessionStore.create(request.persona_id, request.user_context);
    }

    // Build context from knowledge graph
    const { systemPrompt, queryResult } = buildChatContext(
      persona,
      request.message,
      this.graph
    );

    // Add user context to first message if available
    let enrichedMessage = request.message;
    if (request.user_context && session.messages.length === 0) {
      const ctx = request.user_context;
      const parts: string[] = [];
      if (ctx.skin_type) parts.push(`피부 타입: ${ctx.skin_type}`);
      if (ctx.age_group) parts.push(`연령대: ${ctx.age_group}`);
      if (ctx.concerns?.length)
        parts.push(`주요 고민: ${ctx.concerns.join(", ")}`);
      if (parts.length > 0) {
        enrichedMessage = `[사용자 정보: ${parts.join(" | ")}]\n\n${request.message}`;
      }
    }

    // Build message history
    const messages: LLMMessage[] = [
      ...session.messages,
      { role: "user", content: enrichedMessage },
    ];

    // Call LLM
    const response = await callLLM(systemPrompt, messages);

    // Save to session
    sessionStore.addMessage(session.id, {
      role: "user",
      content: request.message,
    });
    sessionStore.addMessage(session.id, {
      role: "assistant",
      content: response.text,
    });

    return {
      session_id: session.id,
      persona: {
        id: persona.id,
        name: persona.name,
        avatar: persona.avatar,
      },
      message: response.text,
      detected_concerns: queryResult.painPoints.map((pp) => pp.id),
      usage: response.usage,
    };
  }
}
