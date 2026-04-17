import { describe, test, expect } from "bun:test";
import { autoDetectPersona, PERSONA_TRIGGER_MAP } from "../src/persona/auto-detect.js";

describe("[STRUCT-2] autoDetectPersona — shared keyword → persona map", () => {
  test("detects 모공 → pore-unni", () => {
    expect(autoDetectPersona("모공이 너무 커졌어요", "default")).toBe("pore-unni");
  });

  test("detects T존/t존 case-insensitively", () => {
    expect(autoDetectPersona("T존이 번들거려요", "default")).toBe("oil-fighter");
    expect(autoDetectPersona("t존 기름 ㅠㅠ", "default")).toBe("oil-fighter");
  });

  test("returns fallback when no trigger matches", () => {
    expect(autoDetectPersona("오늘 날씨 좋네요", "fallback-id")).toBe("fallback-id");
  });

  test("trigger map is non-empty and maps to valid persona ids", () => {
    const ids = new Set(Object.values(PERSONA_TRIGGER_MAP));
    expect(ids.size).toBeGreaterThanOrEqual(6);
    // All known personas we expect in the map
    ["pore-unni", "glow-seeker", "oil-fighter", "sensitive-soul", "gimi-hunter", "first-timer"]
      .forEach((id) => expect(ids.has(id)).toBe(true));
  });
});
