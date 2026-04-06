import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { KnowledgeGraph } from "../knowledge/graph.js";
import type { PersonaProfile } from "../persona/types.js";
import type { GraphQueryResult } from "../knowledge/types.js";
import { buildKnowledgeContext, buildSystemPrompt } from "../llm/prompts.js";

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
