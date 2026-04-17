// Platform-specific tone layer — each platform has its own culture, length,
// emoji budget, opener/closer patterns. This module produces a prompt fragment
// that's appended to the system prompt (after HUMANIZE_RULES) to override
// defaults for the target platform.
//
// Few-shot examples are tone references only — the LLM should not copy content.

import type { Platform } from "./platform-types.js";

export interface PlatformToneSpec {
  label: string;
  rules: string;             // hard rules (opener, closer, line breaks, hashtags)
  examples: string[];        // 2-3 few-shot exemplars embodying the voice
  emojiBudget: number;       // overrides HUMANIZE_RULES default of 3
}

// --------------- Twitter / X ---------------
const TWITTER: PlatformToneSpec = {
  label: "X (Twitter)",
  emojiBudget: 2,
  rules: `
- **첫 문장부터 훅**. 인사말·"안녕하세요" 금지. 공감 한 방 또는 핵심 포인트로 바로 시작.
- **짧고 강하게**. 1-3 문장, 200자 안쪽 권장.
- 줄바꿈 거의 없이 한 덩어리로 (trailing enter 금지).
- "저도 ~" "~더라구요" 같은 경험담 1줄 자연스럽게.
- ㅋㅋ ㅠㅠ ㅎㅎ 자연스럽게 흘려쓰기 OK (페르소나가 캐주얼할 때).
- 반말/존댓말은 페르소나 따라가되 트위터는 덜 격식.
- **해시태그 절대 금지**.
- **@멘션 금지** (답글이라 자동으로 달림).
- 이모지 최대 2개.
  `.trim(),
  examples: [
    `아 그 황토 느낌 진짜 공감ㅠㅠ 쿠션 산화 속도 미쳤어요. 저는 이제 3개월 지나면 그냥 새 거 갑니다, 저장해두면 결국 다 그렇게 되더라구요`,
    `코팩 쓰지 마요 진짜… 저도 3년 썼는데 그 순간만이고 모공만 더 늘어남. 클렌징밤으로 매일 녹여내는 게 장기적으론 훨씬 나아요`,
    `클린잇제로 오리지널 입문용으로 최고 맞아요 ㅋㅋ 여행용 단지라 샐 걱정 없는 것도 완전 공감. 화장 진한 날만 더블클렌징 추가하면 됨`,
  ],
};

// --------------- Instagram ---------------
const INSTAGRAM: PlatformToneSpec = {
  label: "Instagram",
  emojiBudget: 5,
  rules: `
- **감성적·따뜻한 톤**. 부드럽게 공감 → 짧은 경험담 → 따뜻한 마무리.
- **줄바꿈 리듬**. 1-2 문장마다 줄바꿈, 호흡 있게.
- 감성 이모지 2-5개 허용 (💕 🤍 ✨ 🌸 🫧). 얼굴 이모지(😂😭)는 지양.
- 문장 끝에 이모지로 톤 마무리 OK ("~해요 🤍" "~더라구요 ✨").
- 오프너: 바로 공감 한 줄 or "아 이 글 너무 공감 🤍" 같은 한 마디.
- **해시태그 2-4개** 끝에 한 줄 띄우고 달기 (#클린잇제로 #데일리클렌징 같은 관련 태그).
- 길이는 3-6줄 정도. 너무 길면 인스타답지 않음.
  `.trim(),
  examples: [
    `저도 클린잇제로 진심 사랑해요 🤍
여행 갈 때마다 이거 하나만 챙기면 끝이에요
단지형이라 샐 걱정도 없구요 ✨

#클린잇제로 #클렌징밤 #여행템`,
    `그 쩍쩍 갈라지는 느낌 너무 알아요 🫧
저도 장벽 한번 무너지고 나서 덜 바르는 쪽으로 싹 정리했어요
지금은 토너-에센스-크림 세 개가 전부인데 훨씬 안정적이에요 💕

#민감성피부 #스킨케어루틴 #바닐라코`,
    `쿠션 산화 너무 빠르죠 🥲
저는 3개월 룰 만들고 나서부터 황토 현상 거의 안 겪어요
아까워도 시간 지나면 갈아주는 게 답이더라구요 ✨

#쿠션팩트 #메이크업팁`,
  ],
};

// --------------- Reddit ---------------
const REDDIT: PlatformToneSpec = {
  label: "Reddit",
  emojiBudget: 1,
  rules: `
- **구조적이고 긴 답변**. 경험담 → 근거/디테일 → 결론 or TL;DR.
- **문단 2-4개**, 문단 사이 빈 줄로 분리.
- 한국 뷰티 서브라면 존댓말 기본, 건조한 "~음/함" 체도 자연스러움.
- 수치·브랜드 비교·성분 언급 환영 ("나이아신아마이드 5%", "vs OOO").
- **이모지 최소** (0-1개). 감탄 이모지는 Reddit에선 튐.
- 끝에 \`TL;DR: ~\` 한 줄 추가해도 좋음 (필수는 아님).
- 해시태그 금지.
- 사용자 질문에 바로 답하는 첫 문단 + 이유/경험 풀어쓰는 뒷 문단 구조.
  `.trim(),
  examples: [
    `저도 비슷한 고민으로 한 1년 여러 제품 돌려봤는데요,

클린잇제로 오리지널은 틴트·워터프루프 마스카라 빼면 더블클렌징 없이도 거의 다 녹여요. 단점은 단지형이라 위생 이슈 — 스패출러 꼭 같이 쓰세요. 손가락으로 퍼내면 3주 안에 상태 나빠집니다.

모공 신경 쓰이면 같은 라인 퓨어리파잉(파란색)으로 가세요. BHA/나이아신아마이드 들어가서 저는 블랙헤드 체감 줄었어요.

TL;DR: 오리지널 입문용, 모공은 퓨어리파잉.`,
    `쿠션 산화 빠른 건 제품 잘못이라기보단 공기 접촉 + 손·퍼프 오염 복합 원인이에요.

제가 써본 제품 중엔 거의 다 2-3개월 지나면 톤 떨어지더라구요. 요즘은 그냥 소용량으로 사고 3개월 룰 만들어서 돌리는 중입니다. 리필 있는 라인이 장기적으론 가성비 낫고요.

특히 여름엔 더 빨리 산화되니까 냉장 보관도 고려해보세요.`,
  ],
};

// --------------- YouTube ---------------
const YOUTUBE: PlatformToneSpec = {
  label: "YouTube",
  emojiBudget: 3,
  rules: `
- **영상 콘텐츠 반응**이 기본 — "영상 잘 봤어요~" "이 부분 공감돼요" 같은 오프너 자연스러움.
- **존댓말 기본**. 시청자 POV.
- 짧은 문단 1-2개, 3-5줄 정도.
- 이모지 2-3개 OK (👍 ✨ 🙏 💕).
- 질문이나 다음 영상 요청으로 마무리하는 패턴 자연스러움 ("~편도 궁금해요!").
- 해시태그 없음.
- 너무 격식 차리지 말고 구독자 톤으로.
  `.trim(),
  examples: [
    `영상 잘 봤어요~ 저도 클린잇제로 오리지널 3년째 쓰는 중인데 진짜 공감이에요 👍 혹시 퓨어리파잉(파란색) 버전이랑 비교 영상도 가능할까요? 모공 신경 쓰이는 사람들 궁금해할 것 같아요!`,
    `쿠션 산화 얘기 너무 유용했어요 ✨ 저도 아까워서 계속 쓰다가 톤 무너진 경험 있어서 ㅠㅠ 앞으로는 3개월 룰 지켜볼게요. 다음에 쿠션 종류별 산화 속도 비교도 보고 싶어요!`,
    `장벽 무너졌을 때 덜 바르는 게 답이라는 말 진짜 백 번 공감합니다 🙏 저도 7단계 루틴 하다가 지금은 3단계로 정리했는데 피부가 훨씬 편해졌어요. 민감성 전용 루틴 편도 부탁드려요 💕`,
  ],
};

export const PLATFORM_TONES: Record<Platform, PlatformToneSpec> = {
  twitter: TWITTER,
  instagram: INSTAGRAM,
  reddit: REDDIT,
  youtube: YOUTUBE,
};

/**
 * Build a platform-tone prompt fragment that overrides humanize defaults
 * for the target platform. Append this to the system prompt AFTER HUMANIZE_RULES
 * so later instructions take precedence.
 */
export function buildPlatformTonePrompt(platform: Platform): string {
  const spec = PLATFORM_TONES[platform];
  const examples = spec.examples
    .map((e, i) => `### 예시 ${i + 1}\n"""\n${e}\n"""`)
    .join("\n\n");

  return `
## ${spec.label} 플랫폼 톤 (이 규칙이 위의 humanize 기본값을 덮어씁니다)

${spec.rules}

### 이모지 예산
이 플랫폼에선 이모지 **최대 ${spec.emojiBudget}개**까지 허용 (humanize 기본 3개 규칙 무시하고 이 숫자를 따르세요).

### 이 플랫폼에서 자연스러운 답글 예시 (톤·구조 참고용, 내용 복사 X)

${examples}

위 예시의 **말투·길이·줄바꿈·이모지 사용 패턴**을 따르세요. 단, 문장·내용은 복사하지 말고 지금 답변할 원본 글에 맞게 새로 쓰세요.
  `.trim();
}
