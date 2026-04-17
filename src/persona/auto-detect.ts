// [STRUCT-2] Single source of truth for keyword → persona auto-detection.
// Previously duplicated (already drifted) between src/api/compose.ts and
// src/connectors/discord.ts. New connectors should import from here.

const PERSONA_TRIGGERS: Record<string, string> = {
  // 모공 · 블랙헤드
  "모공": "pore-unni", "블랙헤드": "pore-unni", "딸기코": "pore-unni", "피지": "pore-unni",
  // 칙칙 · 광채
  "칙칙": "glow-seeker", "누렇": "glow-seeker", "광채": "glow-seeker", "윤기": "glow-seeker",
  // 유분 · 번들
  "기름": "oil-fighter", "유분": "oil-fighter", "번들": "oil-fighter", "T존": "oil-fighter", "t존": "oil-fighter",
  // 민감 · 장벽
  "민감": "sensitive-soul", "예민": "sensitive-soul", "장벽": "sensitive-soul",
  "따가": "sensitive-soul", "홍조": "sensitive-soul", "붉어": "sensitive-soul",
  // 기미 · 색소
  "기미": "gimi-hunter", "색소": "gimi-hunter", "주근깨": "gimi-hunter", "잡티": "gimi-hunter",
  // 뷰티 입문
  "초보": "first-timer", "뉴비": "first-timer", "입문": "first-timer", "처음": "first-timer",
};

/**
 * Match a post/message against the keyword table and return the first matching
 * persona id, or the provided fallback if nothing hits.
 */
export function autoDetectPersona(text: string, fallback: string): string {
  const lower = text.toLowerCase();
  for (const [keyword, personaId] of Object.entries(PERSONA_TRIGGERS)) {
    if (lower.includes(keyword.toLowerCase())) return personaId;
  }
  return fallback;
}

/** Exposed for tests / debugging. Do not mutate. */
export const PERSONA_TRIGGER_MAP: Readonly<Record<string, string>> = PERSONA_TRIGGERS;
