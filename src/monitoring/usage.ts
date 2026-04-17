import { getPool } from "../db/schema.js";

// Claude Sonnet 4 pricing (per 1M tokens)
const PRICING = {
  input_per_million: 3.0,
  output_per_million: 15.0,
};

export interface UsageEntry {
  api_key: string | null;
  endpoint: string;
  persona_id?: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  status_code: number;
  error?: string;
  guardrail_mode?: string;
  guardrail_level?: string;
  intent?: string;
}

// [SEC-13] Redact anything resembling an API key before persisting to logs.
// Keeps accidental secret-leakage out of the usage_logs table.
const KEY_PATTERNS = [
  /bpc_[a-f0-9]{16,}/gi,              // beauty-swarm keys
  /sk-ant-[A-Za-z0-9_\-]+/g,          // Anthropic keys
  /Bearer\s+[A-Za-z0-9_\-]{20,}/gi,   // Any Bearer token
];
function sanitizeError(raw: string | undefined): string | null {
  if (!raw) return null;
  let s = raw.slice(0, 200); // truncate
  for (const re of KEY_PATTERNS) s = s.replace(re, "[REDACTED]");
  return s;
}

// [SEC-3 / SEC-12] Store only the key prefix in usage_logs, never the plaintext.
// Callers still pass the full key for convenience; we truncate here.
function maskApiKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.length > 12 ? raw.slice(0, 12) : raw;
}

export function logUsage(entry: UsageEntry): void {
  const pool = getPool();
  const cost =
    (entry.input_tokens / 1_000_000) * PRICING.input_per_million +
    (entry.output_tokens / 1_000_000) * PRICING.output_per_million;

  // Fire-and-forget — don't block the response
  pool.query(
    `INSERT INTO usage_logs
     (api_key, endpoint, persona_id, input_tokens, output_tokens, cost_usd, latency_ms, status_code, error, guardrail_mode, guardrail_level, intent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      maskApiKey(entry.api_key), entry.endpoint, entry.persona_id || null,
      entry.input_tokens, entry.output_tokens, cost,
      entry.latency_ms, entry.status_code, sanitizeError(entry.error),
      entry.guardrail_mode || null, entry.guardrail_level || null, entry.intent || null,
    ]
  ).catch((err) => {
    console.error("Failed to log usage:", err.message);
  });
}

export interface UsageStats {
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  avg_latency_ms: number;
  error_count: number;
  by_endpoint: Record<string, { count: number; cost: number }>;
  by_persona: Record<string, { count: number; cost: number }>;
}

export async function getUsageStats(options?: {
  api_key?: string;
  since?: string;
  until?: string;
}): Promise<UsageStats> {
  const pool = getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (options?.api_key) {
    conditions.push(`api_key = $${idx}`); params.push(options.api_key); idx++;
  }
  if (options?.since) {
    conditions.push(`created_at >= $${idx}`); params.push(options.since); idx++;
  }
  if (options?.until) {
    conditions.push(`created_at <= $${idx}`); params.push(options.until); idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [summaryRes, endpointRes, personaRes] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int as total_requests,
        COALESCE(SUM(input_tokens), 0)::int as total_input_tokens,
        COALESCE(SUM(output_tokens), 0)::int as total_output_tokens,
        COALESCE(SUM(cost_usd), 0)::numeric as total_cost_usd,
        COALESCE(AVG(latency_ms), 0)::int as avg_latency_ms,
        COALESCE(SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END), 0)::int as error_count
      FROM usage_logs ${where}
    `, params),
    pool.query(`
      SELECT endpoint, COUNT(*)::int as count, COALESCE(SUM(cost_usd), 0)::numeric as cost
      FROM usage_logs ${where}
      GROUP BY endpoint
    `, params),
    pool.query(`
      SELECT persona_id, COUNT(*)::int as count, COALESCE(SUM(cost_usd), 0)::numeric as cost
      FROM usage_logs ${where ? where + " AND" : "WHERE"} persona_id IS NOT NULL
      GROUP BY persona_id
    `, params),
  ]);

  const s = summaryRes.rows[0];

  return {
    total_requests: s.total_requests,
    total_input_tokens: s.total_input_tokens,
    total_output_tokens: s.total_output_tokens,
    total_cost_usd: Math.round(parseFloat(s.total_cost_usd) * 10000) / 10000,
    avg_latency_ms: s.avg_latency_ms,
    error_count: s.error_count,
    by_endpoint: Object.fromEntries(
      endpointRes.rows.map((r: any) => [r.endpoint, { count: r.count, cost: Math.round(parseFloat(r.cost) * 10000) / 10000 }])
    ),
    by_persona: Object.fromEntries(
      personaRes.rows.map((r: any) => [r.persona_id, { count: r.count, cost: Math.round(parseFloat(r.cost) * 10000) / 10000 }])
    ),
  };
}

export interface UsageLog {
  id: number;
  api_key: string | null;
  endpoint: string;
  persona_id: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number;
  status_code: number;
  error: string | null;
  created_at: string;
}

export async function getRecentLogs(limit: number = 50): Promise<UsageLog[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM usage_logs ORDER BY created_at DESC LIMIT $1",
    [limit]
  );
  return rows;
}
