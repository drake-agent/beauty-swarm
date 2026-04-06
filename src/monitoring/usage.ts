import { getDb } from "../db/schema.js";

// Claude Sonnet 4 pricing (per 1M tokens)
const PRICING = {
  input_per_million: 3.0,   // $3/1M input
  output_per_million: 15.0, // $15/1M output
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
}

export function logUsage(entry: UsageEntry): void {
  const db = getDb();
  const cost =
    (entry.input_tokens / 1_000_000) * PRICING.input_per_million +
    (entry.output_tokens / 1_000_000) * PRICING.output_per_million;

  db.run(
    `INSERT INTO usage_logs
     (api_key, endpoint, persona_id, input_tokens, output_tokens, cost_usd, latency_ms, status_code, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.api_key, entry.endpoint, entry.persona_id || null,
      entry.input_tokens, entry.output_tokens, cost,
      entry.latency_ms, entry.status_code, entry.error || null,
    ]
  );
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

export function getUsageStats(options?: {
  api_key?: string;
  since?: string; // ISO date
  until?: string;
}): UsageStats {
  const db = getDb();
  const conditions: string[] = [];
  const params: any[] = [];

  if (options?.api_key) {
    conditions.push("api_key = ?");
    params.push(options.api_key);
  }
  if (options?.since) {
    conditions.push("created_at >= ?");
    params.push(options.since);
  }
  if (options?.until) {
    conditions.push("created_at <= ?");
    params.push(options.until);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const summary = db.query(`
    SELECT
      COUNT(*) as total_requests,
      COALESCE(SUM(input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(output_tokens), 0) as total_output_tokens,
      COALESCE(SUM(cost_usd), 0) as total_cost_usd,
      COALESCE(AVG(latency_ms), 0) as avg_latency_ms,
      SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count
    FROM usage_logs ${where}
  `).get(...params) as any;

  const byEndpoint = db.query(`
    SELECT endpoint, COUNT(*) as count, COALESCE(SUM(cost_usd), 0) as cost
    FROM usage_logs ${where}
    GROUP BY endpoint
  `).all(...params) as any[];

  const byPersona = db.query(`
    SELECT persona_id, COUNT(*) as count, COALESCE(SUM(cost_usd), 0) as cost
    FROM usage_logs ${where}
    WHERE persona_id IS NOT NULL
    GROUP BY persona_id
  `).all(...params) as any[];

  return {
    total_requests: summary.total_requests,
    total_input_tokens: summary.total_input_tokens,
    total_output_tokens: summary.total_output_tokens,
    total_cost_usd: Math.round(summary.total_cost_usd * 10000) / 10000,
    avg_latency_ms: Math.round(summary.avg_latency_ms),
    error_count: summary.error_count,
    by_endpoint: Object.fromEntries(
      byEndpoint.map((r: any) => [r.endpoint, { count: r.count, cost: Math.round(r.cost * 10000) / 10000 }])
    ),
    by_persona: Object.fromEntries(
      byPersona.map((r: any) => [r.persona_id, { count: r.count, cost: Math.round(r.cost * 10000) / 10000 }])
    ),
  };
}

export function getRecentLogs(limit: number = 50): any[] {
  const db = getDb();
  return db.query(
    `SELECT * FROM usage_logs ORDER BY created_at DESC LIMIT ?`
  ).all(limit) as any[];
}
