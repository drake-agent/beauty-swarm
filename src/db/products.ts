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
