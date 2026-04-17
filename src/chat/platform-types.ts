// [STRUCT-1] Platform types & limits live in the domain layer (chat/), not
// in api/. The HTTP edge consumes these; `platform-tone.ts` and any future
// non-HTTP caller can import without dragging in Hono.

export type Platform = "twitter" | "reddit" | "instagram" | "youtube";

export const VALID_PLATFORMS: Platform[] = ["twitter", "reddit", "instagram", "youtube"];

export const PLATFORM_LIMITS: Record<Platform, number> = {
  twitter: 280,
  reddit: 10000,
  instagram: 2200,
  youtube: 10000,
};

// [STRUCT-10] Named budget for Twitter thread markers like " (1/10)" —
// ~6 chars conservative. splitForTwitter uses (PLATFORM_LIMITS.twitter - this).
export const TWITTER_THREAD_MARKER_BUDGET = 10;
export const TWITTER_THREAD_LIMIT = PLATFORM_LIMITS.twitter - TWITTER_THREAD_MARKER_BUDGET;
