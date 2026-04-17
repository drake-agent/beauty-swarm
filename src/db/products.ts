import type pg from "pg";
import { getPool } from "./schema.js";

export interface ProductRow {
  id: string;
  name: string;
  name_en: string;
  line: string;
  category: string;
  routine_step: string;
  description: string;
  key_ingredients: string[];
  addresses: string[];
  skin_type_fit: string[];
  price_krw: number | null;
  price_range: string;
  size_ml: number;
  hero_product: boolean;
  tagline: string;
  in_stock: boolean;
  url: string | null;
}

export async function seedProducts(products: ProductRow[]): Promise<void> {
  const pool = getPool();

  const query = `
    INSERT INTO products
    (id, name, name_en, line, category, routine_step, description,
     key_ingredients, addresses, skin_type_fit, price_krw, price_range,
     size_ml, hero_product, tagline, in_stock, url, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      name_en = EXCLUDED.name_en,
      line = EXCLUDED.line,
      category = EXCLUDED.category,
      routine_step = EXCLUDED.routine_step,
      description = EXCLUDED.description,
      key_ingredients = EXCLUDED.key_ingredients,
      addresses = EXCLUDED.addresses,
      skin_type_fit = EXCLUDED.skin_type_fit,
      price_krw = EXCLUDED.price_krw,
      price_range = EXCLUDED.price_range,
      size_ml = EXCLUDED.size_ml,
      hero_product = EXCLUDED.hero_product,
      tagline = EXCLUDED.tagline,
      in_stock = EXCLUDED.in_stock,
      url = EXCLUDED.url,
      updated_at = NOW()
  `;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const p of products) {
      await client.query(query, [
        p.id, p.name, p.name_en, p.line, p.category, p.routine_step,
        p.description, JSON.stringify(p.key_ingredients), JSON.stringify(p.addresses),
        JSON.stringify(p.skin_type_fit), p.price_krw, p.price_range,
        p.size_ml, p.hero_product, p.tagline, p.in_stock, p.url,
      ]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getAllProducts(): Promise<ProductRow[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM products WHERE in_stock = TRUE"
  );
  return rows;
}

export async function getProductById(id: string): Promise<ProductRow | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM products WHERE id = $1",
    [id]
  );
  return rows[0] || null;
}

// =====================================================================
// [ARCH-2] CRUD with audit logging. Every mutation runs in a transaction
// that also writes to products_audit with before/after snapshots.
// =====================================================================

type AuditAction = "create" | "update" | "stock_toggle" | "delete";

async function writeAudit(
  client: pg.PoolClient,
  action: AuditAction,
  productId: string,
  before: ProductRow | null,
  after: ProductRow | null,
  changedBy: string
): Promise<void> {
  await client.query(
    `INSERT INTO products_audit (product_id, action, before_snapshot, after_snapshot, changed_by)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)`,
    [
      productId,
      action,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      changedBy,
    ]
  );
}

async function fetchProductTx(client: pg.PoolClient, id: string): Promise<ProductRow | null> {
  const { rows } = await client.query("SELECT * FROM products WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function createProduct(p: ProductRow, changedBy = "admin"): Promise<ProductRow> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO products
       (id, name, name_en, line, category, routine_step, description,
        key_ingredients, addresses, skin_type_fit, price_krw, price_range,
        size_ml, hero_product, tagline, in_stock, url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$17)`,
      [
        p.id, p.name, p.name_en, p.line, p.category, p.routine_step, p.description,
        JSON.stringify(p.key_ingredients), JSON.stringify(p.addresses),
        JSON.stringify(p.skin_type_fit), p.price_krw, p.price_range,
        p.size_ml, p.hero_product, p.tagline, p.in_stock, p.url,
      ]
    );
    const after = await fetchProductTx(client, p.id);
    await writeAudit(client, "create", p.id, null, after, changedBy);
    await client.query("COMMIT");
    return after!;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Fields that /admin/products can PATCH. `id` is not editable.
export type ProductPatch = Partial<Omit<ProductRow, "id">>;

export async function updateProduct(
  id: string,
  patch: ProductPatch,
  changedBy = "admin"
): Promise<ProductRow | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const before = await fetchProductTx(client, id);
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    const jsonbKeys = new Set(["key_ingredients", "addresses", "skin_type_fit"]);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      if (jsonbKeys.has(key)) {
        sets.push(`${key} = $${idx}::jsonb`);
        params.push(JSON.stringify(value));
      } else {
        sets.push(`${key} = $${idx}`);
        params.push(value);
      }
      idx++;
    }
    if (sets.length === 0) {
      await client.query("ROLLBACK");
      return before;
    }
    sets.push("updated_at = NOW()");
    params.push(id);

    await client.query(`UPDATE products SET ${sets.join(", ")} WHERE id = $${idx}`, params);
    const after = await fetchProductTx(client, id);

    // If only `in_stock` changed, tag it as stock_toggle for easier querying.
    const action: AuditAction =
      Object.keys(patch).length === 1 && "in_stock" in patch ? "stock_toggle" : "update";

    await writeAudit(client, action, id, before, after, changedBy);
    await client.query("COMMIT");
    return after;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Soft delete — flips in_stock=FALSE. Hard delete not exposed (audit-trail preserves rows). */
export async function softDeleteProduct(id: string, changedBy = "admin"): Promise<ProductRow | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const before = await fetchProductTx(client, id);
    if (!before) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query(
      "UPDATE products SET in_stock = FALSE, updated_at = NOW() WHERE id = $1",
      [id]
    );
    const after = await fetchProductTx(client, id);
    await writeAudit(client, "delete", id, before, after, changedBy);
    await client.query("COMMIT");
    return after;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface AuditEntry {
  id: number;
  product_id: string;
  action: AuditAction;
  before_snapshot: ProductRow | null;
  after_snapshot: ProductRow | null;
  changed_by: string;
  changed_at: string;
}

export async function getProductHistory(productId: string, limit = 50): Promise<AuditEntry[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM products_audit WHERE product_id = $1 ORDER BY changed_at DESC LIMIT $2`,
    [productId, limit]
  );
  return rows;
}

export async function getRecentAudit(limit = 50): Promise<AuditEntry[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM products_audit ORDER BY changed_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

/** Return EVERY product, in-stock or not — for admin UIs only. */
export async function getAllProductsIncludingOutOfStock(): Promise<ProductRow[]> {
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM products ORDER BY id");
  return rows;
}

export async function searchProducts(query: {
  concern?: string;
  ingredient?: string;
  skin_type?: string;
  line?: string;
  category?: string;
}): Promise<ProductRow[]> {
  const pool = getPool();
  const conditions: string[] = ["in_stock = TRUE"];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (query.concern) {
    conditions.push(`addresses @> $${paramIdx}::jsonb`);
    params.push(JSON.stringify([query.concern]));
    paramIdx++;
  }
  if (query.ingredient) {
    conditions.push(`key_ingredients @> $${paramIdx}::jsonb`);
    params.push(JSON.stringify([query.ingredient]));
    paramIdx++;
  }
  if (query.skin_type) {
    conditions.push(
      `(skin_type_fit @> $${paramIdx}::jsonb OR skin_type_fit @> '"all"'::jsonb)`
    );
    params.push(JSON.stringify([query.skin_type]));
    paramIdx++;
  }
  if (query.line) {
    conditions.push(`line = $${paramIdx}`);
    params.push(query.line);
    paramIdx++;
  }
  if (query.category) {
    conditions.push(`category = $${paramIdx}`);
    params.push(query.category);
    paramIdx++;
  }

  const sql = `SELECT * FROM products WHERE ${conditions.join(" AND ")}`;
  const { rows } = await pool.query(sql, params);
  return rows;
}
