import type { GraphStrategy } from "../knowledge/types.js";

export interface PersonaStyle {
  tone: string;
  formality: "low" | "medium" | "high";
  emoji_use: "none" | "minimal" | "moderate" | "heavy";
  response_length: "concise" | "moderate" | "detailed";
  catchphrase: string;
}

export interface RecommendationBias {
  priority: string[];
  avoids: string[];
}

export interface PersonaBackstory {
  age: string;
  skin_type: string;
  main_concern: string;
  journey: string;
  turning_point: string;
  current_routine: string[];
  failed_products: string[];
  holy_grail: string;
}

export interface PersonaProfile {
  id: string;
  name: string;
  role: string;
  avatar: string;
  backstory: PersonaBackstory;
  expertise: string[];
  style: PersonaStyle;
  recommendation_bias: RecommendationBias;
  graph_strategy: GraphStrategy;
  pain_point_affinity: string[];
  system_prompt_template: string;
}

export interface PersonaSummary {
  id: string;
  name: string;
  role: string;
  avatar: string;
  description: string;
  backstory_summary: string;
  pain_point_affinity: string[];
}
