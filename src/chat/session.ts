import type { LLMMessage } from "../llm/client.js";

export interface Session {
  id: string;
  personaId: string;
  messages: LLMMessage[];
  userContext?: UserContext;
  createdAt: number;
  lastActiveAt: number;
}

export interface UserContext {
  skin_type?: string;
  age_group?: string;
  concerns?: string[];
}

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// [BUG-2] Cap stored history — prevents unbounded growth that eventually
// exceeds the model's context window. Each "turn" is 2 messages (user+asst),
// so 40 = 20 turns. Older turns are dropped (FIFO).
const MAX_HISTORY_MESSAGES = 40;

// [PERF-4] Upper bound on concurrent sessions — LRU eviction above this.
const MAX_SESSIONS = 5000;

class SessionStore {
  private sessions: Map<string, Session> = new Map();
  // [BUG-1] Per-session lock chain — serializes addMessage calls for a given
  // session so concurrent /chat requests can't interleave user/assistant writes
  // and scramble the transcript.
  private locks: Map<string, Promise<unknown>> = new Map();

  create(personaId: string, userContext?: UserContext): Session {
    // LRU eviction: if we're at cap, drop the oldest by lastActiveAt.
    if (this.sessions.size >= MAX_SESSIONS) {
      let oldestId: string | null = null;
      let oldestTs = Infinity;
      for (const [id, s] of this.sessions) {
        if (s.lastActiveAt < oldestTs) {
          oldestTs = s.lastActiveAt;
          oldestId = id;
        }
      }
      if (oldestId) this.sessions.delete(oldestId);
    }

    const session: Session = {
      id: crypto.randomUUID(),
      personaId,
      messages: [],
      userContext,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): Session | undefined {
    const session = this.sessions.get(id);
    if (session && Date.now() - session.lastActiveAt > SESSION_TTL_MS) {
      this.sessions.delete(id);
      this.locks.delete(id);
      return undefined;
    }
    if (session) {
      session.lastActiveAt = Date.now();
    }
    return session;
  }

  /**
   * [BUG-1] Serialized append. Callers that need ordering guarantees should use
   * `withLock` to run their full read-modify-write under one lock.
   */
  addMessage(sessionId: string, message: LLMMessage): void {
    const session = this.get(sessionId);
    if (!session) return;
    session.messages.push(message);
    // [BUG-2] Trim from the front when we exceed the cap, keeping most recent.
    if (session.messages.length > MAX_HISTORY_MESSAGES) {
      session.messages.splice(0, session.messages.length - MAX_HISTORY_MESSAGES);
    }
  }

  /**
   * Run `fn` with an exclusive lock on the given session id. Chains onto any
   * in-flight operation for the same session, so concurrent callers serialize.
   */
  async withLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(sessionId) ?? Promise.resolve();
    const next = prev.then(() => fn(), () => fn()); // swallow upstream errors
    this.locks.set(sessionId, next);
    try {
      return await next;
    } finally {
      // Clean up if this is still the tail of the chain.
      if (this.locks.get(sessionId) === next) {
        this.locks.delete(sessionId);
      }
    }
  }

  cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActiveAt > SESSION_TTL_MS) {
        this.sessions.delete(id);
        this.locks.delete(id);
      }
    }
  }

  // Test helper — clear all state between tests.
  _reset(): void {
    this.sessions.clear();
    this.locks.clear();
  }
}

export const sessionStore = new SessionStore();

// Auto-cleanup expired sessions. unref() so this timer doesn't block process exit.
const cleanupHandle = setInterval(() => sessionStore.cleanup(), CLEANUP_INTERVAL_MS);
if (typeof cleanupHandle === "object" && cleanupHandle && "unref" in cleanupHandle) {
  (cleanupHandle as { unref: () => void }).unref();
}
