import type { KitchenPlan } from "../lib/kitchen";
import type { PublicProduct } from "./types";

type StartingProduct = Pick<
  PublicProduct,
  "id" | "active" | "category" | "construction" | "defaults"
>;
export function startingKitchen(
  products: readonly StartingProduct[],
): KitchenPlan {
  const kitchens = products.filter(
    (product) => product.active && product.category === "Cocina",
  );
  const base = kitchens
    .filter(
      (product) =>
        product.construction?.kind === "kitchen-base" &&
        product.defaults.height <= 1100,
    )
    .sort(
      (a, b) =>
        Math.abs(a.defaults.width - 600) - Math.abs(b.defaults.width - 600),
    )[0];
  const items: KitchenPlan["items"] = [];
  let floorBeforeFridge = 0;
  let floorWidth = 0;
  if (base) {
    items.push({
      id: "base-a",
      kind: "furniture",
      wall: "a",
      row: "base",
      productId: base.id,
      config: { ...base.defaults, install: false, transport: false },
    });
    items.push({
      id: "lavadero",
      kind: "sink-gap",
      wall: "a",
      row: "base",
      width: 600,
      height: 900,
      depth: 600,
    });
    floorBeforeFridge = base.defaults.width + 600;
    if (base.defaults.width * 2 + 1500 <= 6000) {
      floorBeforeFridge += base.defaults.width;
      items.push({
        id: "base-b",
        kind: "furniture",
        wall: "a",
        row: "base",
        productId: base.id,
        config: { ...base.defaults, install: false, transport: false },
      });
    }
    items.push({
      id: "refrigeradora",
      kind: "fridge",
      wall: "a",
      row: "tall",
      width: 900,
      height: 2000,
      depth: 650,
    });
    floorWidth = floorBeforeFridge + 900;
  }
  const upper = kitchens.find(
    (product) =>
      ["cabinet", "open-shelf"].includes(
        product.construction?.kind ?? "cabinet",
      ) &&
      product.defaults.depth <= 450 &&
      product.defaults.height <= 900 &&
      (!base || product.defaults.width <= floorBeforeFridge),
  );
  if (upper)
    items.push({
      id: "alacena-a",
      kind: "furniture",
      wall: "a",
      row: "wall",
      productId: upper.id,
      config: { ...upper.defaults, install: false, transport: false },
    });
  if (!items.length) {
    const fallback = kitchens.find(
      (product) =>
        product.defaults.height <= 1100 || product.defaults.height >= 1200,
    );
    if (fallback)
      items.push({
        id: "modulo-inicial",
        kind: "furniture",
        wall: "a",
        row: fallback.defaults.height >= 1200 ? "tall" : "base",
        productId: fallback.id,
        config: { ...fallback.defaults, install: false, transport: false },
      });
  }
  const tallest = Math.max(
    0,
    ...items
      .filter((item) => item.row === "tall")
      .map((item) =>
        item.kind === "furniture" ? item.config.height : item.height,
      ),
  );
  return {
    layout: "straight",
    walls: { a: Math.max(4000, floorWidth), b: 3000 },
    roomHeight: Math.max(2700, tallest + 100),
    wallElevation: 1500,
    install: false,
    transport: false,
    items,
  };
}

/** Reordering one lane cannot accidentally move an item to another wall or row. */
export function moveKitchenItem(
  plan: KitchenPlan,
  id: string,
  direction: -1 | 1,
): KitchenPlan {
  const index = plan.items.findIndex((item) => item.id === id);
  const item = plan.items[index];
  if (!item) return plan;
  const lane = (row: string) => (row === "wall" ? "wall" : "base");
  const siblings = plan.items
    .map((value, at) => ({ value, at }))
    .filter(
      ({ value }) =>
        value.wall === item.wall && lane(value.row) === lane(item.row),
    );
  const target =
    siblings[siblings.findIndex((value) => value.at === index) + direction]?.at;
  if (target === undefined) return plan;
  const items = [...plan.items];
  [items[index], items[target]] = [items[target], items[index]];
  return { ...plan, items };
}
