import { readFileSync } from "fs";
import { join } from "path";
import { KnowledgeGraph } from "../knowledge/graph.js";
import { PersonaRegistry } from "../persona/registry.js";
import type { PersonaProfile } from "../persona/types.js";
import type { GraphQueryResult } from "../knowledge/types.js";
import { buildKnowledgeContext, buildSystemPrompt } from "../llm/prompts.js";

const GUIDELINES_PATH = join(
  import.meta.dir ?? new URL(".", import.meta.url).pathname,
  "..",
  "..",
  "guidelines",
  "banila_co_brand.md"
);

let brandGuidelines: string | null = null;

function loadBrandGuidelines(): string {
  if (!brandGuidelines) {
    try {
      const full = readFileSync(GUIDELINES_PATH, "utf-8");
      // Extract key sections to keep context manageable
      brandGuidelines = `## 바닐라코 브랜드 가이드라인 (요약)\n\n${full.slice(0, 3000)}`;
    } catch {
      brandGuidelines = "## 바닐라코 브랜드 가이드라인\n바닐라코는 'Zero to Glow' 철학을 가진 K-뷰티 브랜드입니다. 깨끗하고 전문적이며 따뜻한 브랜드 보이스를 유지하세요.";
    }
  }
  return brandGuidelines;
}

export interface ChatContext {
  systemPrompt: string;
  queryResult: GraphQueryResult;
}

export function buildChatContext(
  persona: PersonaProfile,
  userMessage: string,
  graph: KnowledgeGraph
): ChatContext {
  const queryResult = graph.queryByMessage(
    userMessage,
    persona.graph_strategy
  );

  const knowledgeContext = buildKnowledgeContext(queryResult);
  const guidelines = loadBrandGuidelines();

  const systemPrompt = buildSystemPrompt(
    persona.system_prompt_template,
    knowledgeContext,
    guidelines
  );

  return { systemPrompt, queryResult };
}
