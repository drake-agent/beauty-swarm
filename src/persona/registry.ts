import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import type { PersonaProfile, PersonaSummary } from "./types.js";

const PROFILES_DIR = join(
  import.meta.dir ?? new URL(".", import.meta.url).pathname,
  "profiles"
);

export class PersonaRegistry {
  private personas: Map<string, PersonaProfile> = new Map();

  constructor() {
    this.loadAll();
  }

  private loadAll(): void {
    const files = readdirSync(PROFILES_DIR).filter((f) => f.endsWith(".yaml"));
    for (const file of files) {
      const raw = readFileSync(join(PROFILES_DIR, file), "utf-8");
      const profile = parse(raw) as PersonaProfile;
      this.personas.set(profile.id, profile);
    }
  }

  reload(): void {
    this.personas.clear();
    this.loadAll();
  }

  get(id: string): PersonaProfile | undefined {
    return this.personas.get(id);
  }

  getAll(): PersonaProfile[] {
    return [...this.personas.values()];
  }

  list(): PersonaSummary[] {
    return this.getAll().map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      avatar: p.avatar,
      description: p.style.catchphrase,
      backstory_summary: `${p.backstory.age} / ${p.backstory.skin_type} / ${p.backstory.main_concern}`,
      pain_point_affinity: p.pain_point_affinity,
    }));
  }

  findBestForPainPoints(painPointIds: string[]): PersonaProfile[] {
    return this.getAll()
      .map((persona) => {
        const matchCount = persona.pain_point_affinity.filter((aff) =>
          painPointIds.includes(aff)
        ).length;
        return { persona, matchCount };
      })
      .sort((a, b) => b.matchCount - a.matchCount)
      .map((entry) => entry.persona);
  }
}
