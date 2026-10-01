import { z } from "zod";
import {
  buildFurniture,
  createFurnitureBuilder,
  configSchema,
  getConstruction,
  publicMaterials,
  type Config,
  type Product,
  type PublicMaterial,
  type Settings,
} from "./furniture.ts";
import { publicGeometry, type VisualPanel } from "./public-geometry.ts";

const measure = (min: number, max: number) =>
  z.number().finite().int().min(min).max(max).multipleOf(10);
const itemBase = {
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/),
  wall: z.enum(["a", "b"]),
  row: z.enum(["base", "wall", "tall"]),
};
export const kitchenItemSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...itemBase,
      kind: z.literal("furniture"),
      productId: z.string().regex(/^[a-z0-9-]{2,60}$/),
      config: configSchema,
    })
    .strict(),
  ...(["fridge", "cooker", "sink-gap", "space"] as const).map((kind) =>
    z
      .object({
        ...itemBase,
        kind: z.literal(kind),
        width: measure(100, 2000),
        height: measure(100, 2600),
        depth: measure(100, 1000),
      })
      .strict(),
  ),
]);
export const kitchenPlanSchema = z
  .object({
    layout: z.enum(["straight", "l"]),
    walls: z
      .object({ a: measure(1000, 6000), b: measure(1000, 6000) })
      .strict(),
    roomHeight: measure(2000, 4000).optional(),
    wallElevation: measure(1200, 2000),
    install: z.boolean(),
    transport: z.boolean(),
    items: z.array(kitchenItemSchema).min(1).max(16),
  })
  .strict()
  .superRefine((plan, context) => {
    const ids = new Set<string>();
    plan.items.forEach((item, index) => {
      if (ids.has(item.id))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "id"],
          message: "Cada módulo necesita un identificador único.",
        });
      ids.add(item.id);
      if (plan.layout === "straight" && item.wall === "b")
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "wall"],
          message: "Usa la pared A en una cocina lineal.",
        });
      if (
        item.kind !== "furniture" &&
        item.kind !== "space" &&
        item.row === "wall"
      )
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "row"],
          message:
            "Reserva los electrodomésticos y el lavadero en el nivel inferior.",
        });
    });
    if (!plan.items.some((item) => item.kind === "furniture"))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "Añade al menos un mueble a la cocina.",
      });
  });
export type KitchenItem = z.infer<typeof kitchenItemSchema>;
export type KitchenPlan = z.infer<typeof kitchenPlanSchema>;
export type KitchenModule = {
  id: string;
  name: string;
  kind: KitchenItem["kind"];
  row: KitchenItem["row"];
  wall: KitchenItem["wall"];
  productId?: string;
  price: number;
  position: [number, number, number];
  size: [number, number, number];
  rotationY: number;
};
export type KitchenQuote = {
  plan: KitchenPlan;
  geometry: VisualPanel[];
  modules: KitchenModule[];
  price: number;
  furniturePrice: number;
  servicesPrice: number;
  envelope: { width: number; height: number; depth: number };
  warnings: string[];
  materials: PublicMaterial[];
};
export type KitchenDesign = {
  id: string;
  name: string;
  version: number;
  created: string;
  plan: KitchenPlan;
  result: KitchenQuote;
};
export type KitchenSnapshot = {
  plan: KitchenPlan;
  settings: Settings;
  modules: {
    itemId: string;
    product: Product;
    config: Config;
    result: ReturnType<typeof buildFurniture>;
  }[];
  result: KitchenQuote;
};
const gapNames = {
  fridge: "Espacio para refrigeradora",
  cooker: "Espacio para cocina",
  "sink-gap": "Espacio para lavadero",
  space: "Espacio libre",
} as const;
type Box = { item: KitchenModule; min: number[]; max: number[] };
const overlaps = (a: Box, b: Box) =>
  a.min.every(
    (value, axis) =>
      Math.min(a.max[axis], b.max[axis]) - Math.max(value, b.min[axis]) > 0.01,
  );

/** All furniture is produced and priced by the same manufacturing engine. */
export function buildKitchen(
  input: KitchenPlan,
  products: readonly Product[],
  settings: Settings,
): KitchenSnapshot {
  const plan = kitchenPlanSchema.parse(input);
  const build = createFurnitureBuilder(settings);
  const productMap = new Map(products.map((product) => [product.id, product]));
  const modules: KitchenSnapshot["modules"] = [];
  const prepared = plan.items.map((item) => {
    if (item.kind !== "furniture")
      return {
        item,
        name: gapNames[item.kind],
        size: [item.width, item.height, item.depth] as [number, number, number],
        price: 0,
        geometry: [] as VisualPanel[],
      };
    const product = productMap.get(item.productId);
    if (!product || !product.active)
      throw new Error(`El modelo ${item.productId} ya no está disponible.`);
    if (product.category !== "Cocina")
      throw new Error(
        `«${product.name}» no pertenece a la colección de cocina.`,
      );
    const config = { ...item.config, install: false, transport: false };
    const construction = getConstruction(product).kind;
    if (
      item.row === "wall" &&
      (config.height > 1200 ||
        config.depth > 450 ||
        !["cabinet", "open-shelf"].includes(construction))
    )
      throw new Error(
        `«${product.name}» no puede colocarse como alacena: usa un módulo de pared de hasta 120 cm de alto y 45 cm de fondo.`,
      );
    if (item.row === "base" && config.height > 1100)
      throw new Error(
        `«${product.name}» supera 110 cm: colócalo en la fila de columnas.`,
      );
    if (item.row === "tall" && config.height < 1200)
      throw new Error(
        `«${product.name}» necesita al menos 120 cm para colocarse como columna.`,
      );
    const result = build(product, config);
    modules.push({
      itemId: item.id,
      product: structuredClone(product),
      config,
      result,
    });
    return {
      item,
      name: product.name,
      size: [config.width, config.height, config.depth] as [
        number,
        number,
        number,
      ],
      price: result.price,
      geometry: publicGeometry(result.panels, result.fixtures),
    };
  });
  const depthA = Math.max(
    0,
    ...prepared
      .filter(({ item }) => item.wall === "a" && item.kind !== "space")
      .map(({ size }) => size[2]),
  );
  const cornerOffset = depthA ? depthA + 50 : 0;
  const cursors = {
    a: { base: 0, wall: 0 },
    b: { base: cornerOffset, wall: cornerOffset },
  };
  const placed: KitchenModule[] = [];
  const geometry: VisualPanel[] = [];
  const boxes: Box[] = [];
  for (const part of prepared) {
    const {
      item,
      size: [width, height, depth],
    } = part;
    const row = item.row === "wall" ? "wall" : "base";
    const offset = cursors[item.wall][row];
    cursors[item.wall][row] += width;
    if (cursors[item.wall][row] > plan.walls[item.wall])
      throw new Error(
        `Los módulos de la pared ${item.wall.toUpperCase()} superan su longitud. Amplía la pared o reduce los módulos.`,
      );
    if (item.wall === "b" && depth > plan.walls.a)
      throw new Error(
        "El fondo de un módulo en B supera el espacio de la pared A.",
      );
    const elevation = row === "wall" ? plan.wallElevation : 0;
    if (elevation + height > (plan.roomHeight ?? 2600))
      throw new Error(
        `«${part.name}» supera la altura disponible de la cocina.`,
      );
    const rotationY = item.wall === "b" ? -Math.PI / 2 : 0;
    const position: [number, number, number] =
      item.wall === "a"
        ? [offset + width / 2, elevation + height / 2, depth / 2]
        : [
            plan.walls.a - depth / 2,
            elevation + height / 2,
            offset + width / 2,
          ];
    const module: KitchenModule = {
      id: item.id,
      kind: item.kind,
      row: item.row,
      wall: item.wall,
      name: part.name,
      ...(item.kind === "furniture" ? { productId: item.productId } : {}),
      size: part.size,
      position,
      rotationY,
      price: part.price,
    };
    placed.push(module);
    const worldSize = item.wall === "a" ? part.size : [depth, height, width];
    const box = {
      item: module,
      min: position.map((value, axis) => value - worldSize[axis] / 2),
      max: position.map((value, axis) => value + worldSize[axis] / 2),
    };
    if (item.kind !== "space") {
      for (const previous of boxes)
        if (overlaps(box, previous))
          throw new Error(
            `«${part.name}» se cruza con «${previous.item.name}». Añade un espacio libre o cambia el orden de los módulos.`,
          );
      boxes.push(box);
    }
    if (item.kind === "furniture") {
      for (const panel of part.geometry) {
        const [x, y, z] = panel.position;
        geometry.push({
          ...panel,
          ...(panel.door ? { handle: item.config.handle } : {}),
          position:
            item.wall === "a"
              ? [position[0] + x, elevation + y, position[2] + z]
              : [position[0] - z, elevation + y, position[2] + x],
          ...(rotationY
            ? { rotationY: (panel.rotationY ?? 0) + rotationY }
            : {}),
        });
      }
    } else if (item.kind !== "space") {
      geometry.push({
        size: part.size,
        position: [...position],
        material: "appliance-placeholder",
        surface: "placeholder",
        ...(rotationY ? { rotationY } : {}),
      });
    }
  }
  const min = [0, 0, 0],
    max = [0, 0, 0];
  for (const box of boxes)
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], box.min[axis]);
      max[axis] = Math.max(max[axis], box.max[axis]);
    }
  const center = [(min[0] + max[0]) / 2, 0, (min[2] + max[2]) / 2];
  for (const panel of geometry)
    panel.position = panel.position.map(
      (value, axis) => value - center[axis],
    ) as [number, number, number];
  for (const module of placed)
    module.position = module.position.map(
      (value, axis) => value - center[axis],
    ) as [number, number, number];
  const furniturePrice = modules.reduce(
    (sum, module) => sum + module.result.price,
    0,
  );
  const servicesPrice =
    Math.ceil(
      ((plan.install ? settings.installation : 0) +
        (plan.transport ? settings.delivery : 0)) /
        10,
    ) * 10;
  return {
    plan,
    settings: structuredClone(settings),
    modules,
    result: {
      plan,
      geometry,
      modules: placed,
      price: furniturePrice + servicesPrice,
      furniturePrice,
      servicesPrice,
      envelope: {
        width: max[0] - min[0],
        height: max[1] - min[1],
        depth: max[2] - min[2],
      },
      materials: publicMaterials(settings),
      warnings: [
        "Composición referencial: confirma medidas, anclajes, ventilación e instalaciones en una visita técnica.",
        "Los espacios reservados no incluyen electrodomésticos, lavadero, encimera ni sus recortes o instalaciones.",
        ...(plan.layout === "l" && cornerOffset
          ? [
              `La pared B reserva ${cornerOffset} mm en la esquina para evitar cruces entre muebles.`,
            ]
          : []),
      ],
    },
  };
}
