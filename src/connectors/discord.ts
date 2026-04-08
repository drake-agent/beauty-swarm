import {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  type Message,
  type Interaction,
  type StringSelectMenuInteraction,
} from "discord.js";

const API_BASE = process.env.API_BASE_URL || "http://localhost:3000";
const API_KEY = process.env.BOT_API_KEY; // beauty-swarm API key
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is required");
  process.exit(1);
}
if (!API_KEY) {
  console.error("❌ BOT_API_KEY is required (beauty-swarm API key)");
  process.exit(1);
}

// Session tracking: channelId → { session_id, persona_id }
const channelSessions = new Map<string, { session_id: string; persona_id: string }>();

// Persona emoji map for quick mentions
const PERSONA_TRIGGERS: Record<string, string> = {
  "모공": "pore-unni",
  "칙칙": "glow-seeker",
  "기름": "oil-fighter",
  "유분": "oil-fighter",
  "민감": "sensitive-soul",
  "기미": "gimi-hunter",
  "초보": "first-timer",
  "뉴비": "first-timer",
  "입문": "first-timer",
};

interface ApiPersona {
  id: string;
  name: string;
  avatar: string;
  role: string;
  backstory_summary: string;
  pain_point_affinity: string[];
}

interface ChatResponse {
  session_id: string;
  persona: { id: string; name: string; avatar: string };
  message: string;
  detected_concerns: string[];
  intent: string;
  usage: { input_tokens: number; output_tokens: number };
}

interface PanelMember {
  persona: { id: string; name: string; avatar: string; role: string };
  message: string;
}

interface PanelResponse {
  panel: PanelMember[];
  summary?: string;
  detected_concerns: string[];
}

// =====================
// API Helpers
// =====================

async function apiCall<T>(endpoint: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as Record<string, string>).error || `API ${res.status}`);
  }

  return res.json() as Promise<T>;
}

async function fetchPersonas(): Promise<ApiPersona[]> {
  const data = await apiCall<{ personas: ApiPersona[] }>("/personas");
  return data.personas;
}

async function chat(
  personaId: string,
  message: string,
  sessionId?: string
): Promise<ChatResponse> {
  return apiCall<ChatResponse>("/chat", {
    persona_id: personaId,
    message,
    session_id: sessionId,
  });
}

async function panel(
  personaIds: string[],
  message: string
): Promise<PanelResponse> {
  return apiCall<PanelResponse>("/panel", {
    persona_ids: personaIds,
    message,
    include_summary: true,
  });
}

// =====================
// Discord Bot
// =====================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`🤖 Discord bot ready as ${c.user.tag}`);
});

// =====================
// Message Handler
// =====================

client.on(Events.MessageCreate, async (msg: Message) => {
  if (msg.author.bot) return;

  const content = msg.content.trim();

  // Command: !뷰티 or !beauty — show persona selector
  if (content === "!뷰티" || content === "!beauty") {
    await showPersonaSelector(msg);
    return;
  }

  // Command: !패널 <질문> — panel discussion
  if (content.startsWith("!패널 ") || content.startsWith("!panel ")) {
    const question = content.replace(/^!(패널|panel)\s+/, "");
    await handlePanel(msg, question);
    return;
  }

  // Command: !리셋 — reset session
  if (content === "!리셋" || content === "!reset") {
    channelSessions.delete(msg.channelId);
    await msg.reply("🔄 세션 초기화! `!뷰티`로 새 페르소나를 선택하세요.");
    return;
  }

  // Command: !도움 — help
  if (content === "!도움" || content === "!help") {
    await showHelp(msg);
    return;
  }

  // Auto-detect persona from keywords if no session
  const session = channelSessions.get(msg.channelId);
  if (!session) {
    // Try auto-detect
    const detected = detectPersona(content);
    if (detected) {
      await handleChat(msg, detected, content);
    }
    // Ignore messages without session or detected persona
    return;
  }

  // Continue existing session
  await handleChat(msg, session.persona_id, content, session.session_id);
});

// =====================
// Interaction Handler (Select Menu)
// =====================

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== "persona_select") return;

  const menuInteraction = interaction as StringSelectMenuInteraction;
  const personaId = menuInteraction.values[0];

  channelSessions.set(menuInteraction.channelId!, {
    session_id: "",
    persona_id: personaId,
  });

  const personas = await fetchPersonas();
  const selected = personas.find((p) => p.id === personaId);

  await menuInteraction.update({
    content: `${selected?.avatar} **${selected?.name}** 연결됨! 이제 메시지를 보내면 ${selected?.name}이(가) 답해요.\n\n> *${selected?.backstory_summary}*\n\n💡 `!리셋`으로 페르소나 변경, `!패널 질문`으로 여러 명에게 물어볼 수 있어요.`,
    components: [],
  });
});

// =====================
// Core Functions
// =====================

async function handleChat(
  msg: Message,
  personaId: string,
  userMessage: string,
  sessionId?: string
): Promise<void> {
  await msg.channel.sendTyping();

  try {
    const response = await chat(personaId, userMessage, sessionId);

    // Save session
    channelSessions.set(msg.channelId, {
      session_id: response.session_id,
      persona_id: personaId,
    });

    // Format response
    const embed = new EmbedBuilder()
      .setAuthor({
        name: `${response.persona.avatar} ${response.persona.name}`,
      })
      .setDescription(truncate(response.message, 4096))
      .setColor(0xf5c6d0) // banilaco pink
      .setFooter({
        text: `AI 뷰티 캐릭터 · ${response.detected_concerns.join(", ") || "일반"}`,
      });

    await msg.reply({ embeds: [embed] });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "알 수 없는 오류";
    await msg.reply(`❌ 오류: ${errMsg}`);
  }
}

async function handlePanel(msg: Message, question: string): Promise<void> {
  await msg.channel.sendTyping();

  try {
    // Pick 3 best personas based on keywords
    const personas = await fetchPersonas();
    const detected = detectAllPersonas(question);
    const panelIds =
      detected.length >= 2
        ? detected.slice(0, 3)
        : personas.slice(0, 3).map((p) => p.id);

    const response = await panel(panelIds, question);

    const embeds = response.panel.map((member) =>
      new EmbedBuilder()
        .setAuthor({
          name: `${member.persona.avatar} ${member.persona.name}`,
        })
        .setDescription(truncate(member.message, 1024))
        .setColor(0xf5c6d0)
    );

    if (response.summary) {
      embeds.push(
        new EmbedBuilder()
          .setAuthor({ name: "📋 종합 요약" })
          .setDescription(truncate(response.summary, 1024))
          .setColor(0x333333)
      );
    }

    await msg.reply({
      content: `**🎙️ 뷰티 패널 토론** — "${truncate(question, 100)}"`,
      embeds: embeds.slice(0, 5), // Discord max 10, safe with 4
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "알 수 없는 오류";
    await msg.reply(`❌ 패널 오류: ${errMsg}`);
  }
}

async function showPersonaSelector(msg: Message): Promise<void> {
  try {
    const personas = await fetchPersonas();

    const menu = new StringSelectMenuBuilder()
      .setCustomId("persona_select")
      .setPlaceholder("페르소나를 선택하세요")
      .addOptions(
        personas.map((p) => ({
          label: `${p.avatar} ${p.name}`,
          description: truncate(`${p.role} — ${p.backstory_summary}`, 100),
          value: p.id,
        }))
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

    await msg.reply({
      content:
        "🧴 **바닐라코 AI 뷰티 상담** — 어떤 페르소나와 이야기하고 싶으세요?\n\n> 같은 피부 고민을 겪고 해결해본 소비자 캐릭터들이에요. (AI 캐릭터입니다)",
      components: [row],
    });
  } catch (err) {
    await msg.reply("❌ 페르소나 목록을 불러올 수 없어요. API 연결을 확인해주세요.");
  }
}

async function showHelp(msg: Message): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle("🧴 beauty-swarm 도움말")
    .setDescription("바닐라코 AI 뷰티 상담 봇")
    .addFields(
      { name: "`!뷰티`", value: "페르소나 선택 메뉴 열기", inline: true },
      { name: "`!패널 질문`", value: "여러 페르소나에게 동시 질문", inline: true },
      { name: "`!리셋`", value: "현재 세션 초기화", inline: true },
      { name: "`!도움`", value: "이 도움말 표시", inline: true },
      {
        name: "💡 팁",
        value:
          "페르소나 선택 없이도 '모공', '기미', '민감' 등 키워드가 포함된 메시지를 보내면 자동으로 맞는 페르소나가 응답해요.",
      }
    )
    .setColor(0xf5c6d0)
    .setFooter({ text: "AI 뷰티 캐릭터 서비스 · 실제 의료 조언이 아닙니다" });

  await msg.reply({ embeds: [embed] });
}

// =====================
// Helpers
// =====================

function detectPersona(message: string): string | null {
  const lower = message.toLowerCase();
  for (const [keyword, personaId] of Object.entries(PERSONA_TRIGGERS)) {
    if (lower.includes(keyword)) return personaId;
  }
  return null;
}

function detectAllPersonas(message: string): string[] {
  const lower = message.toLowerCase();
  const found = new Set<string>();
  for (const [keyword, personaId] of Object.entries(PERSONA_TRIGGERS)) {
    if (lower.includes(keyword)) found.add(personaId);
  }
  return [...found];
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

// =====================
// Start
// =====================

console.log("🔌 Connecting to Discord...");
client.login(DISCORD_TOKEN);
