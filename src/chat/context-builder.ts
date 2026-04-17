import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { KnowledgeGraph } from "../knowledge/graph.js";
import type { PersonaProfile } from "../persona/types.js";
import type { GraphQueryResult } from "../knowledge/types.js";
import { buildKnowledgeContext, buildSystemPrompt } from "../llm/prompts.js";
import type { GuardrailDecision } from "./guardrails.js";
import { HUMANIZE_RULES, buildProductFidelityPrompt } from "./humanizer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const GUIDELINES_PATH = join(__dirname, "..", "..", "guidelines", "banila_co_brand.md");

let brandGuidelines: string | null = null;

// [m4] Truncate at paragraph boundary, not mid-sentence
function loadBrandGuidelines(): string {
  if (!brandGuidelines) {
    try {
      const full = readFileSync(GUIDELINES_PATH, "utf-8");
      // Find last complete section (## heading) within 4000 chars
      const maxLen = 4000;
      const truncated = full.slice(0, maxLen);
      const lastSection = truncated.lastIndexOf("\n## ");
      const cutPoint = lastSection > 1000 ? lastSection : truncated.lastIndexOf("\n\n");
      brandGuidelines = `## 바닐라코 브랜드 가이드라인 (요약)\n\n${full.slice(0, cutPoint > 0 ? cutPoint : maxLen)}`;
    } catch {
      brandGuidelines = "## 바닐라코 브랜드 가이드라인\n바닐라코는 'Zero to Glow' 철학을 가진 K-뷰티 브랜드입니다.";
    }
  }
  return brandGuidelines;
}

export interface ChatContext {
  systemPrompt: string;
  queryResult: GraphQueryResult;
  allowedProductNames: string[];
}

/**
 * [BUG-6/STRUCT-5] Optional `precomputedQueryResult` lets callers pass an
 * already-queried KG result (merged with LLM-classified concerns) so we don't
 * re-query here with a narrower keyword-only view. When omitted, we fall back
 * to the keyword query for convenience.
 */
export function buildChatContext(
  persona: PersonaProfile,
  userMessage: string,
  graph: KnowledgeGraph,
  guardrail?: GuardrailDecision,
  precomputedQueryResult?: GraphQueryResult
): ChatContext {
  const queryResult =
    precomputedQueryResult ??
    graph.queryByMessage(userMessage, persona.graph_strategy);

  const knowledgeContext = buildKnowledgeContext(queryResult);
  const guidelines = loadBrandGuidelines();
  const allowedProductNames = queryResult.products.map((p) => p.name);
  const productFidelity = buildProductFidelityPrompt(allowedProductNames);

  let systemPrompt = buildSystemPrompt(
    persona.system_prompt_template,
    knowledgeContext,
    guidelines
  );

  // Always-on layers: humanize + product fidelity (appended after persona template)
  systemPrompt += `\n\n${HUMANIZE_RULES}\n\n${productFidelity}`;

  // Append guardrail instructions (if any) — last so they take precedence
  if (guardrail && guardrail.prompt) {
    systemPrompt += `\n\n${guardrail.prompt}`;
  }

  return { systemPrompt, queryResult, allowedProductNames };
}
