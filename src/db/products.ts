import { getDb } from "./schema.js";

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

export function seedProducts(products: ProductRow[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO products
    (id, name, name_en, line, category, routine_step, description,
     key_ingredients, addresses, skin_type_fit, price_krw, price_range,
     size_ml, hero_product, tagline, in_stock, url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const tx = db.transaction(() => {
    for (const p of products) {
      stmt.run(
        p.id, p.name, p.name_en, p.line, p.category, p.routine_step,
        p.description, JSON.stringify(p.key_ingredients), JSON.stringify(p.addresses),
        JSON.stringify(p.skin_type_fit), p.price_krw, p.price_range,
        p.size_ml, p.hero_product ? 1 : 0, p.tagline, p.in_stock ? 1 : 0, p.url
      );
    }
  });
  tx();
}

export function getAllProducts(): ProductRow[] {
  const db = getDb();
  const rows = db.query("SELECT * FROM products WHERE in_stock = 1").all() as any[];
  return rows.map(parseRow);
}

export function getProductById(id: string): ProductRow | null {
  const db = getDb();
  const row = db.query("SELECT * FROM products WHERE id = ?").get(id) as any;
  return row ? parseRow(row) : null;
}

export function searchProducts(query: {
  concern?: string;
  ingredient?: string;
  skin_type?: string;
  line?: string;
  category?: string;
}): ProductRow[] {
  const db = getDb();
  const conditions: string[] = ["in_stock = 1"];
  const params: string[] = [];

  if (query.concern) {
    conditions.push("addresses LIKE ?");
    params.push(`%"${query.concern}"%`);
  }
  if (query.ingredient) {
    conditions.push("key_ingredients LIKE ?");
    params.push(`%"${query.ingredient}"%`);
  }
  if (query.skin_type) {
    conditions.push("(skin_type_fit LIKE ? OR skin_type_fit LIKE '%\"all\"%')");
    params.push(`%"${query.skin_type}"%`);
  }
  if (query.line) {
    conditions.push("line = ?");
    params.push(query.line);
  }
  if (query.category) {
    conditions.push("category = ?");
    params.push(query.category);
  }

  const sql = `SELECT * FROM products WHERE ${conditions.join(" AND ")}`;
  const rows = db.query(sql).all(...params) as any[];
  return rows.map(parseRow);
}

function parseRow(row: any): ProductRow {
  return {
    ...row,
    key_ingredients: JSON.parse(row.key_ingredients),
    addresses: JSON.parse(row.addresses),
    skin_type_fit: JSON.parse(row.skin_type_fit),
    hero_product: row.hero_product === 1,
    in_stock: row.in_stock === 1,
  };
}
