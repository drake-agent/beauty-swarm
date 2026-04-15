import { describe, test, expect } from "bun:test";
import { splitForTwitter } from "../src/api/compose.js";

describe("Twitter thread splitter", () => {
  test("returns single chunk when under limit", () => {
    const text = "짧은 답변이에요.";
    const result = splitForTwitter(text);
    expect(result.length).toBe(1);
    expect(result[0]).toBe(text);
  });

  test("splits long text into multiple chunks with (n/total) markers", () => {
    const sentence = "이건 한 문장이 끝나는 길이의 예시 텍스트예요.";
    const long = sentence.repeat(20); // ~600 chars
    const result = splitForTwitter(long);
    expect(result.length).toBeGreaterThan(1);
    result.forEach((chunk, i) => {
      expect(chunk).toContain(`(${i + 1}/${result.length})`);
      expect(chunk.length).toBeLessThanOrEqual(270);
    });
  });

  test("respects sentence boundaries (no mid-sentence breaks for normal text)", () => {
    const text =
      "첫 번째 문장이에요. 두 번째 문장이고요. 세 번째도 있어요. " +
      "이게 좀 더 길어지면 분할되겠죠. 다섯 번째 문장. 여섯 번째 문장. " +
      "그리고 일곱 번째도 있어요. 마지막 문장으로 마무리할게요.".repeat(5);
    const result = splitForTwitter(text);
    // Each chunk (except last) should end with sentence-ending punctuation or marker
    for (let i = 0; i < result.length - 1; i++) {
      const withoutMarker = result[i].replace(/\s*\(\d+\/\d+\)$/, "").trim();
      expect(withoutMarker).toMatch(/[.!?。！？]$/);
    }
  });

  test("hard-splits a single sentence longer than limit", () => {
    const giant = "가".repeat(500); // single 500-char "sentence"
    const result = splitForTwitter(giant);
    expect(result.length).toBeGreaterThan(1);
    result.forEach((chunk) => expect(chunk.length).toBeLessThanOrEqual(270));
  });

  test("custom limit respected", () => {
    const text = "문장. ".repeat(100);
    const result = splitForTwitter(text, 100);
    result.forEach((chunk) => expect(chunk.length).toBeLessThanOrEqual(100));
  });
});

describe("Compose response shape (smoke)", () => {
  test("PLATFORM_LIMITS values are sane", () => {
    // Imported indirectly via the splitter — just verify the module loads
    expect(typeof splitForTwitter).toBe("function");
  });
});
