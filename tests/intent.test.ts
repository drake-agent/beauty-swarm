import { describe, test, expect } from "bun:test";

// Test the quick keyword classifier directly (no LLM needed)
const KEYWORD_MAP: Record<string, string[]> = {
  pore: ["모공", "블랙헤드", "화이트헤드", "딸기코", "피지", "좁쌀"],
  dullness: ["칙칙", "누렇", "누런", "톤", "광채", "윤기", "잡티", "맑"],
  oiliness: ["기름", "번들", "유분", "개기름", "T존", "무너짐", "밀림"],
  dryness: ["건조", "당김", "각질", "수분", "보습", "뻣뻣", "들뜸"],
  sensitivity: ["민감", "자극", "홍조", "붉", "따가", "장벽", "예민"],
  acne: ["여드름", "트러블", "뾰루지", "염증", "턱"],
  aging: ["주름", "탄력", "처짐", "노화", "안티에이징"],
  pigmentation: ["기미", "색소", "자국", "흉터", "주근깨"],
  "makeup-concern": ["클렌징", "세안", "베이스", "메이크업", "화장", "프라이머", "파운데이션"],
};

function quickDetect(message: string): string[] {
  const lower = message.toLowerCase();
  const concerns: string[] = [];
  for (const [concern, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      concerns.push(concern);
    }
  }
  return concerns;
}

describe("Intent Classification (keyword)", () => {
  test("detects pore concern", () => {
    expect(quickDetect("모공이 너무 넓어요")).toContain("pore");
  });

  test("detects oiliness", () => {
    expect(quickDetect("T존에 기름이 너무 많아")).toContain("oiliness");
  });

  test("detects dullness", () => {
    expect(quickDetect("피부가 너무 칙칙해요")).toContain("dullness");
  });

  test("detects sensitivity", () => {
    expect(quickDetect("화장품 바르면 피부가 따가워요")).toContain("sensitivity");
  });

  test("detects multiple concerns", () => {
    const result = quickDetect("모공도 넓고 기름도 많고 블랙헤드도 있어요");
    expect(result).toContain("pore");
    expect(result).toContain("oiliness");
  });

  test("detects makeup concern", () => {
    expect(quickDetect("클렌징이 잘 안돼요")).toContain("makeup-concern");
  });

  test("handles ambiguous message", () => {
    const result = quickDetect("피부가 안 좋아요");
    // No specific keyword match
    expect(result.length).toBe(0);
  });

  test("handles greetings", () => {
    expect(quickDetect("안녕하세요").length).toBe(0);
  });

  test("detects aging concerns", () => {
    expect(quickDetect("눈가에 잔주름이 생겼어요")).toContain("aging");
  });

  test("detects pigmentation", () => {
    expect(quickDetect("기미가 점점 진해져요")).toContain("pigmentation");
  });
});
