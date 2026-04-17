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
import { getAllProducts as getAllProductsFromDb } from "../db/products.js";

const DATA_DIR = join(import.meta.dir ?? new URL(".", import.meta.url).pathname, "..", "data");

// [ARCH-2] Product refresh cadence. Low enough that operator edits to PG
// (품절 토글, 가격 변경, 신제품 추가) propagate within a minute without a restart.
// Pain-points + ingredients stay in YAML — those are domain schema, not inventory.
const PRODUCT_REFRESH_MS = 60_000;

export class KnowledgeGraph {
  private painPoints: PainPointCategory[] = [];
  private ingredients: Map<string, Ingredient> = new Map();
  private products: Map<string, Product> = new Map();
  private refreshHandle: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.loadStatic();
    this.loadProductsFromYaml();
  }

  // Pain-points + ingredients come from YAML and don't change at runtime.
  private loadStatic(): void {
    const ppRaw = parse(readFileSync(join(DATA_DIR, "pain-points.yaml"), "utf-8"));
    this.painPoints = ppRaw.categories;

    const ingRaw = parse(readFileSync(join(DATA_DIR, "ingredients.yaml"), "utf-8"));
    for (const ing of ingRaw.ingredients) {
      this.ingredients.set(ing.id, ing);
    }
  }

  /**
   * Synchronous YAML fallback — used at construct time so tests / dev without
   * PG still have products. Production replaces these with PG data during
   * bootstrap via initProducts().
   */
  private loadProductsFromYaml(): void {
    try {
      const prodRaw = parse(readFileSync(join(DATA_DIR, "products.yaml"), "utf-8"));
      const next = new Map<string, Product>();
      for (const prod of prodRaw.products) {
        next.set(prod.id, prod);
      }
      this.products = next;
    } catch {
      // YAML missing is fine — initProducts() will fill from PG.
    }
  }

  /**
   * [ARCH-2] Load products from PG (authoritative source) and start a
   * periodic refresh. Call once during bootstrap after initSchema + optional
   * first-run seeding.
   */
  async initProducts(): Promise<void> {
    await this.refreshProducts();
    this.refreshHandle = setInterval(() => {
      this.refreshProducts().catch((e) => {
        console.error("[graph] product refresh failed:", (e as Error).message);
      });
    }, PRODUCT_REFRESH_MS);
    // Don't block process exit on the refresh timer.
    if (this.refreshHandle && "unref" in this.refreshHandle) {
      (this.refreshHandle as unknown as { unref: () => void }).unref();
    }
  }

  /**
   * Re-read products from PG and atomically swap the in-memory map.
   * Only products with `in_stock = TRUE` are exposed to the chat engine —
   * toggling `in_stock = FALSE` in PG removes a product from recommendations
   * within one refresh tick.
   */
  async refreshProducts(): Promise<void> {
    const rows = await getAllProductsFromDb();
    const next = new Map<string, Product>();
    for (const r of rows) {
      next.set(r.id, {
        id: r.id,
        name: r.name,
        name_en: r.name_en,
        line: r.line,
        category: r.category,
        routine_step: r.routine_step,
        description: r.description,
        key_ingredients: r.key_ingredients,
        addresses: r.addresses,
        skin_type_fit: r.skin_type_fit,
        price_range: r.price_range as Product["price_range"],
        size_ml: r.size_ml,
        hero_product: r.hero_product,
        tagline: r.tagline,
      });
    }
    this.products = next;
  }

  /** Stop the refresh timer — call during graceful shutdown or tests. */
  stopRefresh(): void {
    if (this.refreshHandle) {
      clearInterval(this.refreshHandle);
      this.refreshHandle = null;
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
        // Only add if the product is currently in-stock (present in map).
        if (this.products.has(prodId)) {
          productIds.add(prodId);
          connections.push({
            from: { type: "pain-point", id: pp.id },
            to: { type: "product", id: prodId },
            relation: "recommended_product",
          });
        }
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
      // Fallback: return hero products (still filtered by in-stock via map).
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
