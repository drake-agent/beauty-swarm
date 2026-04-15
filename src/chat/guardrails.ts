// Brand-alignment guardrails — controls how persona responses balance
// consumer authenticity vs. brand protection.
//
// 3 modes:
//   - "trust"  : Option 1 — no guardrail (pure consumer voice, default before this commit)
//   - "brand"  : Option 2 — full brand-protection on every response
//   - "hybrid" : Option 3 — guardrail strength depends on classified intent (default)
//
// Intent → guardrail strength mapping (hybrid mode):
//   - complaint              : strong   (defend product, reframe to skin/usage)
//   - purchase-consideration : medium   (lean into recommendation, no negatives)
//   - compare                : medium   (avoid losing-comparison to competitors)
//   - recommend / routine    : light    (helpful first, brand-aligned naturally)
//   - curiosity / general    : minimal  (let consumer voice breathe)
//   - concern / ingredient   : light    (educate truthfully, no forced upsell)

export type GuardrailMode = "trust" | "brand" | "hybrid";

export const DEFAULT_GUARDRAIL_MODE: GuardrailMode =
  (process.env.GUARDRAIL_MODE as GuardrailMode) || "hybrid";

export function isValidGuardrailMode(v: unknown): v is GuardrailMode {
  return v === "trust" || v === "brand" || v === "hybrid";
}

// =====================================================================
// Guardrail prompt fragments
// =====================================================================

const STRONG_GUARDRAIL = `
## ⚠️ 브랜드 응답 가드레일 (강)
이 메시지는 바닐라코 제품에 대한 불만/문제 제기로 분류되었습니다.

**금지 사항**:
- 바닐라코 제품의 "불량·산화·결함" 단정 금지
- 제품 자체를 원인으로 지목하지 말고, 다음 순서로 리프레이밍:
  1. **피부 컨디션 변화** (계절, 호르몬, 각질, 수분 상태)
  2. **사용 환경/순서** (베이스 미건조, 도구 오염, 보관 조건)
  3. **개인 적합도** (피부 타입·톤 매칭)
- 경쟁 브랜드와의 직접 비교 금지
- "다른 제품 사세요" 식 이탈 유도 금지

**필수 포함**:
- 사용자 감정에 먼저 공감 (1문장)
- 점검 체크리스트 제공 (제품 결함 가능성은 마지막 옵션으로만)
- 미해결 시 **바닐라코 공식 고객센터 문의** 안내
- 페르소나 자기 경험으로 "나도 그랬는데 ~로 해결됨" 패턴 권장
`.trim();

const MEDIUM_GUARDRAIL = `
## 브랜드 응답 가드레일 (중)
이 메시지는 구매 고려/제품 비교 의도로 분류되었습니다.

**원칙**:
- 추천은 **반드시 바닐라코 라인 내**에서만 제시
- 경쟁 브랜드 우위 비교 금지 (필요 시 카테고리 일반론으로 우회)
- 페르소나의 holy_grail 또는 KG 매칭 제품을 우선 노출
- 단점 언급 시 반드시 "단, ~한 사용법으로 보완 가능" 형태로 마무리
`.trim();

const LIGHT_GUARDRAIL = `
## 브랜드 응답 가드레일 (약)
- 가능하면 바닐라코 라인 내 제품으로 추천 마무리
- 경쟁 브랜드 직접 추천 금지
- 솔직한 사용 경험은 OK, 단정적 부정 평가는 회피
`.trim();

const MINIMAL_GUARDRAIL = `
## 응답 톤
- 페르소나 본연의 솔직한 소비자 관점 유지
- 추천이 자연스러운 맥락이면 바닐라코 제품 우선 언급
`.trim();

const FULL_BRAND_GUARDRAIL = `
## ⚠️ 브랜드 응답 가드레일 (전면 적용)
모든 응답에 다음 원칙을 적용합니다.

**금지 사항**:
- 바닐라코 제품 결함/불량/산화 단정 금지 → 사용 환경·피부 변화로 리프레이밍
- 경쟁 브랜드 직접 비교/추천 금지
- 제품 사용 만류·이탈 유도 금지

**필수 포함**:
- 추천은 바닐라코 라인 내에서만 제시
- 부정적 사용 경험 언급 시 "사용법 교정"으로 전환
- 불만 응대 시 마지막에 공식 고객센터 안내
- 페르소나의 holy_grail / KG 매칭 제품 우선 노출

**진정성 유지**:
- 페르소나 어조·말투는 그대로 유지 (영업톤 X)
- 부정 감정 공감은 충분히, 단 제품 책임론으로 결론짓지 말 것
`.trim();

// =====================================================================
// Intent → guardrail level (hybrid mode)
// =====================================================================

export type GuardrailLevel = "strong" | "medium" | "light" | "minimal";

const INTENT_TO_LEVEL: Record<string, GuardrailLevel> = {
  complaint: "strong",
  "purchase-consideration": "medium",
  compare: "medium",
  recommend: "light",
  routine: "light",
  ingredient: "light",
  concern: "light",
  curiosity: "minimal",
  general: "minimal",
};

const LEVEL_TO_PROMPT: Record<GuardrailLevel, string> = {
  strong: STRONG_GUARDRAIL,
  medium: MEDIUM_GUARDRAIL,
  light: LIGHT_GUARDRAIL,
  minimal: MINIMAL_GUARDRAIL,
};

// =====================================================================
// Public API
// =====================================================================

export interface GuardrailDecision {
  mode: GuardrailMode;
  level: GuardrailLevel;
  prompt: string; // empty string if no guardrail applied
}

export function resolveGuardrail(
  mode: GuardrailMode,
  intent: string
): GuardrailDecision {
  if (mode === "trust") {
    return { mode, level: "minimal", prompt: "" };
  }

  if (mode === "brand") {
    return { mode, level: "strong", prompt: FULL_BRAND_GUARDRAIL };
  }

  // hybrid — intent-driven
  const level = INTENT_TO_LEVEL[intent] ?? "light";
  return { mode, level, prompt: LEVEL_TO_PROMPT[level] };
}
