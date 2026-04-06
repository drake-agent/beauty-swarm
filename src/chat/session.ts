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

class SessionStore {
  private sessions: Map<string, Session> = new Map();

  create(personaId: string, userContext?: UserContext): Session {
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
      return undefined;
    }
    if (session) {
      session.lastActiveAt = Date.now();
    }
    return session;
  }

  addMessage(sessionId: string, message: LLMMessage): void {
    const session = this.get(sessionId);
    if (session) {
      session.messages.push(message);
    }
  }

  cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActiveAt > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }
}

export const sessionStore = new SessionStore();
