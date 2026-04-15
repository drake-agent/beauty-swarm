# beauty-swarm

Multi-persona AI cosmetics chatbot for Banilaco — with brand guardrails, humanize layer, and a human-in-the-loop draft generator for social platforms.

Each persona is a **real consumer** who struggled with a specific skin concern, tried everything, and found what works. Not experts — people who've been there.

## Personas

| Persona | Story | Holy Grail |
|---------|-------|------------|
| 🫧 모공언니 | 모공 3년차. 코팩, 레이저 다 해봄. 클렌징이 답이었음 | Clean It Zero Pore Clarifying |
| ✨ 톤업지망생 | 야근 직장인. 칙칙함의 원인이 클렌징이란 걸 깨달음 | Clean It Zero Purifying |
| 💦 유분전쟁 | 극지성 10년차. 기름으로 기름을 녹이는 역발상 | Clean It Zero Revitalizing |
| 🛡️ 민감보스 | 장벽 붕괴 경험. "덜 바르는 게 답" 철학 | Clean It Zero Calming |
| ☀️ 기미헌터 | 출산 후 기미. 레이저 3번 재발. 선크림이 최고의 무기 | Clean It Zero Purifying |
| 🐣 뷰티뉴비 | 대학생 갓 입문. 선배가 알려준 클렌징 밤 하나로 시작 | Clean It Zero Original |

## Architecture

```
Consumer Pain Points (Seed: 모공/칙칙함/유분/건조/민감/트러블...)
    → Knowledge Graph (고민 ↔ 성분 ↔ 제품)
    → Consumer Personas (같은 고민 해결한 소비자 캐릭터)
    → Intent Classifier → Guardrail Router (trust/brand/hybrid)
    → LLM (Claude Sonnet) + Humanize Layer + Product Fidelity
    → Validator (AI-pattern + hallucinated-product detection)
    → Chat API / Panel API / Compose API / Web UI / Discord
```

## Guardrail System (A/B testable)

세 가지 모드. Env `GUARDRAIL_MODE` 또는 요청별 `guardrail_mode`로 선택.

| Mode | 설명 | 용도 |
|------|------|------|
| `trust` | 가드레일 없음. 페르소나 그대로 | 베이스라인, 날것 |
| `brand` | 항상 강한 브랜드 보호 | 안전 모드 |
| `hybrid` **(default)** | 의도 분류 후 자동 레벨링 | Option 3, 기본값 |

Hybrid 레벨 라우팅:

| Intent | Guardrail Level |
|--------|-----------------|
| complaint (불만·산화·쩍쩍 등) | **strong** — 공감 우선, 제품 옹호 금지 |
| purchase-consideration / compare | medium |
| recommend / routine / ingredient / concern | light |
| curiosity / general | minimal |

## Humanize + Product Fidelity (always-on)

- **HUMANIZE_RULES**: 번호 리스트, 불릿, 체크박스, 마크다운 헤더, "체크리스트:", ✅/❌ 섹션 헤더, "AI 어시스턴트" 자기소개 프리앰블 금지
- **Product Fidelity**: KG에서 나온 제품명 allow-list만 언급 허용. 없는 제품명("바닐라코 미라클 세럼" 같은) 생성 금지
- **Post-generation validator**: AI 패턴 + 환각 제품명 감지 → `validation.issues[]`로 응답에 포함

## API

### Public
```
GET  /              # Service info
GET  /personas      # List personas
GET  /personas/:id  # Persona detail + backstory
GET  /pain-points   # Skin concern categories
GET  /ui            # Compose web UI (human-in-the-loop)
POST /compose       # Draft generator for Twitter/Reddit/IG/YouTube
```

### Authenticated (`Authorization: Bearer <api-key>`)
```
POST /chat                # 1:1 chat
POST /panel               # Multi-persona panel
POST /recommend           # KG-only recommendation (no LLM)
POST /analyze             # Image analysis
POST /personas/generate   # Generate new persona from pain points
*    /users/*             # User management
```

### Admin (`X-Admin-Key: <admin-key>`)
```
*    /admin/*   # Usage logs, API key management
```

## Compose: Social Platform Drafts

사람이 직접 트위터/Reddit/IG/YouTube에 올리기 위한 **초안 생성기**. 자동 포스팅 아님.

```bash
curl -X POST http://localhost:3000/compose \
  -H 'Content-Type: application/json' \
  -d '{
    "platform": "twitter",
    "post_text": "바닐라코 쿠션 발르니까 황토흙 얹어놓은거 같네 ㅠㅠ",
    "thread_split": true
  }'
```

응답:
- `reply` — 플랫폼 제약에 맞춘 최종 초안
- `thread[]` — Twitter 280자 넘으면 문장 경계로 분할 + `(1/n)` 마커
- `persona` — 자동 감지된 페르소나
- `intent` / `guardrail` / `validation` — 디버그 정보

Web UI: `http://localhost:3000/ui` — 페이스트 → 초안 생성 → 복사.

## Quick Start

### 1. Dependencies

```bash
bun install
```

PostgreSQL 필요 (users, api_keys, usage_logs 테이블).

### 2. Environment

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export DATABASE_URL=postgres://user:pass@localhost:5432/beauty_swarm
export ADMIN_KEY=<long-random-string>
export GUARDRAIL_MODE=hybrid   # trust | brand | hybrid (default)
# Optional: CORS_ORIGINS=https://app.example.com,https://admin.example.com
```

### 3. Run

```bash
bun run src/index.ts
# → http://localhost:3000
# → http://localhost:3000/ui    (compose UI)
```

### 4. Test

```bash
bun test   # 89 tests
```

## Example: 1:1 Chat

```bash
curl -X POST http://localhost:3000/chat \
  -H 'Authorization: Bearer <key>' \
  -H 'Content-Type: application/json' \
  -d '{
    "persona_id": "pore-unni",
    "message": "블랙헤드 심한데 코팩 쓸까 고민돼요",
    "guardrail_mode": "hybrid"
  }'
```

> 🫧 모공언니: "코팩 쓰지 마!! 나도 진짜 많이 썼는데 그 순간만이야. 오히려 모공이 더 늘어나. 클렌징 밤으로 매일 녹여내는 게 훨씬 나아…"

## Example: Panel

```bash
curl -X POST http://localhost:3000/panel \
  -H 'Authorization: Bearer <key>' \
  -H 'Content-Type: application/json' \
  -d '{
    "persona_ids": ["pore-unni", "oil-fighter", "first-timer"],
    "message": "클렌징 밤 처음 써보려는데 어떤 걸로 시작해요?"
  }'
```

## Generate Personas

Seed data에서 새 소비자 페르소나 자동 생성:

```bash
curl -X POST http://localhost:3000/personas/generate \
  -H 'Authorization: Bearer <key>' \
  -H 'Content-Type: application/json' \
  -d '{
    "pain_points": ["acne", "oiliness"],
    "age_group": "10대 후반",
    "additional_context": "수능 스트레스 턱 트러블 폭발 고3"
  }'
```

## Discord Bot

```bash
export DISCORD_BOT_TOKEN=...
bun run bot:discord
```

`@beauty-swarm 블랙헤드 어떻게 해` 멘션으로 동작. 키워드로 페르소나 자동 매칭.

## A/B Analysis

`usage_logs`에 `guardrail_mode`, `guardrail_level`, `intent` 컬럼 저장. Admin 엔드포인트로 모드별 응답 품질·길이·에러율 비교 가능.

## Stack

- **Runtime**: Bun
- **Framework**: Hono
- **DB**: PostgreSQL (users, api_keys, usage_logs)
- **LLM**: Claude Sonnet 4 (Anthropic SDK)
- **Data**: YAML → In-memory Knowledge Graph
- **Auth**: Bearer API keys + admin key
- **Connectors**: REST, Web UI, Discord
