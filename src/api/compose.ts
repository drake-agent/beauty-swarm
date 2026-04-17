// Compose API — generates platform-formatted reply drafts for human posting.
// Input: a tweet/post/comment from any platform.
// Output: a humanized response, formatted for the target platform's constraints.
//
// This is a "draft generator" — no auto-posting. Human reviews and pastes manually.

import { Hono } from "hono";
import type { ChatEngine } from "../chat/engine.js";
import type { PersonaRegistry } from "../persona/registry.js";
import { isValidGuardrailMode } from "../chat/guardrails.js";
import { buildPlatformTonePrompt } from "../chat/platform-tone.js";
import { logUsage } from "../monitoring/usage.js";
import type { GuardrailMode } from "../chat/guardrails.js";

export type Platform = "twitter" | "reddit" | "instagram" | "youtube";

const PLATFORM_LIMITS: Record<Platform, number> = {
  twitter: 280,
  reddit: 10000,
  instagram: 2200,
  youtube: 10000,
};

const VALID_PLATFORMS: Platform[] = ["twitter", "reddit", "instagram", "youtube"];

interface ComposeRequest {
  platform: Platform;
  post_text: string;
  persona_id?: string;        // explicit selection — else auto-detect
  guardrail_mode?: GuardrailMode;
  thread_split?: boolean;     // Twitter: split long replies into thread
}

interface ComposeResponse {
  platform: Platform;
  persona: { id: string; name: string; avatar: string };
  reply: string;              // single-message reply (truncated if too long)
  thread?: string[];          // populated when thread_split=true and content overflows
  char_count: number;
  char_limit: number;
  intent: string;
  detected_concerns: string[];
  guardrail: { mode: string; level: string };
  validation: { passed: boolean; issue_count: number };
  raw_message: string;        // unformatted LLM output (for debugging)
}

// Same keyword map as the Discord bot — keep in sync
const PERSONA_TRIGGERS: Record<string, string> = {
  "모공": "pore-unni", "블랙헤드": "pore-unni", "딸기코": "pore-unni", "피지": "pore-unni",
  "칙칙": "glow-seeker", "누렇": "glow-seeker", "광채": "glow-seeker", "윤기": "glow-seeker",
  "기름": "oil-fighter", "유분": "oil-fighter", "번들": "oil-fighter", "T존": "oil-fighter",
  "민감": "sensitive-soul", "예민": "sensitive-soul", "장벽": "sensitive-soul", "따가": "sensitive-soul", "홍조": "sensitive-soul",
  "기미": "gimi-hunter", "색소": "gimi-hunter", "주근깨": "gimi-hunter", "잡티": "gimi-hunter",
  "초보": "first-timer", "뉴비": "first-timer", "입문": "first-timer", "처음": "first-timer",
};

function autoDetectPersona(text: string, fallback: string): string {
  const lower = text.toLowerCase();
  for (const [keyword, personaId] of Object.entries(PERSONA_TRIGGERS)) {
    if (lower.includes(keyword)) return personaId;
  }
  return fallback;
}

// Twitter thread splitter — splits at sentence boundaries, adds (1/n) markers
export function splitForTwitter(text: string, limit: number = 270): string[] {
  if (text.length <= limit) return [text];

  // Split by sentence-end punctuation while preserving them
  const sentences = text.match(/[^.!?。！？\n]+[.!?。！？\n]?/g) ?? [text];

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + sentence).length <= limit) {
      current += sentence;
    } else {
      if (current) chunks.push(current.trim());
      // If a single sentence exceeds limit, hard-split
      if (sentence.length > limit) {
        for (let i = 0; i < sentence.length; i += limit) {
          chunks.push(sentence.slice(i, i + limit).trim());
        }
        current = "";
      } else {
        current = sentence;
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // Add (1/n) markers — accounting for the marker itself in the budget
  const total = chunks.length;
  return chunks.map((c, i) => {
    const marker = ` (${i + 1}/${total})`;
    const room = limit - marker.length;
    const trimmed = c.length > room ? c.slice(0, room - 1) + "…" : c;
    return trimmed + marker;
  });
}

// Per-platform post-processing of the LLM output
function formatForPlatform(
  text: string,
  platform: Platform,
  threadSplit: boolean
): { reply: string; thread?: string[] } {
  const limit = PLATFORM_LIMITS[platform];

  if (platform === "twitter") {
    if (text.length <= limit) return { reply: text };
    if (threadSplit) {
      const thread = splitForTwitter(text);
      return { reply: thread[0], thread };
    }
    return { reply: text.slice(0, limit - 1) + "…" };
  }

  // Reddit / Instagram / YouTube — just truncate if over limit (rare)
  if (text.length > limit) {
    return { reply: text.slice(0, limit - 1) + "…" };
  }
  return { reply: text };
}

export function composeRoute(
  engine: ChatEngine,
  registry: PersonaRegistry
): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    const start = Date.now();
    const apiKey = c.get("apiKey") as string | undefined;
    const body = await c.req.json<ComposeRequest>();

    // Validation
    if (!body.platform || !body.post_text) {
      return c.json({ error: "platform and post_text are required" }, 400);
    }
    if (!VALID_PLATFORMS.includes(body.platform)) {
      return c.json({ error: `platform must be one of: ${VALID_PLATFORMS.join(", ")}` }, 400);
    }
    // [SEC-6/SEC-1] Tighten cap — /compose is unauthenticated, so large inputs
    // amplify cost. 2000 chars is larger than any real tweet/IG caption.
    if (body.post_text.length > 2000) {
      return c.json({ error: "post_text exceeds 2000 chars" }, 400);
    }
    if (body.guardrail_mode !== undefined && !isValidGuardrailMode(body.guardrail_mode)) {
      return c.json({ error: "guardrail_mode must be 'trust', 'brand', or 'hybrid'" }, 400);
    }

    // Persona resolution: explicit > auto-detect > first persona as fallback
    const personas = registry.list();
    if (personas.length === 0) {
      return c.json({ error: "No personas configured" }, 500);
    }
    const fallbackId = personas[0].id;
    const personaId = body.persona_id
      ? body.persona_id
      : autoDetectPersona(body.post_text, fallbackId);

    if (!registry.get(personaId)) {
      return c.json({ error: `Unknown persona: ${personaId}` }, 400);
    }

    // Frame the post as a message the persona is replying to (gives the LLM
    // context that this is a public-platform reply, not a 1:1 chat)
    const platformLabel: Record<Platform, string> = {
      twitter: "트위터",
      reddit: "Reddit",
      instagram: "Instagram",
      youtube: "YouTube",
    };
    const charLimit = PLATFORM_LIMITS[body.platform];

    const framedMessage =
      `다음은 ${platformLabel[body.platform]}에서 본 글이에요. 이 글에 답글로 달 내용을 써주세요. ` +
      `플랫폼 톤은 system prompt에 있는 "${platformLabel[body.platform]} 플랫폼 톤" 규칙을 따르세요.\n\n` +
      `--- 원본 글 ---\n${body.post_text}\n--- 끝 ---`;

    // Inject platform-specific tone (opener/closer/emoji budget/examples) as
    // extra_system — overrides humanize defaults for the target platform.
    const platformTone = buildPlatformTonePrompt(body.platform);

    try {
      const chatResponse = await engine.chat({
        persona_id: personaId,
        message: framedMessage,
        guardrail_mode: body.guardrail_mode,
        extra_system: platformTone,
      }, apiKey);

      const formatted = formatForPlatform(
        chatResponse.message,
        body.platform,
        body.thread_split === true
      );

      // [SEC-8] Only return raw LLM output when COMPOSE_DEBUG=true.
      // Leaking it lets attackers iterate prompt-injection payloads against
      // the full response, not just the platform-truncated one.
      const includeRaw = process.env.COMPOSE_DEBUG === "true";

      const response: ComposeResponse = {
        platform: body.platform,
        persona: chatResponse.persona,
        reply: formatted.reply,
        thread: formatted.thread,
        char_count: formatted.reply.length,
        char_limit: charLimit,
        intent: chatResponse.intent,
        detected_concerns: chatResponse.detected_concerns,
        guardrail: chatResponse.guardrail,
        validation: {
          passed: chatResponse.validation.passed,
          issue_count: chatResponse.validation.issues.length,
        },
        raw_message: includeRaw ? chatResponse.message : "",
      };

      logUsage({
        api_key: apiKey || null,
        endpoint: `POST /compose:${body.platform}`,
        persona_id: personaId,
        input_tokens: chatResponse.usage.input_tokens,
        output_tokens: chatResponse.usage.output_tokens,
        latency_ms: Date.now() - start,
        status_code: 200,
        guardrail_mode: chatResponse.guardrail.mode,
        guardrail_level: chatResponse.guardrail.level,
        intent: chatResponse.intent,
      });

      return c.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logUsage({
        api_key: apiKey || null,
        endpoint: `POST /compose:${body.platform}`,
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: Date.now() - start,
        status_code: 400,
        error: message,
      });
      return c.json({ error: message }, 400);
    }
  });

  return app;
}
