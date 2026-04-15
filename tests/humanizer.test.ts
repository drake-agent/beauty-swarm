import { describe, test, expect } from "bun:test";
import {
  detectAIPatterns,
  detectHallucinatedProducts,
  validateResponse,
  buildProductFidelityPrompt,
  HUMANIZE_RULES,
} from "../src/chat/humanizer.js";

const REAL_PRODUCTS = [
  "클린잇제로 클렌징 밤 오리지널",
  "클린잇제로 클렌징 밤 카밍",
  "프라임 프라이머 포어 타이트닝",
  "디어 하이드레이션 크림",
];

describe("AI pattern detection", () => {
  test("flags numbered lists", () => {
    const issues = detectAIPatterns("이렇게 하세요:\n1. 토너 바르기\n2. 세럼 바르기");
    expect(issues.some((i) => i.detail === "numbered-list")).toBe(true);
  });

  test("flags bullet lists", () => {
    const issues = detectAIPatterns("- 첫째\n- 둘째");
    expect(issues.some((i) => i.detail === "bullet-list")).toBe(true);
  });

  test("flags checkboxes", () => {
    const issues = detectAIPatterns("체크: [ ] 토너  [ ] 세럼");
    expect(issues.some((i) => i.detail === "checkbox")).toBe(true);
  });

  test("flags markdown headers", () => {
    const issues = detectAIPatterns("## 정리\n내용...");
    expect(issues.some((i) => i.detail === "markdown-header")).toBe(true);
  });

  test("flags structural labels", () => {
    expect(detectAIPatterns("체크리스트: 확인하세요").some((i) => i.detail === "structural-label")).toBe(true);
    expect(detectAIPatterns("필수 포함: 보습").some((i) => i.detail === "structural-label")).toBe(true);
    expect(detectAIPatterns("결론적으로: 보습이 답").some((i) => i.detail === "structural-label")).toBe(true);
  });

  test("flags section emoji headers", () => {
    const issues = detectAIPatterns("📋 **종합 요약**\n내용");
    expect(issues.some((i) => i.detail === "section-emoji-header")).toBe(true);
  });

  test("passes natural conversational text", () => {
    const text = "아 그거 진짜 속상하죠 ㅠㅠ 저도 환절기 때 비슷한 경험 있는데, 보통은 각질이 쌓여서 그래요. 토너 좀 신경 써서 발라보고 그래도 안 되면 다시 알려주세요.";
    const issues = detectAIPatterns(text);
    expect(issues.length).toBe(0);
  });
});

describe("Hallucinated product detection", () => {
  test("flags fake product name", () => {
    const text = "바닐라코 미라클 세럼 추천드려요";
    const issues = detectHallucinatedProducts(text, REAL_PRODUCTS);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe("hallucinated-product");
  });

  test("flags 'Glow Booster' style invention", () => {
    const text = "바닐라코 글로우 부스터 써보세요";
    const issues = detectHallucinatedProducts(text, REAL_PRODUCTS);
    expect(issues.length).toBeGreaterThan(0);
  });

  test("passes real product mention", () => {
    const text = "바닐라코 클린잇제로 클렌징 밤 카밍이 진짜 좋아요";
    const issues = detectHallucinatedProducts(text, REAL_PRODUCTS);
    expect(issues.length).toBe(0);
  });

  test("ignores generic category words", () => {
    const text = "바닐라코 제품 중에 뭘 살까 고민이에요";
    const issues = detectHallucinatedProducts(text, REAL_PRODUCTS);
    expect(issues.length).toBe(0);
  });

  test("ignores 'banilaco brand' mentions without product name", () => {
    const text = "바닐라코 라인이 잘 맞아요";
    const issues = detectHallucinatedProducts(text, REAL_PRODUCTS);
    expect(issues.length).toBe(0);
  });
});

describe("Combined validation", () => {
  test("flags response with both AI patterns and hallucinated products", () => {
    const text = `## 추천
1. 바닐라코 미라클 세럼
2. 바닐라코 울트라 크림`;
    const result = validateResponse(text, REAL_PRODUCTS);
    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });

  test("passes a clean human-style response", () => {
    const text = "저도 그 고민 진짜 오래 했었거든요. 클린잇제로 카밍이 그나마 안 따가워서 정착했어요. 한 번 써보고 안 맞으면 다시 얘기해요.";
    const result = validateResponse(text, REAL_PRODUCTS);
    expect(result.passed).toBe(true);
    expect(result.issues.length).toBe(0);
  });
});

describe("Product fidelity prompt", () => {
  test("includes all product names when KG matches", () => {
    const prompt = buildProductFidelityPrompt(REAL_PRODUCTS);
    for (const name of REAL_PRODUCTS) {
      expect(prompt).toContain(name);
    }
    expect(prompt).toContain("엄수");
  });

  test("instructs no-invention when KG has no matches", () => {
    const prompt = buildProductFidelityPrompt([]);
    expect(prompt).toContain("만들어내지 마세요");
    expect(prompt).toContain("미라클 세럼");  // example of forbidden invention
  });
});

describe("HUMANIZE_RULES content", () => {
  test("explicitly forbids AI-tells", () => {
    expect(HUMANIZE_RULES).toContain("번호 매긴 리스트");
    expect(HUMANIZE_RULES).toContain("불릿 포인트");
    expect(HUMANIZE_RULES).toContain("체크박스");
    expect(HUMANIZE_RULES).toContain("마크다운 헤더");
  });

  test("forbids leading AI self-introduction", () => {
    expect(HUMANIZE_RULES).toMatch(/AI.*자기소개를 답변 시작/);
  });

  test("encourages natural tone", () => {
    expect(HUMANIZE_RULES).toContain("친구한테");
  });
});
