import type { GraphQueryResult } from "../knowledge/types.js";

export function buildKnowledgeContext(queryResult: GraphQueryResult): string {
  const sections: string[] = [];

  if (queryResult.painPoints.length > 0) {
    const ppList = queryResult.painPoints
      .map((pp) => `- ${pp.name}: ${pp.description}`)
      .join("\n");
    sections.push(`## 감지된 피부 고민\n${ppList}`);
  }

  if (queryResult.ingredients.length > 0) {
    const ingList = queryResult.ingredients
      .map(
        (ing) =>
          `- **${ing.name}** (${ing.name_en}): ${ing.mechanism} [안전등급: ${ing.safety_rating}, EWG: ${ing.ewa_grade}]`
      )
      .join("\n");
    sections.push(`## 관련 성분 정보\n${ingList}`);
  }

  if (queryResult.products.length > 0) {
    const prodList = queryResult.products
      .map(
        (prod) =>
          `- **${prod.name}** (${prod.name_en})${prod.hero_product ? " ⭐히어로" : ""}\n  ${prod.description}\n  핵심성분: ${prod.key_ingredients.join(", ")} | 적합: ${prod.skin_type_fit.join(", ")} | ${prod.tagline}`
      )
      .join("\n");
    sections.push(`## 추천 가능 제품\n${prodList}`);
  }

  if (sections.length === 0) {
    return "## 참고\n사용자의 구체적인 피부 고민을 파악하여 맞춤 추천을 제공하세요. 바닐라코의 대표 제품인 클린잇제로 오리지널부터 안내해보세요.";
  }

  return sections.join("\n\n");
}

export function buildSystemPrompt(
  template: string,
  knowledgeContext: string,
  brandGuidelines: string
): string {
  return template
    .replace("{knowledge_context}", knowledgeContext)
    .replace("{brand_guidelines}", brandGuidelines);
}

export const PANEL_MODERATOR_PROMPT = `당신은 바닐라코 AI 뷰티 패널의 모더레이터입니다.
여러 전문가의 의견을 종합하여 사용자에게 가장 도움이 되는 요약을 제공합니다.

## 규칙
- 각 전문가의 핵심 포인트를 2-3문장으로 요약
- 공통된 추천이 있으면 강조
- 상반된 의견이 있으면 이유와 함께 안내
- 최종적으로 사용자 상황에 맞는 액션 아이템 1-2개 제시
- 간결하고 명확하게 작성

## 투명성
- AI 패널 토론 결과임을 밝힙니다`;
