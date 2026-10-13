import {
  getConstruction,
  getConstructionOptions,
  configSchema,
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
  replaceKind?: "space" | "furniture";
  replaceFingerprint?: string;
};

function validationProduct(product: PublicProduct): Product {
  const { publicPrice: _price, preview: _preview, pricing: _pricing, extras, ...metadata } = product;
  return {
    ...metadata, basePrice: 0,
    ...(extras ? { extras: extras.map(extra => ({ ...extra, pricing: { ...extra.pricing, amount: 0 } })) } : {}),
  };
}

export function kitchenDimensionLimits(product: PublicProduct, space: KitchenFitSpace) {
  return {
    width: { min: product.limits.width.min, max: Math.floor(Math.min(product.limits.width.max, space.widthAvailable) / 10) * 10 },
    height: { min: Math.max(product.limits.height.min, space.row === "tall" ? 1200 : 100), max: Math.floor(Math.min(product.limits.height.max, space.height, space.row === "base" ? 1100 : space.row === "wall" ? 1200 : 3000) / 10) * 10 },
    depth: { min: product.limits.depth.min, max: Math.floor(Math.min(product.limits.depth.max, space.depth, space.row === "wall" ? 450 : 3000) / 10) * 10 },
  };
}

/** Manual dimensions are checked exactly; never silently resize the customer's choice. */
export function kitchenConfigIssue(product: PublicProduct, config: Config, space: KitchenFitSpace): string {
  if ([space.widthAvailable, space.height, space.depth].some(value => !Number.isFinite(value) || value < 100))
    return "El espacio cambió. Revisa sus medidas antes de añadir un módulo.";
  const parsed = configSchema.safeParse(config);
  if (!parsed.success) return "Usa medidas en milímetros, en pasos de 10 mm, y revisa la distribución.";
  if (!product.active || product.category !== "Cocina") return "Este modelo ya no está disponible para cocinas.";
  if (space.row === "wall" && !["cabinet", "open-shelf"].includes(getConstruction(product).kind)) return "Este modelo no se puede usar como alacena.";
  const limits = kitchenDimensionLimits(product, space);
  const names = { width: "ancho", height: "alto", depth: "fondo" };
  for (const key of ["width", "height", "depth"] as const)
    if (config[key] < limits[key].min || config[key] > limits[key].max)
      return `El ${names[key]} debe estar entre ${limits[key].min} y ${limits[key].max} mm para este espacio.`;
  const remaining = space.widthAvailable - config.width;
  if (space.replaceId && remaining > 0 && remaining < 100) return "Deja al menos 100 mm libres o completa el ancho del espacio.";
  try {
    validateConfig(validationProduct(product), config);
    return "";
  } catch (cause) {
    return cause instanceof Error ? cause.message : "Revisa las medidas y la distribución interior.";
  }
}
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
  const validatedProduct = validationProduct(product);
  const construction = getConstruction(product);
  if (
    space.row === "wall" &&
    !["cabinet", "open-shelf"].includes(construction.kind)
  )
    return null;
  const limits = kitchenDimensionLimits(product, space);
  for (const key of ["width", "height", "depth"] as const)
    if (limits[key].max < limits[key].min) return null;
  const initial: Config = {
    ...product.defaults,
    width: Math.max(limits.width.min, Math.min(product.defaults.width, limits.width.max)),
    height: Math.max(limits.height.min, Math.min(product.defaults.height, limits.height.max)),
    depth: Math.max(limits.depth.min, Math.min(product.defaults.depth, limits.depth.max)),
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
    if (width < limits.width.min || width > limits.width.max || width % 10)
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
          validateConfig(validatedProduct, config);
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
  const issue = kitchenConfigIssue(product, config, space);
  if (issue) throw Error(issue);
  if (!Number.isInteger(space.leadingSpace) || space.leadingSpace < 0 || space.leadingSpace > 6000 || space.leadingSpace % 10)
    throw Error("El margen de este espacio necesita un ajuste del taller.");
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
    height: Math.min(space.height, 2600),
    depth: Math.min(space.depth, 1000),
  });
  // One long reserved run may exceed the individual placeholder limit.
  const makeSpaces = (width: number): KitchenPlan["items"] => {
    const spaces: KitchenPlan["items"] = [];
    while (width > 0) {
      const chunk = width > 2000 && width < 2100 ? width - 100 : Math.min(width, 2000);
      spaces.push(makeSpace(chunk));
      width -= chunk;
    }
    return spaces;
  };
  let items: KitchenPlan["items"];
  if (space.replaceId) {
    const index = plan.items.findIndex(
      (item) => item.id === space.replaceId && item.kind === (space.replaceKind ?? "space"),
    );
    if (index < 0) throw Error("El espacio ya no está disponible.");
    const existing = plan.items[index];
    const existingSize = existing.kind === "furniture" ? existing.config : existing;
    if (
      existingSize.width !== space.widthAvailable ||
      existing.wall !== space.wall ||
      existing.row !== space.row ||
      (space.replaceFingerprint && JSON.stringify(existing) !== space.replaceFingerprint)
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
      ...makeSpaces(remaining),
      ...plan.items.slice(index + 1),
    ];
  } else {
    if (space.leadingSpace > 0 && space.leadingSpace < 100)
      throw Error("El margen de este espacio necesita un ajuste del taller.");
    items = [
      ...plan.items,
      ...makeSpaces(space.leadingSpace),
      furniture,
    ];
  }
  if (items.length > 16)
    throw Error(
      "La cocina admite hasta 16 elementos. Retira un módulo o espacio antes de añadir otro.",
    );
  return { plan: { ...plan, items }, selected: id };
}
