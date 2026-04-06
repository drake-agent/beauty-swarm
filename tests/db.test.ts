import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";

// Use in-memory DB for tests
let db: Database;

beforeAll(() => {
  db = new Database(":memory:");
  db.run("PRAGMA foreign_keys = ON");

  db.run(`CREATE TABLE products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_en TEXT NOT NULL,
    line TEXT NOT NULL,
    category TEXT NOT NULL,
    routine_step TEXT NOT NULL,
    description TEXT NOT NULL,
    key_ingredients TEXT NOT NULL,
    addresses TEXT NOT NULL,
    skin_type_fit TEXT NOT NULL,
    price_krw INTEGER,
    price_range TEXT NOT NULL,
    size_ml INTEGER NOT NULL,
    hero_product INTEGER NOT NULL DEFAULT 0,
    tagline TEXT NOT NULL,
    in_stock INTEGER NOT NULL DEFAULT 1,
    url TEXT
  )`);

  db.run(`CREATE TABLE users (
    id TEXT PRIMARY KEY,
    api_key TEXT UNIQUE NOT NULL,
    name TEXT,
    skin_type TEXT,
    age_group TEXT,
    concerns TEXT DEFAULT '[]',
    allergies TEXT DEFAULT '[]',
    preferences TEXT DEFAULT '{}'
  )`);

  db.run(`CREATE TABLE api_keys (
    key TEXT PRIMARY KEY,
    user_id TEXT,
    label TEXT NOT NULL,
    rate_limit_per_min INTEGER NOT NULL DEFAULT 30,
    is_active INTEGER NOT NULL DEFAULT 1
  )`);

  db.run(`CREATE TABLE usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key TEXT,
    endpoint TEXT NOT NULL,
    persona_id TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    status_code INTEGER NOT NULL DEFAULT 200,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
});

afterAll(() => {
  db.close();
});

describe("Products DB", () => {
  test("insert and query product", () => {
    db.run(
      `INSERT INTO products (id, name, name_en, line, category, routine_step, description, key_ingredients, addresses, skin_type_fit, price_krw, price_range, size_ml, hero_product, tagline)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ["test-product", "테스트", "Test", "test-line", "cleansing", "1st-cleanse",
       "Test product", '["niacinamide"]', '["pore"]', '["all"]',
       22000, "mid", 100, 1, "Test tagline"]
    );

    const row = db.query("SELECT * FROM products WHERE id = ?").get("test-product") as any;
    expect(row).toBeDefined();
    expect(row.name).toBe("테스트");
    expect(JSON.parse(row.key_ingredients)).toEqual(["niacinamide"]);
    expect(row.hero_product).toBe(1);
    expect(row.price_krw).toBe(22000);
  });

  test("search by concern", () => {
    const rows = db.query(
      `SELECT * FROM products WHERE addresses LIKE ? AND in_stock = 1`
    ).all('%"pore"%') as any[];
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Users DB", () => {
  test("create user", () => {
    const id = crypto.randomUUID();
    db.run(
      `INSERT INTO users (id, api_key, name, skin_type, concerns) VALUES (?, ?, ?, ?, ?)`,
      [id, "test_key_123", "테스트유저", "oily", '["pore","oiliness"]']
    );

    const user = db.query("SELECT * FROM users WHERE api_key = ?").get("test_key_123") as any;
    expect(user).toBeDefined();
    expect(user.name).toBe("테스트유저");
    expect(JSON.parse(user.concerns)).toEqual(["pore", "oiliness"]);
  });

  test("update user profile", () => {
    db.run(
      `UPDATE users SET skin_type = ?, allergies = ? WHERE api_key = ?`,
      ["combination", '["fragrance"]', "test_key_123"]
    );

    const user = db.query("SELECT * FROM users WHERE api_key = ?").get("test_key_123") as any;
    expect(user.skin_type).toBe("combination");
    expect(JSON.parse(user.allergies)).toEqual(["fragrance"]);
  });
});

describe("API Keys", () => {
  test("create and validate api key", () => {
    db.run(
      `INSERT INTO api_keys (key, label, rate_limit_per_min) VALUES (?, ?, ?)`,
      ["bpc_testkey123", "test", 60]
    );

    const key = db.query(
      "SELECT * FROM api_keys WHERE key = ? AND is_active = 1"
    ).get("bpc_testkey123") as any;
    expect(key).toBeDefined();
    expect(key.rate_limit_per_min).toBe(60);
  });
});

describe("Usage Logs", () => {
  test("log usage entry", () => {
    db.run(
      `INSERT INTO usage_logs (api_key, endpoint, persona_id, input_tokens, output_tokens, cost_usd, latency_ms, status_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ["bpc_testkey123", "POST /chat", "pore-unni", 1500, 500, 0.012, 1200, 200]
    );

    const logs = db.query("SELECT * FROM usage_logs").all() as any[];
    expect(logs.length).toBe(1);
    expect(logs[0].persona_id).toBe("pore-unni");
    expect(logs[0].cost_usd).toBe(0.012);
  });

  test("aggregate usage stats", () => {
    // Add more entries
    db.run(
      `INSERT INTO usage_logs (api_key, endpoint, persona_id, input_tokens, output_tokens, cost_usd, latency_ms, status_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ["bpc_testkey123", "POST /panel", "oil-fighter", 3000, 1000, 0.024, 2500, 200]
    );

    const summary = db.query(`
      SELECT COUNT(*) as total, SUM(cost_usd) as total_cost, AVG(latency_ms) as avg_latency
      FROM usage_logs
    `).get() as any;

    expect(summary.total).toBe(2);
    expect(summary.total_cost).toBeCloseTo(0.036, 3);
    expect(summary.avg_latency).toBe(1850);
  });
});
