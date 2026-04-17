import { KnowledgeGraph } from "../knowledge/graph.js";
import { PersonaRegistry } from "../persona/registry.js";
import { callLLM, callLLMParallel, type LLMMessage } from "../llm/client.js";
import { buildChatContext } from "./context-builder.js";
import { classifyIntent } from "./intent-classifier.js";
import { PANEL_MODERATOR_PROMPT } from "../llm/prompts.js";
import type { UserContext } from "./session.js";
import {
  resolveGuardrail,
  DEFAULT_GUARDRAIL_MODE,
  isValidGuardrailMode,
  type GuardrailMode,
  type GuardrailLevel,
} from "./guardrails.js";

export interface PanelRequest {
  persona_ids: string[];
  message: string;
  user_context?: UserContext;
  include_summary?: boolean; // [m12] defaults to false now
  guardrail_mode?: GuardrailMode;
}

export interface PanelMember {
  persona: {
    id: string;
    name: string;
    avatar: string;
    role: string;
  };
  message: string;
}

export interface PanelResponse {
  panel: PanelMember[];
  summary?: string;
  detected_concerns: string[];
  intent: string;
  guardrail: {
    mode: GuardrailMode;
    level: GuardrailLevel;
  };
  usage: {
    total_input_tokens: number;
    total_output_tokens: number;
  };
}

export class PanelEngine {
  constructor(
    private graph: KnowledgeGraph,
    private registry: PersonaRegistry
  ) {}

  async discuss(request: PanelRequest): Promise<PanelResponse> {
    if (request.persona_ids.length < 2 || request.persona_ids.length > 4) {
      throw new Error("Panel requires 2-4 personas");
    }

    const personas = request.persona_ids.map((id) => {
      const persona = this.registry.get(id);
      if (!persona) throw new Error(`Unknown persona: ${id}`);
      return persona;
    });

    // Build enriched message with user context
    let enrichedMessage = request.message;
    if (request.user_context) {
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

    // Resolve guardrail (per-request override > env default) — needs intent
    const classification = await classifyIntent(request.message);
    const mode: GuardrailMode = isValidGuardrailMode(request.guardrail_mode)
      ? request.guardrail_mode
      : DEFAULT_GUARDRAIL_MODE;
    const guardrail = resolveGuardrail(mode, classification.intent);

    // [BUG-6/STRUCT-5] Compute KG result once with LLM-classified concerns merged.
    const kgResult = this.graph.queryByMessage(request.message, personas[0].graph_strategy);
    const mergedConcerns = new Set([
      ...kgResult.painPoints.map((pp) => pp.id),
      ...classification.concerns,
    ]);
    const queryResult =
      mergedConcerns.size > kgResult.painPoints.length
        ? this.graph.queryByPainPoints([...mergedConcerns], personas[0].graph_strategy)
        : kgResult;
    // [BUG-11] Merge KG + LLM concerns (engine.ts already does this; /panel was
    // dropping LLM-only concerns from the response).
    const detectedConcerns = [...mergedConcerns];

    const calls = personas.map((persona) => {
      // Reuse the queryResult so we don't re-query per-persona.
      const { systemPrompt } = buildChatContext(persona, request.message, this.graph, guardrail, queryResult);
      return {
        systemPrompt:
          systemPrompt +
          "\n\n## 패널 토론 모드\n다른 전문가들과 함께 패널에 참여 중입니다. 당신의 전문 영역 관점에서 간결하게(3-5문장) 의견을 제시하세요. 다른 패널리스트와 겹치지 않는 고유한 관점을 강조하세요.",
        messages: [{ role: "user" as const, content: enrichedMessage }],
      };
    });

    // Parallel LLM calls (bounded by semaphore in client.ts)
    const responses = await callLLMParallel(calls);

    let totalInput = 0;
    let totalOutput = 0;

    const panel: PanelMember[] = personas.map((persona, i) => {
      totalInput += responses[i].usage.input_tokens;
      totalOutput += responses[i].usage.output_tokens;
      return {
        persona: {
          id: persona.id,
          name: persona.name,
          avatar: persona.avatar,
          role: persona.role,
        },
        message: responses[i].text,
      };
    });

    // [m12] Summary defaults to false — explicit opt-in
    let summary: string | undefined;
    if (request.include_summary === true) {
      const panelContent = panel
        .map((m) => `**${m.persona.name}** (${m.persona.role}):\n${m.message}`)
        .join("\n\n---\n\n");

      const summaryResponse = await callLLM(PANEL_MODERATOR_PROMPT, [
        {
          role: "user",
          content: `사용자 질문: ${request.message}\n\n## 전문가 의견\n\n${panelContent}\n\n위 전문가들의 의견을 종합해서 사용자에게 도움이 되는 요약을 2-3문장으로 작성해주세요.`,
        },
      ]);
      summary = summaryResponse.text;
      totalInput += summaryResponse.usage.input_tokens;
      totalOutput += summaryResponse.usage.output_tokens;
    }

    return {
      panel,
      summary,
      detected_concerns: detectedConcerns,
      intent: classification.intent,
      guardrail: { mode: guardrail.mode, level: guardrail.level },
      usage: {
        total_input_tokens: totalInput,
        total_output_tokens: totalOutput,
      },
    };
  }
}
