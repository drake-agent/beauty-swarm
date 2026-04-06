import { getPool } from "./schema.js";

export interface UserProfile {
  id: string;
  api_key: string;
  name: string | null;
  skin_type: string | null;
  age_group: string | null;
  concerns: string[];
  allergies: string[];
  preferences: Record<string, unknown>;
}

export async function createUser(apiKey: string, name?: string): Promise<UserProfile> {
  const pool = getPool();
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO users (id, api_key, name) VALUES ($1, $2, $3)`,
    [id, apiKey, name || null]
  );
  return {
    id, api_key: apiKey, name: name || null,
    skin_type: null, age_group: null,
    concerns: [], allergies: [], preferences: {},
  };
}

export async function getUserByApiKey(apiKey: string): Promise<UserProfile | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM users WHERE api_key = $1",
    [apiKey]
  );
  return rows[0] || null;
}

export async function getUserById(id: string): Promise<UserProfile | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM users WHERE id = $1",
    [id]
  );
  return rows[0] || null;
}

export async function updateUserProfile(
  id: string,
  updates: Partial<Pick<UserProfile, "name" | "skin_type" | "age_group" | "concerns" | "allergies" | "preferences">>
): Promise<UserProfile | null> {
  const pool = getPool();
  const sets: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (updates.name !== undefined) {
    sets.push(`name = $${paramIdx}`); params.push(updates.name); paramIdx++;
  }
  if (updates.skin_type !== undefined) {
    sets.push(`skin_type = $${paramIdx}`); params.push(updates.skin_type); paramIdx++;
  }
  if (updates.age_group !== undefined) {
    sets.push(`age_group = $${paramIdx}`); params.push(updates.age_group); paramIdx++;
  }
  if (updates.concerns !== undefined) {
    sets.push(`concerns = $${paramIdx}::jsonb`); params.push(JSON.stringify(updates.concerns)); paramIdx++;
  }
  if (updates.allergies !== undefined) {
    sets.push(`allergies = $${paramIdx}::jsonb`); params.push(JSON.stringify(updates.allergies)); paramIdx++;
  }
  if (updates.preferences !== undefined) {
    sets.push(`preferences = $${paramIdx}::jsonb`); params.push(JSON.stringify(updates.preferences)); paramIdx++;
  }

  if (sets.length === 0) return getUserById(id);

  sets.push("updated_at = NOW()");
  params.push(id);

  await pool.query(
    `UPDATE users SET ${sets.join(", ")} WHERE id = $${paramIdx}`,
    params
  );
  return getUserById(id);
}
