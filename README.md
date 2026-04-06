# beauty-swarm

Multi-persona AI cosmetics recommendation chatbot for Banilaco.

Each persona is a **real consumer** who has struggled with a specific skin concern, tried everything, and found what works. Not experts — people who've been there.

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
Consumer Pain Points (Seed Data: 모공/칙칙함/유분/건조/민감/트러블...)
    → Knowledge Graph (고민 ↔ 성분 ↔ 제품)
    → Consumer Personas (같은 고민 해결한 실제 소비자 캐릭터)
    → Chat API (1:1 상담 + 패널 토론)
```

## API

```bash
GET  /personas              # List all personas
GET  /personas/:id          # Persona detail + backstory
POST /chat                  # 1:1 chat with a persona
POST /panel                 # Multi-persona panel discussion
POST /recommend             # Quick KG-based recommendation (no LLM)
POST /personas/generate     # Generate new persona from pain points
GET  /pain-points           # List skin concern categories
```

## Quick Start

```bash
bun install
export ANTHROPIC_API_KEY=sk-...
bun run src/index.ts
```

## Example: 1:1 Chat

```bash
curl -X POST http://localhost:3000/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "persona_id": "pore-unni",
    "message": "블랙헤드가 너무 심해서 코팩을 쓸까 고민 중이에요"
  }'
```

> 🫧 모공언니: "코팩 쓰지 마!! 나도 코팩 진짜 많이 썼는데 그 순간만이야. 오히려 모공이 더 늘어나. 클렌징 밤으로 매일 녹여내는 게 훨씬 나아..."

## Example: Panel Discussion

```bash
curl -X POST http://localhost:3000/panel \
  -H 'Content-Type: application/json' \
  -d '{
    "persona_ids": ["pore-unni", "oil-fighter", "first-timer"],
    "message": "클렌징 밤 처음 써보려는데 어떤 걸로 시작해요?"
  }'
```

3 personas discuss simultaneously, each from their own experience.

## Generate New Personas

Personas grow from seed data. New consumer personas are auto-generated from pain points:

```bash
curl -X POST http://localhost:3000/personas/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "pain_points": ["acne", "oiliness"],
    "age_group": "10대 후반",
    "additional_context": "수능 스트레스로 턱 트러블 폭발한 고3"
  }'
```

## Stack

- **Runtime**: Bun
- **Framework**: Hono
- **LLM**: Claude Sonnet 4.6 (Anthropic SDK)
- **Data**: YAML → In-memory Knowledge Graph
- **Personas**: YAML profiles + LLM generation
