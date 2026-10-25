import {
  createFurnitureBuilder,
  type Config,
  type Material,
  type Product,
  type PublicMaterial,
  type Settings,
} from "../lib/furniture.ts";
import { publicGeometry, type VisualPanel } from "../lib/public-geometry.ts";
import { buildKitchen, type KitchenModule, type KitchenPlan, type KitchenQuote } from "../lib/kitchen.ts";
import type { PublicProduct } from "./types";

/** An editable visual proposal only. Quotes and saved snapshots stay on the server. */
export type LiveFurniturePreview = { geometry: VisualPanel[]; config: Config };
export type LiveFurniturePreviewBuilder = (config: Config) => LiveFurniturePreview;
export type LiveKitchenModule = Omit<KitchenModule, "price">;
export type LiveKitchenPreview = Pick<KitchenQuote, "plan" | "geometry" | "envelope" | "materials"> & { modules: LiveKitchenModule[] };
export type LiveKitchenPreviewBuilder = (plan: KitchenPlan) => LiveKitchenPreview;

function visualMaterial(material: PublicMaterial): Material {
  // Explicit public projection: an accidentally supplied rate is never consumed.
  const { id, name, color, active, brand, code, board, swatch, sourceUrl, texture, renderTexture } = material;
  return { id, name, color, active, brand, code, board, swatch, sourceUrl, texture, renderTexture, price: 0 };
}

function createVisualProduct(product: PublicProduct): Product {
  return structuredClone({
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    active: product.active,
    version: product.version,
    order: product.order,
    weeks: product.weeks,
    construction: product.construction,
    gallery: product.gallery,
    frontOptions: product.frontOptions,
    showPrice: false,
    basePrice: 0,
    pricing: { basis: "calculated" },
    extras: product.extras?.map(extra => ({ ...extra, pricing: { ...extra.pricing, amount: 0 } })),
    limits: product.limits,
    defaults: product.defaults,
  });
}
function createVisualSettings(materials: readonly PublicMaterial[]): Settings {
  return {
    whatsapp: "", whatsappSecondary: "", availability: "Disponible", leadWeeks: 1,
    materialRate: 100, edgeRate: 0, doorHardware: 0,
    clothesRailRate: 0, clothesRailSupport: 0,
    frontRates: {
      glass: { basis: "square-meter", amount: 0 },
      aluminum: { basis: "linear-meter", amount: 0 },
      hardware: 0,
    },
    installation: 0, delivery: 0, margin: 0,
    materials: materials.map(visualMaterial),
  };
}

/**
 * Prepare once per current product/material catalog (for example with useMemo).
 * Each call synchronously runs the existing construction engine and emits only
 * public visual panels. Neutral zero rates satisfy that engine's private input
 * contract; no client-side quote, manufacturing table or cost is returned.
 *
 * Invalid drafts throw the engine's validation error: callers can retain the
 * last valid visual while the server independently checks every quote/save.
 * Do not use this builder to recalculate an immutable saved-design snapshot.
 */
export function createLiveFurniturePreview(
  product: PublicProduct,
  materials: readonly PublicMaterial[],
): LiveFurniturePreviewBuilder {
  const visualProduct = createVisualProduct(product);
  const build = createFurnitureBuilder(createVisualSettings(materials));
  return config => {
    const result = build(visualProduct, config);
    return {
      geometry: publicGeometry(result.panels, result.fixtures),
      config: structuredClone(config),
    };
  };
}

/**
 * Reuse the same kitchen placement/collision engine for the editable visual.
 * These module records deliberately omit prices and are not KitchenQuote data.
 * The authoritative quote, slot map and saved snapshot must keep using the API.
 */
export function createLiveKitchenPreview(
  products: readonly PublicProduct[],
  materials: readonly PublicMaterial[],
): LiveKitchenPreviewBuilder {
  const visualProducts = products.map(createVisualProduct);
  const settings = createVisualSettings(materials);
  return plan => {
    const result = buildKitchen(plan, visualProducts, settings).result;
    return {
      plan: result.plan,
      geometry: result.geometry,
      envelope: result.envelope,
      materials: result.materials,
      modules: result.modules.map(({ id, name, kind, row, wall, productId, position, size, rotationY }) => ({
        id, name, kind, row, wall, ...(productId ? { productId } : {}), position, size, rotationY,
      })),
    };
  };
}
