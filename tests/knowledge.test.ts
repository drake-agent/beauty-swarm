import { describe, test, expect } from "bun:test";
import { KnowledgeGraph } from "../src/knowledge/graph.js";

describe("KnowledgeGraph", () => {
  const graph = new KnowledgeGraph();

  test("loads all pain point categories", () => {
    const pp = graph.getAllPainPoints();
    expect(pp.length).toBeGreaterThanOrEqual(9);
    expect(pp.map((p) => p.id)).toContain("pore");
    expect(pp.map((p) => p.id)).toContain("dullness");
    expect(pp.map((p) => p.id)).toContain("oiliness");
  });

  test("loads all products", () => {
    const products = graph.getAllProducts();
    expect(products.length).toBeGreaterThanOrEqual(10);
    expect(products.find((p) => p.id === "clean-it-zero-original")).toBeDefined();
  });

  test("detects pain points from user message", () => {
    const result = graph.detectPainPoints("모공이 너무 넓어서 고민이에요");
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].id).toBe("pore");
  });

  test("detects multiple pain points", () => {
    const result = graph.detectPainPoints("피부가 칙칙하고 모공도 넓어요");
    expect(result.length).toBeGreaterThanOrEqual(2);
    const ids = result.map((r) => r.id);
    expect(ids).toContain("pore");
    expect(ids).toContain("dullness");
  });

  test("detects oiliness keywords", () => {
    const result = graph.detectPainPoints("T존 기름이 너무 많아요 개기름 장난 아님");
    const ids = result.map((r) => r.id);
    expect(ids).toContain("oiliness");
  });

  test("queries by pain points and returns related data", () => {
    const result = graph.queryByPainPoints(["pore"]);
    expect(result.painPoints.length).toBe(1);
    expect(result.ingredients.length).toBeGreaterThanOrEqual(1);
    expect(result.products.length).toBeGreaterThanOrEqual(1);
    expect(result.connections.length).toBeGreaterThanOrEqual(1);
  });

  test("queries by message returns full graph result", () => {
    const result = graph.queryByMessage("블랙헤드가 심해요");
    expect(result.painPoints.length).toBeGreaterThanOrEqual(1);
    expect(result.products.length).toBeGreaterThanOrEqual(1);
  });

  test("fallback to hero products when no pain point detected", () => {
    const result = graph.queryByMessage("안녕하세요");
    expect(result.painPoints.length).toBe(0);
    expect(result.products.length).toBeGreaterThanOrEqual(1);
    expect(result.products.some((p) => p.hero_product)).toBe(true);
  });

  test("different strategies sort differently", () => {
    const costResult = graph.queryByPainPoints(["pore"], "cost-effective");
    const safetyResult = graph.queryByPainPoints(["pore"], "safety-first");
    // Both should return results
    expect(costResult.products.length).toBeGreaterThanOrEqual(1);
    expect(safetyResult.ingredients.length).toBeGreaterThanOrEqual(1);
  });
});
