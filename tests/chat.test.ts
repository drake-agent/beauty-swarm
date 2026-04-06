import { describe, test, expect } from "bun:test";
import { KnowledgeGraph } from "../src/knowledge/graph.js";
import { PersonaRegistry } from "../src/persona/registry.js";
import { buildChatContext } from "../src/chat/context-builder.js";
import { sessionStore } from "../src/chat/session.js";

describe("Context Builder", () => {
  const graph = new KnowledgeGraph();
  const registry = new PersonaRegistry();

  test("builds chat context for pore-unni with pore concern", () => {
    const persona = registry.get("pore-unni")!;
    const ctx = buildChatContext(persona, "모공이 넓어서 고민이에요", graph);

    expect(ctx.systemPrompt).toContain("모공언니");
    expect(ctx.systemPrompt).toContain("모공 고민");
    expect(ctx.queryResult.painPoints.length).toBeGreaterThanOrEqual(1);
  });

  test("builds chat context for oil-fighter with oiliness concern", () => {
    const persona = registry.get("oil-fighter")!;
    const ctx = buildChatContext(persona, "개기름이 너무 심해요", graph);

    expect(ctx.systemPrompt).toContain("유분전쟁");
    expect(ctx.queryResult.painPoints.map((p) => p.id)).toContain("oiliness");
  });

  test("builds chat context for first-timer with generic question", () => {
    const persona = registry.get("first-timer")!;
    const ctx = buildChatContext(persona, "화장품 뭐부터 사야 해요?", graph);

    expect(ctx.systemPrompt).toContain("뷰티뉴비");
    // fallback to hero products when no specific concern
    expect(ctx.queryResult.products.length).toBeGreaterThanOrEqual(1);
  });

  test("context includes brand guidelines", () => {
    const persona = registry.get("sensitive-soul")!;
    const ctx = buildChatContext(persona, "건조해요", graph);

    expect(ctx.systemPrompt).toContain("바닐라코");
  });

  test("context includes transparency section", () => {
    const persona = registry.get("gimi-hunter")!;
    const ctx = buildChatContext(persona, "기미가 고민이에요", graph);

    expect(ctx.systemPrompt).toContain("투명성");
    expect(ctx.systemPrompt).toContain("AI");
  });
});

describe("Session Store", () => {
  test("creates session", () => {
    const session = sessionStore.create("pore-unni");
    expect(session.id).toBeDefined();
    expect(session.personaId).toBe("pore-unni");
    expect(session.messages).toEqual([]);
  });

  test("gets session by id", () => {
    const created = sessionStore.create("oil-fighter");
    const fetched = sessionStore.get(created.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(created.id);
  });

  test("adds messages to session", () => {
    const session = sessionStore.create("pore-unni");
    sessionStore.addMessage(session.id, {
      role: "user",
      content: "모공 고민이에요",
    });
    sessionStore.addMessage(session.id, {
      role: "assistant",
      content: "나도 그랬어~",
    });

    const updated = sessionStore.get(session.id);
    expect(updated!.messages.length).toBe(2);
  });

  test("returns undefined for unknown session", () => {
    expect(sessionStore.get("nonexistent")).toBeUndefined();
  });

  test("stores user context", () => {
    const session = sessionStore.create("pore-unni", {
      skin_type: "oily-combo",
      age_group: "20s-late",
      concerns: ["pore", "oiliness"],
    });
    expect(session.userContext?.skin_type).toBe("oily-combo");
  });
});
