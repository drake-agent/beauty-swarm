import Anthropic from "@anthropic-ai/sdk";

const CLASSIFY_MODEL = "claude-sonnet-4-20250514";

const CLASSIFY_PROMPT = `사용자 메시지에서 피부 고민과 의도를 분석하세요.

## 가능한 피부 고민 카테고리
- pore: 모공, 블랙헤드, 화이트헤드
- dullness: 칙칙함, 누런 피부, 피부톤 불균일, 광채 부족
- oiliness: 유분, 번들거림, T존 기름, 화장 무너짐
- dryness: 건조, 당김, 각질, 수분 부족
- sensitivity: 민감, 자극, 홍조, 장벽 손상
- acne: 트러블, 여드름, 뾰루지
- aging: 주름, 탄력, 안티에이징
- pigmentation: 기미, 잡티, 색소침착, 여드름 자국
- makeup-concern: 메이크업, 베이스, 클렌징, 화장 지속력

## 가능한 의도
- recommend: 제품 추천 요청
- concern: 피부 고민 상담
- routine: 루틴/사용법 질문
- compare: 제품 비교
- ingredient: 성분 관련 질문
- general: 일반 인사/질문

반드시 아래 JSON만 출력:
{"concerns": ["concern_id", ...], "intent": "intent_type", "confidence": 0.0-1.0}`;

let client: Anthropic | null = null;

export interface ClassificationResult {
  concerns: string[];
  intent: string;
  confidence: number;
}

export async function classifyIntent(
  message: string
): Promise<ClassificationResult> {
  // Fast keyword pre-check — skip LLM if obvious
  const quickResult = quickClassify(message);
  if (quickResult && quickResult.confidence >= 0.8) {
    return quickResult;
  }

  // LLM classification for ambiguous messages
  try {
    if (!client) client = new Anthropic();

    const response = await client.messages.create({
      model: CLASSIFY_MODEL,
      max_tokens: 200,
      system: CLASSIFY_PROMPT,
      messages: [{ role: "user", content: message }],
    });

    const text = response.content[0];
    if (text.type !== "text") throw new Error("No text response");

    const jsonMatch = text.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    return JSON.parse(jsonMatch[0]) as ClassificationResult;
  } catch {
    // Fallback to keyword if LLM fails
    return quickResult || { concerns: [], intent: "general", confidence: 0.3 };
  }
}

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

const INTENT_KEYWORDS: Record<string, string[]> = {
  recommend: ["추천", "뭐 써", "뭐가 좋", "어떤 거", "골라", "사야"],
  routine: ["루틴", "순서", "어떻게 써", "사용법", "바르는"],
  compare: ["비교", "차이", "뭐가 다", "vs", "어떤 게 나"],
  ingredient: ["성분", "함유", "들어있", "나이아신", "비타민"],
};

function quickClassify(message: string): ClassificationResult | null {
  const lower = message.toLowerCase();
  const concerns: string[] = [];

  for (const [concern, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      concerns.push(concern);
    }
  }

  let intent = "general";
  for (const [intentType, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      intent = intentType;
      break;
    }
  }

  if (concerns.length === 0 && intent === "general") {
    return null; // Ambiguous — needs LLM
  }

  if (concerns.length > 0 && intent === "general") {
    intent = "concern";
  }

  return {
    concerns,
    intent,
    confidence: concerns.length > 0 ? 0.85 : 0.6,
  };
}
