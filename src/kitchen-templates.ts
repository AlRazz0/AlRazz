import { getConstruction } from "../lib/furniture.ts";
import type { KitchenItem, KitchenPlan } from "../lib/kitchen.ts";
import type { PublicProduct } from "./types.ts";

export type KitchenTemplate = {
  id: string;
  name: string;
  description: string;
  plan: KitchenPlan;
};

type Intent = "base" | "tall" | "fridge" | "sink-gap" | "cooker" | "space";
type Blueprint = {
  id: string;
  name: string;
  description: string;
  a: Intent[];
  b?: Intent[];
};
const blueprints: readonly Blueprint[] = [
  {
    id: "lineal-compacta",
    name: "Lineal compacta",
    description:
      "Lavado, preparación y cocción en una línea, con un espacio libre para completar tu cocina.",
    a: ["fridge", "base", "sink-gap", "cooker", "space"],
  },
  {
    id: "lineal-familiar",
    name: "Lineal familiar",
    description:
      "Más almacenaje entre las zonas de lavado y cocción, con alacenas y un módulo por completar.",
    a: ["fridge", "base", "sink-gap", "base", "cooker", "space"],
  },
  {
    id: "frente-almacenaje",
    name: "Frente de almacenaje",
    description:
      "Almacenaje concentrado junto a la refrigeradora, con zonas de trabajo y un espacio para ampliar.",
    a: ["fridge", "tall", "base", "sink-gap", "cooker", "space"],
  },
  {
    id: "l-compacta",
    name: "L compacta",
    description:
      "La zona de lavado ocupa un frente y la cocción gira hacia el otro, dejando un espacio disponible.",
    a: ["fridge", "base", "sink-gap"],
    b: ["cooker", "space"],
  },
  {
    id: "l-familiar",
    name: "L familiar",
    description:
      "Dos frentes con almacenaje y espacios libres para sumar módulos a ambos lados de la cocina.",
    a: ["fridge", "base", "sink-gap", "space"],
    b: ["cooker", "base", "space"],
  },
  {
    id: "l-columnas",
    name: "L con columnas",
    description:
      "Un frente concentra el almacenaje alto; el otro reúne lavado, cocción y un espacio para personalizar.",
    a: ["fridge", "tall", "base"],
    b: ["sink-gap", "base", "cooker", "space"],
  },
];

function nearest(products: readonly PublicProduct[], preferBase = false) {
  return [...products].sort((a, b) => {
    const score = (product: PublicProduct) =>
      Math.abs(product.defaults.width - 600) +
      (preferBase && getConstruction(product).kind !== "kitchen-base"
        ? 1000
        : 0);
    return score(a) - score(b) || a.order - b.order || a.id.localeCompare(b.id);
  })[0];
}
const widthOf = (item: KitchenItem) =>
  item.kind === "furniture" ? item.config.width : item.width;
const heightOf = (item: KitchenItem) =>
  item.kind === "furniture" ? item.config.height : item.height;
const depthOf = (item: KitchenItem) =>
  item.kind === "furniture" ? item.config.depth : item.depth;

/** Published catalog defaults supply every real model; layouts never create catalog records or prices. */
export function getKitchenTemplates(
  products: readonly PublicProduct[],
): KitchenTemplate[] {
  const available = products.filter(
    (product) => product.active && product.category === "Cocina",
  );
  if (!available.length) return [];
  const base = nearest(
    available.filter((product) => product.defaults.height <= 1100),
    true,
  );
  const upper = nearest(
    available.filter(
      (product) =>
        product.defaults.height <= 1200 &&
        product.defaults.depth <= 450 &&
        ["cabinet", "open-shelf"].includes(getConstruction(product).kind),
    ),
  );
  const tall = nearest(
    available.filter((product) => product.defaults.height >= 1200),
  );
  if (!base && !upper && !tall) return [];
  const floorModel = base ?? tall;
  const floorWidth = floorModel?.defaults.width ?? upper?.defaults.width ?? 600;
  const slotWidth = Math.min(800, Math.max(400, floorWidth));
  const upperHeight = upper?.defaults.height ?? 700;
  const upperDepth = upper?.defaults.depth ?? 350;
  const plans: KitchenTemplate[] = [];
  const seen = new Set<string>();

  for (const blueprint of blueprints) {
    let sequence = 0;
    const id = () => `${blueprint.id}-${++sequence}`;
    const items: KitchenItem[] = [];
    function air(
      width: number,
      wall: "a" | "b",
      row: "base" | "wall",
      height: number,
      depth: number,
    ): KitchenItem[] {
      const result: KitchenItem[] = [];
      let remaining = width;
      while (remaining > 0) {
        // Every spacer is a valid editable reservation, even beside a very wide fallback model.
        const chunk =
          remaining > 2000
            ? remaining - 2000 < 100
              ? remaining - 100
              : 2000
            : remaining;
        result.push({
          id: id(),
          kind: "space",
          wall,
          row,
          width: chunk,
          height,
          depth,
        });
        remaining -= chunk;
      }
      return result;
    }
    function furniture(
      product: PublicProduct,
      wall: "a" | "b",
      row: "base" | "wall" | "tall",
    ): KitchenItem {
      return {
        id: id(),
        kind: "furniture",
        wall,
        row,
        productId: product.id,
        config: { ...product.defaults, install: false, transport: false },
      };
    }
    function row(intents: Intent[], wall: "a" | "b") {
      const floors: { intent: Intent; item: KitchenItem }[] = [];
      for (const intent of intents) {
        if (intent === "base" || intent === "tall") {
          const product = intent === "tall" ? (tall ?? floorModel) : floorModel;
          if (product) {
            floors.push({
              intent,
              item: furniture(
                product,
                wall,
                product.defaults.height >= 1200 ? "tall" : "base",
              ),
            });
          } else {
            for (const item of air(floorWidth, wall, "base", 850, 600))
              floors.push({ intent: "base", item });
          }
        } else if (intent === "space") {
          for (const item of air(slotWidth, wall, "base", 850, 600))
            floors.push({ intent, item });
        } else {
          const fridge = intent === "fridge";
          floors.push({
            intent,
            item: {
              id: id(),
              kind: intent,
              wall,
              row: fridge ? "tall" : "base",
              width: intent === "cooker" ? 600 : 800,
              height: fridge ? 1900 : 850,
              depth: fridge ? 650 : 600,
            },
          });
        }
      }
      items.push(...floors.map(({ item }) => item));
      for (const { intent, item } of floors) {
        const width = widthOf(item);
        const remainder = width - (upper?.defaults.width ?? 0);
        const canHaveUpper =
          item.row !== "tall" && (intent === "base" || intent === "sink-gap");
        if (
          upper &&
          canHaveUpper &&
          remainder >= 0 &&
          (remainder === 0 || remainder >= 100)
        ) {
          items.push(furniture(upper, wall, "wall"));
          if (remainder)
            items.push(
              ...air(remainder, wall, "wall", upperHeight, upperDepth),
            );
        } else items.push(...air(width, wall, "wall", upperHeight, upperDepth));
      }
    }
    row(blueprint.a, "a");
    if (blueprint.b) row(blueprint.b, "b");
    if (items.length > 16 || !items.some((item) => item.kind === "furniture"))
      continue;
    const length = (wall: "a" | "b", upperRow: boolean) =>
      items
        .filter(
          (item) => item.wall === wall && (item.row === "wall") === upperRow,
        )
        .reduce((sum, item) => sum + widthOf(item), 0);
    const depthA = Math.max(
      0,
      ...items
        .filter((item) => item.wall === "a" && item.kind !== "space")
        .map(depthOf),
    );
    const walls = {
      a: Math.max(1000, length("a", false), length("a", true)),
      b: blueprint.b
        ? Math.max(
            1000,
            depthA + 50 + length("b", false),
            depthA + 50 + length("b", true),
          )
        : 2400,
    };
    if (walls.a > 6000 || walls.b > 6000) continue;
    const roomHeight = Math.max(
      2600,
      ...items.map((item) => heightOf(item) + (item.row === "wall" ? 1450 : 0)),
    );
    const plan: KitchenPlan = {
      layout: blueprint.b ? "l" : "straight",
      walls,
      roomHeight,
      wallElevation: 1450,
      install: false,
      transport: false,
      items,
    };
    const signature = JSON.stringify({
      ...plan,
      items: plan.items.map(({ id: _id, ...item }) => item),
    });
    if (seen.has(signature)) continue;
    seen.add(signature);
    plans.push({
      id: blueprint.id,
      name: blueprint.name,
      description: blueprint.description,
      plan,
    });
  }
  return plans;
}
