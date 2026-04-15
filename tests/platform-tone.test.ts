import { describe, test, expect } from "bun:test";
import {
  PLATFORM_TONES,
  buildPlatformTonePrompt,
} from "../src/chat/platform-tone.js";

describe("Platform tone specs", () => {
  test("all four platforms defined", () => {
    expect(Object.keys(PLATFORM_TONES).sort()).toEqual([
      "instagram",
      "reddit",
      "twitter",
      "youtube",
    ]);
  });

  test("each platform has rules + at least 2 examples", () => {
    for (const [name, spec] of Object.entries(PLATFORM_TONES)) {
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.rules.length).toBeGreaterThan(50);
      expect(spec.examples.length).toBeGreaterThanOrEqual(2);
      expect(spec.emojiBudget).toBeGreaterThanOrEqual(0);
      expect(spec.emojiBudget).toBeLessThanOrEqual(6);
      // Examples should not be empty strings
      spec.examples.forEach((e) =>
        expect(e.trim().length).toBeGreaterThan(10)
      );
    }
  });

  test("emoji budgets differ per platform (not all the same)", () => {
    const budgets = Object.values(PLATFORM_TONES).map((s) => s.emojiBudget);
    const unique = new Set(budgets);
    expect(unique.size).toBeGreaterThan(1);
  });

  test("Reddit has the lowest emoji budget", () => {
    const reddit = PLATFORM_TONES.reddit.emojiBudget;
    for (const [name, spec] of Object.entries(PLATFORM_TONES)) {
      if (name !== "reddit") {
        expect(spec.emojiBudget).toBeGreaterThanOrEqual(reddit);
      }
    }
  });

  test("Instagram has the highest emoji budget", () => {
    const insta = PLATFORM_TONES.instagram.emojiBudget;
    for (const [name, spec] of Object.entries(PLATFORM_TONES)) {
      if (name !== "instagram") {
        expect(spec.emojiBudget).toBeLessThanOrEqual(insta);
      }
    }
  });
});

describe("buildPlatformTonePrompt", () => {
  test("output contains platform label, rules, emoji budget, and examples", () => {
    const prompt = buildPlatformTonePrompt("twitter");
    expect(prompt).toContain("X (Twitter)");
    expect(prompt).toContain("최대 2개");
    expect(prompt).toContain("예시 1");
    expect(prompt).toContain("예시 2");
    expect(prompt).toContain("humanize 기본");
  });

  test("Instagram prompt mentions hashtags and emoji tones", () => {
    const prompt = buildPlatformTonePrompt("instagram");
    expect(prompt).toContain("해시태그");
    expect(prompt).toContain("줄바꿈");
    expect(prompt).toContain("5개");
  });

  test("Reddit prompt emphasizes structure + TL;DR", () => {
    const prompt = buildPlatformTonePrompt("reddit");
    expect(prompt).toContain("TL;DR");
    expect(prompt).toContain("문단");
  });

  test("YouTube prompt mentions video context opener", () => {
    const prompt = buildPlatformTonePrompt("youtube");
    expect(prompt).toMatch(/영상/);
    expect(prompt).toMatch(/존댓말/);
  });

  test("prompts differ between platforms (no copy-paste)", () => {
    const tw = buildPlatformTonePrompt("twitter");
    const ig = buildPlatformTonePrompt("instagram");
    const rd = buildPlatformTonePrompt("reddit");
    const yt = buildPlatformTonePrompt("youtube");
    const all = [tw, ig, rd, yt];
    // Each must be distinct
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        expect(all[i]).not.toBe(all[j]);
      }
    }
  });
});
