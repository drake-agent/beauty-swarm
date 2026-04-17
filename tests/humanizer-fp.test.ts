import { describe, test, expect } from "bun:test";
import { detectHallucinatedProducts } from "../src/chat/humanizer.js";

describe("[BUG-5] hallucinated product detector — false positive regressions", () => {
  const allowed = ["Clean It Zero Original", "Clean It Zero Pore Clarifying"];

  test("does not flag '바닐라코 공식몰'", () => {
    const issues = detectHallucinatedProducts(
      "바닐라코 공식몰에서 확인하세요.",
      allowed
    );
    expect(issues).toEqual([]);
  });

  test("does not flag '바닐라코 공식 사이트'", () => {
    const issues = detectHallucinatedProducts(
      "바닐라코 공식 사이트에서 구매하실 수 있어요.",
      allowed
    );
    expect(issues).toEqual([]);
  });

  test("does not flag '바닐라코 고객센터'", () => {
    const issues = detectHallucinatedProducts(
      "바닐라코 고객센터로 문의 주세요.",
      allowed
    );
    expect(issues).toEqual([]);
  });

  test("does not flag '바닐라코 브랜드샵'", () => {
    const issues = detectHallucinatedProducts(
      "바닐라코 브랜드샵 방문 추천드려요.",
      allowed
    );
    expect(issues).toEqual([]);
  });

  test("still flags a real hallucination", () => {
    const issues = detectHallucinatedProducts(
      "바닐라코 미라클 나이아신아마이드 세럼을 추천드려요.",
      allowed
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe("hallucinated-product");
  });
});
