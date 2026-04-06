import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-20250514";

let client: Anthropic | null = null;

const SKIN_ANALYSIS_PROMPT = `당신은 피부 상태를 분석하는 AI입니다.
사용자가 보낸 피부/얼굴 사진을 보고 다음을 분석하세요.

## 분석 항목
1. 감지되는 피부 고민 (아래 카테고리에서 선택)
2. 추정 피부 타입
3. 주요 관심 부위

## 피부 고민 카테고리
pore, dullness, oiliness, dryness, sensitivity, acne, aging, pigmentation

## 출력 형식 (JSON만)
{
  "detected_concerns": ["concern_id", ...],
  "skin_type_estimate": "dry|oily|combination|normal|sensitive",
  "severity": "mild|moderate|severe",
  "key_observations": ["관찰 1", "관찰 2", ...],
  "recommended_focus": "가장 우선 관리할 부분 한 문장"
}

## 주의사항
- 의학적 진단이 아님을 명심
- 사진 품질이 낮으면 confidence를 낮게 반환
- 피부 사진이 아닌 경우 "not_skin_image" 에러 반환`;

export interface SkinAnalysisResult {
  detected_concerns: string[];
  skin_type_estimate: string;
  severity: string;
  key_observations: string[];
  recommended_focus: string;
}

export async function analyzeSkinImage(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"
): Promise<SkinAnalysisResult> {
  if (!client) client = new Anthropic();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: SKIN_ANALYSIS_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: "이 피부 사진을 분석해주세요.",
          },
        ],
      },
    ],
  });

  const text = response.content[0];
  if (text.type !== "text") throw new Error("No text response");

  const jsonMatch = text.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse analysis result");

  return JSON.parse(jsonMatch[0]) as SkinAnalysisResult;
}

export async function analyzeSkinImageFromUrl(
  imageUrl: string
): Promise<SkinAnalysisResult> {
  if (!client) client = new Anthropic();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: SKIN_ANALYSIS_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "url",
              url: imageUrl,
            },
          },
          {
            type: "text",
            text: "이 피부 사진을 분석해주세요.",
          },
        ],
      },
    ],
  });

  const text = response.content[0];
  if (text.type !== "text") throw new Error("No text response");

  const jsonMatch = text.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse analysis result");

  return JSON.parse(jsonMatch[0]) as SkinAnalysisResult;
}
