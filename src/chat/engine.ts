import { KnowledgeGraph } from "../knowledge/graph.js";
import { PersonaRegistry } from "../persona/registry.js";
import { callLLM, type LLMMessage } from "../llm/client.js";
import { buildChatContext } from "./context-builder.js";
import { classifyIntent } from "./intent-classifier.js";
import { sessionStore, type UserContext } from "./session.js";
import { getUserByApiKey } from "../db/users.js";
import {
  resolveGuardrail,
  DEFAULT_GUARDRAIL_MODE,
  isValidGuardrailMode,
  type GuardrailMode,
  type GuardrailLevel,
} from "./guardrails.js";
import { validateResponse, type HumanizeIssue } from "./humanizer.js";

export interface ChatRequest {
  session_id?: string;
  persona_id: string;
  message: string;
  user_context?: UserContext;
  image_base64?: string;
  image_media_type?: string;
  guardrail_mode?: GuardrailMode; // overrides default per request (A/B testing)
  extra_system?: string; // appended to system prompt (e.g. platform tone for /compose)
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
  intent: string;
  guardrail: {
    mode: GuardrailMode;
    level: GuardrailLevel;
  };
  validation: {
    passed: boolean;
    issues: HumanizeIssue[];
  };
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

  async chat(request: ChatRequest, apiKey?: string): Promise<ChatResponse> {
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

    // [m11] Validate session-persona match
    if (session.personaId !== request.persona_id) {
      throw new Error(
        `Session ${session.id} belongs to persona "${session.personaId}", not "${request.persona_id}". Start a new session.`
      );
    }

    // LLM-based intent classification (hybrid: keyword fast path + LLM fallback)
    const classification = await classifyIntent(request.message);

    // Use classified concerns if KG keyword detection missed them
    const kgResult = this.graph.queryByMessage(
      request.message,
      persona.graph_strategy
    );

    // Merge: KG detected + LLM classified
    const allConcerns = new Set([
      ...kgResult.painPoints.map((pp) => pp.id),
      ...classification.concerns,
    ]);

    // Re-query if LLM found concerns that KG missed
    const queryResult =
      allConcerns.size > kgResult.painPoints.length
        ? this.graph.queryByPainPoints([...allConcerns], persona.graph_strategy)
        : kgResult;

    // Resolve guardrail (per-request override > env default)
    const mode: GuardrailMode = isValidGuardrailMode(request.guardrail_mode)
      ? request.guardrail_mode
      : DEFAULT_GUARDRAIL_MODE;
    const guardrail = resolveGuardrail(mode, classification.intent);

    // Build context
    let { systemPrompt, allowedProductNames } = buildChatContext(
      persona,
      request.message,
      this.graph,
      guardrail
    );

    // Append per-request extra system prompt (e.g. platform tone from /compose).
    // Placed AFTER humanize/guardrail so later instructions take precedence.
    if (request.extra_system) {
      systemPrompt += `\n\n${request.extra_system}`;
    }

    // Enrich first message with user context from DB or request
    let enrichedMessage = request.message;
    if (session.messages.length === 0) {
      const userCtx = request.user_context || (apiKey ? await this.loadUserContext(apiKey) : undefined);
      if (userCtx) {
        const parts: string[] = [];
        if (userCtx.skin_type) parts.push(`피부 타입: ${userCtx.skin_type}`);
        if (userCtx.age_group) parts.push(`연령대: ${userCtx.age_group}`);
        if (userCtx.concerns?.length)
          parts.push(`주요 고민: ${userCtx.concerns.join(", ")}`);
        if (parts.length > 0) {
          enrichedMessage = `[사용자 정보: ${parts.join(" | ")}]\n\n${request.message}`;
        }
      }
    }

    // Build message history
    const messages: LLMMessage[] = [
      ...session.messages,
      { role: "user", content: enrichedMessage },
    ];

    // Call LLM
    const response = await callLLM(systemPrompt, messages);

    // Post-generation validation — flag AI patterns + hallucinated products
    const validation = validateResponse(response.text, allowedProductNames);
    if (!validation.passed) {
      console.warn(
        `[validation] persona=${persona.id} issues=${validation.issues.length}`,
        validation.issues.map((i) => `${i.type}:${i.detail}`).join(", ")
      );
    }

    // Save enriched message (same as what LLM saw) for context continuity
    sessionStore.addMessage(session.id, {
      role: "user",
      content: enrichedMessage,
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
      detected_concerns: [...allConcerns],
      intent: classification.intent,
      guardrail: { mode: guardrail.mode, level: guardrail.level },
      validation,
      usage: response.usage,
    };
  }

  private async loadUserContext(apiKey: string): Promise<UserContext | undefined> {
    try {
      const user = await getUserByApiKey(apiKey);
      if (!user) return undefined;
      return {
        skin_type: user.skin_type || undefined,
        age_group: user.age_group || undefined,
        concerns: user.concerns.length > 0 ? user.concerns : undefined,
      };
    } catch {
      return undefined;
    }
  }
}
