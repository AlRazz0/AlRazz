import {
  getConstruction,
  getConstructionOptions,
  validateConfig,
  type Config,
  type Product,
} from "../lib/furniture.ts";
import type { KitchenPlan } from "../lib/kitchen.ts";
import type { PublicProduct } from "./types";

export type KitchenFitSpace = {
  widthAvailable: number;
  height: number;
  depth: number;
  row: "base" | "wall" | "tall";
  replaceId?: string;
};
/** Geometry validation reuses the manufacturing rules; it never calculates a client-side price. */
export function fitKitchenSlotProduct(
  product: PublicProduct,
  space: KitchenFitSpace,
): Config | null {
  if (
    !product.active ||
    product.category !== "Cocina" ||
    [space.widthAvailable, space.height, space.depth].some(
      (value) => !Number.isFinite(value) || value < 100,
    )
  )
    return null;
  const {
    publicPrice: _publicPrice,
    preview: _preview,
    pricing: _pricing,
    ...metadata
  } = product;
  const validationProduct: Product = { ...metadata, basePrice: 0 };
  const construction = getConstruction(product);
  if (
    space.row === "wall" &&
    !["cabinet", "open-shelf"].includes(construction.kind)
  )
    return null;
  const limits = {
    width:
      Math.floor(
        Math.min(product.limits.width.max, space.widthAvailable) / 10,
      ) * 10,
    height:
      Math.floor(
        Math.min(
          product.limits.height.max,
          space.height,
          space.row === "base" ? 1100 : space.row === "wall" ? 1200 : 3000,
        ) / 10,
      ) * 10,
    depth:
      Math.floor(
        Math.min(
          product.limits.depth.max,
          space.depth,
          space.row === "wall" ? 450 : 3000,
        ) / 10,
      ) * 10,
  };
  for (const key of ["width", "height", "depth"] as const)
    if (limits[key] < product.limits[key].min) return null;
  const initial: Config = {
    ...product.defaults,
    width: Math.min(product.defaults.width, limits.width),
    height: Math.min(product.defaults.height, limits.height),
    depth: Math.min(product.defaults.depth, limits.depth),
    install: false,
    transport: false,
  };
  if (space.row === "tall" && initial.height < 1200) return null;
  const widthOptions = [initial.width];
  if (
    space.replaceId &&
    space.widthAvailable - initial.width > 0 &&
    space.widthAvailable - initial.width < 100
  ) {
    widthOptions.splice(0, 1, space.widthAvailable, space.widthAvailable - 100);
  }
  const ordered = (values: number[], preferred: number) =>
    [...values].sort(
      (a, b) => Math.abs(a - preferred) - Math.abs(b - preferred),
    );
  for (const width of widthOptions) {
    if (width < product.limits.width.min || width > limits.width || width % 10)
      continue;
    const draft = { ...initial, width };
    for (const modules of ordered(
      getConstructionOptions(product).modules,
      draft.modules,
    )) {
      const modular = { ...draft, modules };
      for (const shelves of ordered(
        getConstructionOptions(product, modular).shelves,
        draft.shelves,
      )) {
        const config = { ...modular, shelves };
        try {
          validateConfig(validationProduct, config);
          return config;
        } catch {
          /* Try another allowed distribution without weakening manufacturing rules. */
        }
      }
    }
  }
  return null;
}

export function insertKitchenModule(
  plan: KitchenPlan,
  space: KitchenFitSpace & { wall: "a" | "b"; leadingSpace: number },
  product: PublicProduct,
  config: Config,
  newId: () => string,
): { plan: KitchenPlan; selected: string } {
  const fitted = fitKitchenSlotProduct({ ...product, defaults: config }, space);
  if (
    !fitted ||
    fitted.width !== config.width ||
    fitted.height !== config.height ||
    fitted.depth !== config.depth ||
    fitted.modules !== config.modules ||
    fitted.shelves !== config.shelves
  )
    throw Error("Este módulo ya no cabe en el espacio. Revisa sus medidas.");
  const id = space.replaceId ?? newId();
  const furniture: KitchenPlan["items"][number] = {
    id,
    kind: "furniture",
    productId: product.id,
    wall: space.wall,
    row: space.row,
    config: { ...config, install: false, transport: false },
  };
  const makeSpace = (width: number): KitchenPlan["items"][number] => ({
    id: newId(),
    kind: "space",
    wall: space.wall,
    row: space.row,
    width,
    height: space.height,
    depth: space.depth,
  });
  let items: KitchenPlan["items"];
  if (space.replaceId) {
    const index = plan.items.findIndex(
      (item) => item.id === space.replaceId && item.kind === "space",
    );
    if (index < 0) throw Error("El espacio ya no está disponible.");
    const existing = plan.items[index];
    if (
      existing.kind !== "space" ||
      existing.width !== space.widthAvailable ||
      existing.wall !== space.wall ||
      existing.row !== space.row
    )
      throw Error("El espacio cambió. Vuelve a seleccionarlo.");
    const remaining = space.widthAvailable - config.width;
    if (remaining > 0 && remaining < 100)
      throw Error(
        "Deja al menos 10 cm libres o completa el ancho del espacio.",
      );
    items = [
      ...plan.items.slice(0, index),
      furniture,
      ...(remaining ? [makeSpace(remaining)] : []),
      ...plan.items.slice(index + 1),
    ];
  } else {
    if (space.leadingSpace > 0 && space.leadingSpace < 100)
      throw Error("El margen de este espacio necesita un ajuste del taller.");
    items = [
      ...plan.items,
      ...(space.leadingSpace ? [makeSpace(space.leadingSpace)] : []),
      furniture,
    ];
  }
  if (items.length > 16)
    throw Error(
      "La cocina admite hasta 16 elementos. Retira un módulo o espacio antes de añadir otro.",
    );
  return { plan: { ...plan, items }, selected: id };
}
