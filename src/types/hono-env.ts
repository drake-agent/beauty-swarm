// Hono context Variables — typed so c.get("apiKey") compiles under strict mode.
// Populated by src/middleware/auth.ts.

import "hono";

declare module "hono" {
  interface ContextVariableMap {
    apiKey: string;
    apiKeyRow: { rate_limit_per_min: number; user_id: string | null; label: string };
    userId: string | null;
  }
}
