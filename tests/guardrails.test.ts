import { describe, test, expect } from "bun:test";
import {
  resolveGuardrail,
  isValidGuardrailMode,
  DEFAULT_GUARDRAIL_MODE,
} from "../src/chat/guardrails.js";

describe("Guardrail mode validation", () => {
  test("accepts valid modes", () => {
    expect(isValidGuardrailMode("trust")).toBe(true);
    expect(isValidGuardrailMode("brand")).toBe(true);
    expect(isValidGuardrailMode("hybrid")).toBe(true);
  });

  test("rejects invalid modes", () => {
    expect(isValidGuardrailMode("foo")).toBe(false);
    expect(isValidGuardrailMode("")).toBe(false);
    expect(isValidGuardrailMode(null)).toBe(false);
    expect(isValidGuardrailMode(undefined)).toBe(false);
    expect(isValidGuardrailMode(42)).toBe(false);
  });

  test("default mode is hybrid (or env override)", () => {
    expect(isValidGuardrailMode(DEFAULT_GUARDRAIL_MODE)).toBe(true);
  });
});

describe("Trust mode — no guardrail injected", () => {
  test("returns empty prompt regardless of intent", () => {
    for (const intent of ["complaint", "purchase-consideration", "recommend", "general"]) {
      const g = resolveGuardrail("trust", intent);
      expect(g.mode).toBe("trust");
      expect(g.level).toBe("minimal");
      expect(g.prompt).toBe("");
    }
  });
});

describe("Brand mode — strong guardrail always", () => {
  test("returns full brand guardrail regardless of intent", () => {
    for (const intent of ["complaint", "curiosity", "general"]) {
      const g = resolveGuardrail("brand", intent);
      expect(g.mode).toBe("brand");
      expect(g.level).toBe("strong");
      expect(g.prompt).toContain("브랜드 응답 가드레일");
      expect(g.prompt).toContain("바닐라코");
      // Must explicitly forbid product-defect attribution
      expect(g.prompt).toMatch(/결함|불량|산화/);
    }
  });
});

describe("Hybrid mode — intent-driven", () => {
  test("complaint → strong (forbid defect attribution)", () => {
    const g = resolveGuardrail("hybrid", "complaint");
    expect(g.level).toBe("strong");
    expect(g.prompt).toContain("리프레이밍");
    expect(g.prompt).toContain("고객센터");
  });

  test("purchase-consideration → medium (in-brand recs)", () => {
    const g = resolveGuardrail("hybrid", "purchase-consideration");
    expect(g.level).toBe("medium");
    expect(g.prompt).toContain("바닐라코 라인 내");
  });

  test("compare → medium", () => {
    const g = resolveGuardrail("hybrid", "compare");
    expect(g.level).toBe("medium");
  });

  test("recommend → light", () => {
    const g = resolveGuardrail("hybrid", "recommend");
    expect(g.level).toBe("light");
    expect(g.prompt).toContain("바닐라코");
  });

  test("curiosity → minimal (consumer voice breathes)", () => {
    const g = resolveGuardrail("hybrid", "curiosity");
    expect(g.level).toBe("minimal");
  });

  test("general → minimal", () => {
    const g = resolveGuardrail("hybrid", "general");
    expect(g.level).toBe("minimal");
  });

  test("unknown intent → light fallback", () => {
    const g = resolveGuardrail("hybrid", "made-up-intent");
    expect(g.level).toBe("light");
  });
});

// Quick keyword check for new complaint intent — replicates the keyword set
const COMPLAINT_KEYWORDS = [
  "이상해", "이상함", "별로", "최악", "실망", "환불",
  "산화", "변색", "변질", "상한", "곰팡", "굳어",
  "쩍쩍", "갈라짐", "들떠", "들뜸", "밀려", "뭉쳐", "뭉침",
  "황토", "어둡게", "칙칙해짐",
  "눈물", "ㅠㅠ", "ㅜㅜ",
  "트러블 났", "뒤집어", "따가워졌", "붉어졌",
];

const PURCHASE_KEYWORDS = [
  "살까", "살지", "구매 고민", "고민 중", "고민중",
  "어떤 걸 사", "뭘 사", "결제", "장바구니", "주문할까",
];

function detectIntent(msg: string): string {
  const lower = msg.toLowerCase();
  if (COMPLAINT_KEYWORDS.some((k) => lower.includes(k))) return "complaint";
  if (PURCHASE_KEYWORDS.some((k) => lower.includes(k))) return "purchase-consideration";
  return "general";
}

describe("Real tweet samples → intent → guardrail level", () => {
  test("황토흙 쿠션 트윗 → complaint → strong", () => {
    const intent = detectIntent("바닐라코 쿠션 인생쿠션이었는데 오늘 바르니까 황토흙 얹어놓은거 같음 눈물");
    expect(intent).toBe("complaint");
    expect(resolveGuardrail("hybrid", intent).level).toBe("strong");
  });

  test("파우더 건조 트윗 → complaint (쩍쩍 갈라짐) → strong", () => {
    const intent = detectIntent("바닐라코 파우더 모공커버 좋은데 건조해서 얼굴이 쩍쩍 갈라짐");
    expect(intent).toBe("complaint");
    expect(resolveGuardrail("hybrid", intent).level).toBe("strong");
  });

  test("카밍 클렌징밤 추천 트윗 → general → minimal", () => {
    const intent = detectIntent("너 피부 예민하니까 바닐라코 클린 잇 제로 카밍 클렌징밤 쓰셈");
    expect(intent).toBe("general");
    expect(resolveGuardrail("hybrid", intent).level).toBe("minimal");
  });

  test("구매 고민 → purchase-consideration → medium", () => {
    const intent = detectIntent("바닐라코 클렌징밤 오리지널이랑 카밍 중에 살까 고민중");
    expect(intent).toBe("purchase-consideration");
    expect(resolveGuardrail("hybrid", intent).level).toBe("medium");
  });
});

describe("Brand vs Hybrid divergence (A/B comparison)", () => {
  test("brand mode applies strong even on curiosity (where hybrid stays minimal)", () => {
    const brand = resolveGuardrail("brand", "curiosity");
    const hybrid = resolveGuardrail("hybrid", "curiosity");
    expect(brand.level).toBe("strong");
    expect(hybrid.level).toBe("minimal");
    expect(brand.prompt.length).toBeGreaterThan(hybrid.prompt.length);
  });

  test("on complaint both modes converge to strong", () => {
    expect(resolveGuardrail("brand", "complaint").level).toBe("strong");
    expect(resolveGuardrail("hybrid", "complaint").level).toBe("strong");
  });
});
