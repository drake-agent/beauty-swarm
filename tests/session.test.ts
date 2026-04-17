import { describe, test, expect, beforeEach } from "bun:test";
import { sessionStore } from "../src/chat/session.js";

describe("SessionStore", () => {
  beforeEach(() => sessionStore._reset());

  test("creates session with unique id", () => {
    const a = sessionStore.create("pore-unni");
    const b = sessionStore.create("pore-unni");
    expect(a.id).not.toBe(b.id);
    expect(a.personaId).toBe("pore-unni");
  });

  test("get returns session and refreshes lastActiveAt", async () => {
    const s = sessionStore.create("pore-unni");
    const t1 = s.lastActiveAt;
    await new Promise((r) => setTimeout(r, 5));
    const got = sessionStore.get(s.id);
    expect(got).toBeDefined();
    expect(got!.lastActiveAt).toBeGreaterThan(t1);
  });

  test("[BUG-2] caps message history at MAX_HISTORY_MESSAGES", () => {
    const s = sessionStore.create("pore-unni");
    for (let i = 0; i < 60; i++) {
      sessionStore.addMessage(s.id, { role: "user", content: `msg ${i}` });
    }
    const got = sessionStore.get(s.id)!;
    expect(got.messages.length).toBeLessThanOrEqual(40);
    // Keeps the most recent, drops the oldest
    expect(got.messages[got.messages.length - 1].content).toBe("msg 59");
    expect(got.messages[0].content).not.toBe("msg 0");
  });

  test("[BUG-1] withLock serializes concurrent writes", async () => {
    const s = sessionStore.create("pore-unni");
    const order: number[] = [];

    const task = (n: number, delay: number) =>
      sessionStore.withLock(s.id, async () => {
        await new Promise((r) => setTimeout(r, delay));
        order.push(n);
      });

    await Promise.all([task(1, 20), task(2, 10), task(3, 5)]);
    // All three should execute in the order they acquired the lock,
    // not in order of their delays.
    expect(order).toEqual([1, 2, 3]);
  });
});
