import { writeFileSync } from "fs";
import { join } from "path";
import { stringify } from "yaml";
import { callLLM } from "../llm/client.js";
import { KnowledgeGraph } from "../knowledge/graph.js";
import { buildKnowledgeContext } from "../llm/prompts.js";
import type { PersonaProfile } from "./types.js";
import type { GraphStrategy } from "../knowledge/types.js";

const PROFILES_DIR = join(
  import.meta.dir ?? new URL(".", import.meta.url).pathname,
  "profiles"
);

const GENERATION_PROMPT = `당신은 바닐라코 멀티 페르소나 챗봇의 페르소나 설계자입니다.
주어진 피부 고민을 기반으로 "그 고민을 실제로 겪고 해결해본 소비자" 페르소나를 생성합니다.

## 규칙
- 페르소나는 전문가가 아니라 **실제 소비자** 관점
- 구체적인 나이, 피부 타입, 직업/상황 설정
- 실패한 제품/방법과 성공한 제품/방법이 모두 있어야 함
- 반드시 바닐라코 제품 중 하나가 "인생템(holy_grail)"이어야 함
- 현실적이고 공감가능한 이야기 (과장 금지)
- 각 페르소나마다 고유한 말투와 캐릭터성
- turning_point가 명확해야 함

## 출력 형식
반드시 아래 JSON 형식으로 출력하세요. JSON만 출력하고 다른 텍스트는 넣지 마세요.

{
  "id": "kebab-case-id",
  "name": "한글 닉네임 (2-4자)",
  "role": "한 줄 역할 설명",
  "avatar": "이모지 1개",
  "backstory": {
    "age": "나이+성별",
    "skin_type": "피부 타입",
    "main_concern": "핵심 고민",
    "journey": "3-5줄의 피부 고민 여정 이야기",
    "turning_point": "전환점 한 문장",
    "current_routine": ["루틴 1", "루틴 2", "루틴 3", "루틴 4"],
    "failed_products": ["실패 1", "실패 2", "실패 3"],
    "holy_grail": "바닐라코 인생템과 이유"
  },
  "expertise": ["keyword1", "keyword2", "keyword3"],
  "style": {
    "tone": "톤 설명",
    "formality": "low|medium|high",
    "emoji_use": "none|minimal|moderate|heavy",
    "response_length": "concise|moderate|detailed",
    "catchphrase": "입버릇/캐치프레이즈"
  },
  "recommendation_bias": {
    "priority": ["우선순위1", "우선순위2"],
    "avoids": ["피하는것1", "피하는것2"]
  },
  "graph_strategy": "ingredient-first|experience-first|minimal-routine|cost-effective|safety-first",
  "pain_point_affinity": ["pain-point-id-1", "pain-point-id-2", "pain-point-id-3"]
}`;

const SYSTEM_PROMPT_TEMPLATE = `당신은 {name} — {backstory_summary} AI 캐릭터입니다.

## 당신의 이야기
{journey}

## 대화 스타일
- 같은 고민을 가진 친구에게 이야기하듯 편하게
- "나도 그랬어", "이거 해봤는데" 같은 경험 기반 표현
- 과장 없이 솔직하게 — 안 좋았던 것도 솔직히 말함
- 입버릇: "{catchphrase}"

## 추천 방식
- 자기가 써보고 실패한 것 vs 성공한 것 비교
- 구체적 사용법과 현실적 기대치 설정
- 자기 루틴 공유하며 자연스럽게 제품 추천

## 투명성
- 첫 응답에서 "바닐라코 AI 뷰티 캐릭터 {name}에요!"라고 밝힙니다
- AI 캐릭터의 경험담임을 자연스럽게 인지시킵니다

{knowledge_context}

{brand_guidelines}`;

export interface GeneratePersonaRequest {
  pain_points: string[];
  age_group?: string;
  skin_type?: string;
  additional_context?: string;
}

export async function generatePersona(
  request: GeneratePersonaRequest,
  graph: KnowledgeGraph
): Promise<PersonaProfile> {
  // Get knowledge context for the pain points
  const queryResult = graph.queryByPainPoints(request.pain_points);
  const knowledgeContext = buildKnowledgeContext(queryResult);

  // Build generation prompt
  const userPrompt = buildGenerationPrompt(request, knowledgeContext);

  // Call LLM to generate persona
  const response = await callLLM(GENERATION_PROMPT, [
    { role: "user", content: userPrompt },
  ]);

  // Parse JSON from response
  const jsonMatch = response.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to generate persona: invalid JSON response");
  }

  const generated = JSON.parse(jsonMatch[0]);

  // Build system prompt template
  const systemPromptTemplate = SYSTEM_PROMPT_TEMPLATE
    .replace(/{name}/g, generated.name)
    .replace("{backstory_summary}", `${generated.backstory.main_concern}을 겪고 해결한 ${generated.backstory.age}`)
    .replace("{journey}", generated.backstory.journey)
    .replace("{catchphrase}", generated.style.catchphrase);

  const profile: PersonaProfile = {
    ...generated,
    system_prompt_template: systemPromptTemplate,
  };

  return profile;
}

export async function generateAndSavePersona(
  request: GeneratePersonaRequest,
  graph: KnowledgeGraph
): Promise<PersonaProfile> {
  const profile = await generatePersona(request, graph);

  // Sanitize ID to prevent path traversal
  const safeId = profile.id.replace(/[^a-z0-9-]/g, "").slice(0, 64);
  if (!safeId || safeId !== profile.id) {
    profile.id = safeId || `persona-${Date.now()}`;
  }

  // Save as YAML
  const yamlContent = stringify(profile);
  const filePath = join(PROFILES_DIR, `${profile.id}.yaml`);
  writeFileSync(filePath, yamlContent, "utf-8");

  return profile;
}

function buildGenerationPrompt(
  request: GeneratePersonaRequest,
  knowledgeContext: string
): string {
  const parts: string[] = [];

  parts.push(`## 생성할 페르소나의 핵심 피부 고민: ${request.pain_points.join(", ")}`);

  if (request.age_group) {
    parts.push(`희망 연령대: ${request.age_group}`);
  }
  if (request.skin_type) {
    parts.push(`피부 타입: ${request.skin_type}`);
  }
  if (request.additional_context) {
    parts.push(`추가 컨텍스트: ${request.additional_context}`);
  }

  parts.push(`\n## 참고할 제품/성분 정보\n${knowledgeContext}`);

  parts.push(`\n위 고민을 실제로 겪고 해결해본 소비자 페르소나를 JSON으로 생성해주세요.`);

  return parts.join("\n");
}
