import { getDb } from "./schema.js";

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

export function createUser(apiKey: string, name?: string): UserProfile {
  const db = getDb();
  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO users (id, api_key, name, concerns, allergies, preferences)
     VALUES (?, ?, ?, '[]', '[]', '{}')`,
    [id, apiKey, name || null]
  );
  return {
    id, api_key: apiKey, name: name || null,
    skin_type: null, age_group: null,
    concerns: [], allergies: [], preferences: {},
  };
}

export function getUserByApiKey(apiKey: string): UserProfile | null {
  const db = getDb();
  const row = db.query("SELECT * FROM users WHERE api_key = ?").get(apiKey) as any;
  return row ? parseUser(row) : null;
}

export function getUserById(id: string): UserProfile | null {
  const db = getDb();
  const row = db.query("SELECT * FROM users WHERE id = ?").get(id) as any;
  return row ? parseUser(row) : null;
}

export function updateUserProfile(
  id: string,
  updates: Partial<Pick<UserProfile, "name" | "skin_type" | "age_group" | "concerns" | "allergies" | "preferences">>
): UserProfile | null {
  const db = getDb();
  const sets: string[] = [];
  const params: any[] = [];

  if (updates.name !== undefined) { sets.push("name = ?"); params.push(updates.name); }
  if (updates.skin_type !== undefined) { sets.push("skin_type = ?"); params.push(updates.skin_type); }
  if (updates.age_group !== undefined) { sets.push("age_group = ?"); params.push(updates.age_group); }
  if (updates.concerns !== undefined) { sets.push("concerns = ?"); params.push(JSON.stringify(updates.concerns)); }
  if (updates.allergies !== undefined) { sets.push("allergies = ?"); params.push(JSON.stringify(updates.allergies)); }
  if (updates.preferences !== undefined) { sets.push("preferences = ?"); params.push(JSON.stringify(updates.preferences)); }

  if (sets.length === 0) return getUserById(id);

  sets.push("updated_at = datetime('now')");
  params.push(id);

  db.run(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, params);
  return getUserById(id);
}

function parseUser(row: any): UserProfile {
  return {
    ...row,
    concerns: JSON.parse(row.concerns || "[]"),
    allergies: JSON.parse(row.allergies || "[]"),
    preferences: JSON.parse(row.preferences || "{}"),
  };
}
