export interface PainPointVariant {
  id: string;
  label: string;
  keywords: string[];
}

export interface PainPointCategory {
  id: string;
  name: string;
  description: string;
  variants: PainPointVariant[];
  related_ingredients: string[];
  related_products: string[];
}

export interface Ingredient {
  id: string;
  name: string;
  name_en: string;
  category: string;
  mechanism: string;
  benefits: string[];
  addresses: string[];
  safety_rating: "excellent" | "good" | "moderate";
  ewa_grade: string;
}

export interface Product {
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
  price_range: "low" | "mid" | "mid-high" | "high";
  size_ml: number;
  hero_product: boolean;
  tagline: string;
}

export interface GraphQueryResult {
  painPoints: PainPointCategory[];
  ingredients: Ingredient[];
  products: Product[];
  connections: GraphConnection[];
}

export interface GraphConnection {
  from: { type: "pain-point" | "ingredient" | "product"; id: string };
  to: { type: "pain-point" | "ingredient" | "product"; id: string };
  relation: string;
}

export type GraphStrategy =
  | "ingredient-first"
  | "experience-first"
  | "minimal-routine"
  | "cost-effective"
  | "safety-first";
