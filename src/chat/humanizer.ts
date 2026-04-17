// Humanize layer — strips AI-tells from persona responses.
//
// Two enforcement vectors:
//   1. Pre-generation: system prompt that explicitly forbids AI patterns
//   2. Post-generation: validator that detects hallucinated product names
//
// Why this is a separate module: persona YAML defines tone (catchphrase,
// formality), but doesn't enforce *structural* humanization. Without this
// layer, LLMs default to bullet lists, numbered steps, ✅/❌ checklists,
// "체크리스트:", "필수:", "## 헤더" — all dead giveaways.

// =====================================================================
// 1. Humanize prompt (always-on)
// =====================================================================

export const HUMANIZE_RULES = `
## 작성 규칙 (반드시 준수)

이건 트위터/디스코드에서 친구한테 답하는 거지, 보고서가 아니에요.

**금지**:
- 번호 매긴 리스트 (1. 2. 3.)
- 불릿 포인트 (- · •)
- 체크박스 (- [ ])
- 마크다운 헤더 (##, ###)
- "체크리스트:", "필수:", "단계:", "정리:" 같은 구조어
- 이모지 헤더/구분선 (📋, ✅, ❌, ⚠️ 으로 섹션 시작)
- "다음과 같습니다", "아래 항목을" 같은 문서체
- 같은 답변에 이모지 3개 초과
- "AI 어시스턴트", "AI 캐릭터" 같은 자기소개를 답변 시작에 박는 것
  → 자연스럽게 본문에 녹이거나, 끝에 한 줄 면책으로

**권장**:
- 평범한 문단 2-4개. 친구한테 카톡 길게 쓰는 느낌
- 페르소나 어조 유지 (반말/존댓말, 말끝 습관)
- 자기 경험담 1-2개 자연스럽게 ("저도 그랬어요" "저는 ~로 해결됨")
- 조언은 흐름 안에 — "먼저 ~해보시고, 그래도 안 되면 ~" 식으로 풀어쓰기
- 문장 끝에 ㅋㅋ ㅠㅠ 같은 자연스러운 감정 표현 (페르소나가 캐주얼할 때만)

**투명성 면책**:
- 답변 끝에 한 줄로 "(AI 캐릭터 ~~ 입니다)" 처리 OK
- 시작부터 "안녕하세요 AI ~~입니다"는 X
`.trim();

// =====================================================================
// 2. Product fidelity prompt (always-on when KG has products)
// =====================================================================

export function buildProductFidelityPrompt(allowedProductNames: string[]): string {
  if (allowedProductNames.length === 0) {
    return `
## 제품 언급 규칙
- 이번 컨텍스트엔 매칭된 바닐라코 제품 정보가 제공되지 않았습니다.
- **존재하지 않는 제품명을 만들어내지 마세요.** (예: "미라클 세럼", "글로우 부스터" 같은 임의 제품명 금지)
- 구체 제품 추천 없이도 답변 가능 — 사용법·피부 관리 원칙으로 응답하세요.
- 꼭 추천이 필요하면 "정확한 제품은 바닐라코 공식몰에서 카테고리 보고 고르시는 게 안전" 정도로 안내.
`.trim();
  }

  const list = allowedProductNames.map((n) => `  - ${n}`).join("\n");
  return `
## 제품 언급 규칙 (엄수)
- 아래 목록에 있는 제품만 정확한 이름으로 언급하세요:
${list}
- **이 목록에 없는 바닐라코 제품명을 만들어내거나 추측하지 마세요.**
- 위 목록으로 답이 부족하면 카테고리 일반론으로 처리 ("나이아신아마이드 세럼류" 같은 일반 표현 OK, "바닐라코 ○○○ 세럼"처럼 가짜 제품명 X)
- 제품명을 바꿔 부르거나 줄여 부르지 말 것 — 정확한 이름 그대로
`.trim();
}

// =====================================================================
// 3. Post-generation validator
// =====================================================================

export interface HumanizeIssue {
  type: "ai-pattern" | "hallucinated-product";
  detail: string;
  snippet?: string;
}

const AI_PATTERN_REGEXES: Array<{ name: string; re: RegExp }> = [
  { name: "numbered-list", re: /^\s*\d+\.\s/m },
  { name: "bullet-list", re: /^\s*[-•·]\s/m },
  { name: "checkbox", re: /\[\s?\]/ },
  { name: "markdown-header", re: /^#{2,4}\s/m },
  { name: "structural-label", re: /(체크리스트|필수 ?포함|금지 ?사항|정리하면|결론적으로)\s*[:：]/ },
  { name: "section-emoji-header", re: /^(📋|✅|❌|⚠️|🔍|📌)\s*\*\*/m },
];

export function detectAIPatterns(text: string): HumanizeIssue[] {
  const issues: HumanizeIssue[] = [];
  for (const { name, re } of AI_PATTERN_REGEXES) {
    const match = text.match(re);
    if (match) {
      issues.push({
        type: "ai-pattern",
        detail: name,
        snippet: match[0].slice(0, 60),
      });
    }
  }
  return issues;
}

/**
 * Detects mentions of "바닐라코 X" or "banilaco X" where X is NOT in the allowed
 * product list. Conservative — only flags clear product-name patterns.
 */
export function detectHallucinatedProducts(
  text: string,
  allowedProductNames: string[]
): HumanizeIssue[] {
  const issues: HumanizeIssue[] = [];

  // Build a quick lookup: lowercase product name → true
  const allowed = new Set(allowedProductNames.map((n) => n.toLowerCase()));

  // Match patterns like "바닐라코 ○○○" / "바닐라코의 ○○○" — capture up to 12 chars
  // of likely product-name tokens (Korean + spaces).
  const PRODUCT_MENTION = /바닐라코[의]?\s+([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s]{1,20}?)(?=[\s.,!?의을를이가은는와과에서로]|$)/g;

  // [BUG-5] Prefix match — catches "공식몰", "공식 사이트", "고객센터" etc.
  // which the guardrail prompt itself endorses ("바닐라코 공식몰에서 확인하세요")
  // and would otherwise be flagged as hallucinated products.
  const categoryPrefixes = [
    "제품", "라인", "공식", "고객", "브랜드", "쿠션", "파운데", "토너",
    "세럼", "크림", "클렌징", "팩", "매장", "몰", "샵", "사이트",
  ];
  // [PERF-8] Hoist the spread outside the loop.
  const allowedArr = [...allowed];

  // [SEC-5] Defensive cap against pathological inputs.
  const MAX_MATCHES = 50;
  let iterations = 0;
  let m: RegExpExecArray | null;
  while ((m = PRODUCT_MENTION.exec(text)) !== null && iterations < MAX_MATCHES) {
    iterations++;
    const candidate = m[1].trim();

    // Skip category/generic words the brand guardrail itself endorses.
    if (categoryPrefixes.some((w) => candidate.startsWith(w))) continue;

    // Check against allow-list (substring match in either direction)
    const candidateLower = candidate.toLowerCase();
    const isAllowed = allowedArr.some(
      (a) => a.includes(candidateLower) || candidateLower.includes(a)
    );

    if (!isAllowed) {
      issues.push({
        type: "hallucinated-product",
        detail: candidate,
        snippet: m[0],
      });
    }
  }

  return issues;
}

export interface ValidationResult {
  passed: boolean;
  issues: HumanizeIssue[];
}

export function validateResponse(
  text: string,
  allowedProductNames: string[]
): ValidationResult {
  const issues = [
    ...detectAIPatterns(text),
    ...detectHallucinatedProducts(text, allowedProductNames),
  ];
  return { passed: issues.length === 0, issues };
}
