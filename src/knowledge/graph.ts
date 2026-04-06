import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import type {
  PainPointCategory,
  Ingredient,
  Product,
  GraphQueryResult,
  GraphConnection,
  GraphStrategy,
} from "./types.js";

const DATA_DIR = join(import.meta.dir ?? new URL(".", import.meta.url).pathname, "..", "data");

export class KnowledgeGraph {
  private painPoints: PainPointCategory[] = [];
  private ingredients: Map<string, Ingredient> = new Map();
  private products: Map<string, Product> = new Map();

  constructor() {
    this.load();
  }

  private load(): void {
    const ppRaw = parse(readFileSync(join(DATA_DIR, "pain-points.yaml"), "utf-8"));
    this.painPoints = ppRaw.categories;

    const ingRaw = parse(readFileSync(join(DATA_DIR, "ingredients.yaml"), "utf-8"));
    for (const ing of ingRaw.ingredients) {
      this.ingredients.set(ing.id, ing);
    }

    const prodRaw = parse(readFileSync(join(DATA_DIR, "products.yaml"), "utf-8"));
    for (const prod of prodRaw.products) {
      this.products.set(prod.id, prod);
    }
  }

  detectPainPoints(userMessage: string): PainPointCategory[] {
    const lower = userMessage.toLowerCase();
    const matched: PainPointCategory[] = [];

    for (const pp of this.painPoints) {
      const hasKeyword = pp.variants.some((v) =>
        v.keywords.some((kw) => lower.includes(kw))
      );
      if (hasKeyword) {
        matched.push(pp);
      }
    }

    return matched;
  }

  queryByPainPoints(
    painPointIds: string[],
    strategy: GraphStrategy = "ingredient-first"
  ): GraphQueryResult {
    const relevantPPs = this.painPoints.filter((pp) =>
      painPointIds.includes(pp.id)
    );

    const ingredientIds = new Set<string>();
    const productIds = new Set<string>();
    const connections: GraphConnection[] = [];

    for (const pp of relevantPPs) {
      for (const ingId of pp.related_ingredients) {
        ingredientIds.add(ingId);
        connections.push({
          from: { type: "pain-point", id: pp.id },
          to: { type: "ingredient", id: ingId },
          relation: "addressed_by",
        });
      }
      for (const prodId of pp.related_products) {
        productIds.add(prodId);
        connections.push({
          from: { type: "pain-point", id: pp.id },
          to: { type: "product", id: prodId },
          relation: "recommended_product",
        });
      }
    }

    // Also find products containing the matched ingredients
    for (const [prodId, prod] of this.products) {
      const hasRelevantIngredient = prod.key_ingredients.some((ing) =>
        ingredientIds.has(ing)
      );
      if (hasRelevantIngredient) {
        productIds.add(prodId);
        for (const ingId of prod.key_ingredients) {
          if (ingredientIds.has(ingId)) {
            connections.push({
              from: { type: "product", id: prodId },
              to: { type: "ingredient", id: ingId },
              relation: "contains",
            });
          }
        }
      }
    }

    const ingredients = [...ingredientIds]
      .map((id) => this.ingredients.get(id))
      .filter((ing): ing is Ingredient => ing !== undefined);

    const products = [...productIds]
      .map((id) => this.products.get(id))
      .filter((prod): prod is Product => prod !== undefined);

    // Sort based on strategy
    this.sortByStrategy(ingredients, products, strategy);

    return {
      painPoints: relevantPPs,
      ingredients,
      products,
      connections,
    };
  }

  private sortByStrategy(
    ingredients: Ingredient[],
    products: Product[],
    strategy: GraphStrategy
  ): void {
    const safetyOrder = { excellent: 0, good: 1, moderate: 2 };
    switch (strategy) {
      case "ingredient-first":
        ingredients.sort((a, b) =>
          safetyOrder[a.safety_rating] - safetyOrder[b.safety_rating]
        );
        break;
      case "cost-effective":
        products.sort((a, b) => {
          const priceOrder: Record<string, number> = { low: 0, mid: 1, "mid-high": 2, high: 3 };
          return (priceOrder[a.price_range] ?? 9) - (priceOrder[b.price_range] ?? 9);
        });
        break;
      case "minimal-routine":
        products.sort((a, b) => (a.hero_product === b.hero_product ? 0 : a.hero_product ? -1 : 1));
        break;
      case "safety-first":
        ingredients.sort((a, b) =>
          safetyOrder[a.safety_rating] - safetyOrder[b.safety_rating]
        );
        break;
      case "experience-first":
        products.sort((a, b) => (a.hero_product ? -1 : 1));
        break;
    }
  }

  queryByMessage(
    userMessage: string,
    strategy: GraphStrategy = "ingredient-first"
  ): GraphQueryResult {
    const detected = this.detectPainPoints(userMessage);
    if (detected.length === 0) {
      // Fallback: return hero products
      const heroProducts = [...this.products.values()].filter(
        (p) => p.hero_product
      );
      return {
        painPoints: [],
        ingredients: [],
        products: heroProducts,
        connections: [],
      };
    }
    return this.queryByPainPoints(
      detected.map((pp) => pp.id),
      strategy
    );
  }

  getAllPainPoints(): PainPointCategory[] {
    return this.painPoints;
  }

  getProduct(id: string): Product | undefined {
    return this.products.get(id);
  }

  getIngredient(id: string): Ingredient | undefined {
    return this.ingredients.get(id);
  }

  getAllProducts(): Product[] {
    return [...this.products.values()];
  }
}
