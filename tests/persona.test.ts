import { describe, test, expect } from "bun:test";
import { PersonaRegistry } from "../src/persona/registry.js";

describe("PersonaRegistry", () => {
  const registry = new PersonaRegistry();

  test("loads all 6 personas", () => {
    const all = registry.getAll();
    expect(all.length).toBe(6);
  });

  test("lists persona summaries with backstory", () => {
    const list = registry.list();
    expect(list.length).toBe(6);
    for (const p of list) {
      expect(p.id).toBeDefined();
      expect(p.name).toBeDefined();
      expect(p.avatar).toBeDefined();
      expect(p.backstory_summary).toContain("/");
    }
  });

  test("gets pore-unni persona", () => {
    const poreUnni = registry.get("pore-unni");
    expect(poreUnni).toBeDefined();
    expect(poreUnni!.name).toBe("모공언니");
    expect(poreUnni!.backstory.main_concern).toContain("모공");
    expect(poreUnni!.backstory.holy_grail).toContain("클린잇제로");
  });

  test("gets oil-fighter persona", () => {
    const oilFighter = registry.get("oil-fighter");
    expect(oilFighter).toBeDefined();
    expect(oilFighter!.backstory.skin_type).toContain("지성");
    expect(oilFighter!.style.emoji_use).toBe("heavy");
  });

  test("gets sensitive-soul persona", () => {
    const sensitive = registry.get("sensitive-soul");
    expect(sensitive).toBeDefined();
    expect(sensitive!.backstory.main_concern).toContain("민감");
    expect(sensitive!.graph_strategy).toBe("safety-first");
  });

  test("gets first-timer persona", () => {
    const newbie = registry.get("first-timer");
    expect(newbie).toBeDefined();
    expect(newbie!.backstory.age).toContain("21");
    expect(newbie!.graph_strategy).toBe("minimal-routine");
  });

  test("returns undefined for unknown persona", () => {
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  test("finds best personas for pore concerns", () => {
    const best = registry.findBestForPainPoints(["pore", "oiliness"]);
    const topIds = best.slice(0, 2).map((p) => p.id);
    // pore-unni and oil-fighter should rank high
    expect(topIds).toContain("pore-unni");
    expect(topIds).toContain("oil-fighter");
  });

  test("finds best personas for sensitivity + dryness", () => {
    const best = registry.findBestForPainPoints(["sensitivity", "dryness"]);
    // sensitive-soul has both sensitivity and dryness affinity
    expect(best[0].id).toBe("sensitive-soul");
  });

  test("each persona has backstory with journey", () => {
    for (const persona of registry.getAll()) {
      expect(persona.backstory.journey.length).toBeGreaterThan(50);
      expect(persona.backstory.turning_point.length).toBeGreaterThan(10);
      expect(persona.backstory.current_routine.length).toBeGreaterThanOrEqual(3);
      expect(persona.backstory.failed_products.length).toBeGreaterThanOrEqual(2);
      expect(persona.backstory.holy_grail).toContain("클린잇제로");
    }
  });

  test("each persona has system prompt template", () => {
    for (const persona of registry.getAll()) {
      expect(persona.system_prompt_template).toContain("{knowledge_context}");
      expect(persona.system_prompt_template).toContain("{brand_guidelines}");
      expect(persona.system_prompt_template).toContain("투명성");
    }
  });
});
