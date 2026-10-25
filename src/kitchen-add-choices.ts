import type { Config } from "../lib/furniture.ts";
import { kitchenItemSchema, kitchenPlanSchema, type KitchenPlan, type KitchenQuote, type KitchenModule } from "../lib/kitchen.ts";
import { fitKitchenSlotProduct } from "./kitchen-placement.ts";
import { getKitchenSlots, type KitchenSlot } from "./kitchen-slots.ts";
import type { PublicProduct } from "./types";

export type KitchenAddChoice = { product: PublicProduct; config: Config; space: KitchenSlot };
const within = (value: number, minimum: number, maximum: number) => Number.isInteger(value) && value >= minimum && value <= maximum && value % 10 === 0;
const tuple = (value: unknown): value is [number, number, number] => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)]));
  return value;
}
function currentQuote(plan: KitchenPlan, quote: KitchenQuote | undefined): quote is KitchenQuote {
  if (!quote || !kitchenPlanSchema.safeParse(plan).success || !kitchenPlanSchema.safeParse(quote.plan).success) return false;
  if (JSON.stringify(stable({ ...plan, roomHeight: plan.roomHeight ?? 2600 })) !== JSON.stringify(stable({ ...quote.plan, roomHeight: quote.plan.roomHeight ?? 2600 }))) return false;
  if (!quote.envelope || ![quote.envelope.width, quote.envelope.height, quote.envelope.depth].every(value => Number.isFinite(value) && value > 0) || !Array.isArray(quote.modules)) return false;
  return quote.modules.length === plan.items.length && quote.modules.every(module => module && typeof module === "object" && tuple(module.position) && tuple(module.size) && module.size.every(value => value > 0) && Number.isFinite(module.rotationY));
}

type Box = { min: number[]; max: number[] };
const overlaps = (left: Box, right: Box) => [0, 1, 2].every(axis => Math.min(left.max[axis], right.max[axis]) - Math.max(left.min[axis], right.min[axis]) > .01);

/**
 * A draft containing only reservations has no server furniture quote yet.
 * Describe those known reservations only, so the existing slot affordances can
 * subtract their occupied intervals. No geometry or price is manufactured here.
 */
function reservationLayout(plan: KitchenPlan): KitchenQuote | undefined {
  if (!["straight", "l"].includes(plan.layout) || !within(plan.walls.a, 1000, 6000) || !within(plan.walls.b, 1000, 6000) || !within(plan.roomHeight ?? 2600, 2000, 4000) || !within(plan.wallElevation, 1200, 2000) || typeof plan.install !== "boolean" || typeof plan.transport !== "boolean" || plan.items.length >= 16) return;
  const ids = new Set<string>();
  for (const item of plan.items) {
    if (item.kind === "furniture" || !kitchenItemSchema.safeParse(item).success || ids.has(item.id) || (plan.layout === "straight" && item.wall === "b") || (item.kind !== "space" && item.row === "wall")) return;
    ids.add(item.id);
  }
  const cornerDepth = Math.max(0, ...plan.items.filter(item => item.wall === "a" && item.kind !== "space" && item.kind !== "furniture").map(item => item.kind === "furniture" ? 0 : item.depth));
  const cornerOffset = cornerDepth ? cornerDepth + 50 : 0;
  const cursors = { a: { base: 0, wall: 0 }, b: { base: cornerOffset, wall: cornerOffset } };
  const modules: KitchenModule[] = [];
  const boxes: Box[] = [];
  const envelope = { width: 0, height: 0, depth: 0 };
  for (const item of plan.items) {
    if (item.kind === "furniture") return;
    const lane = item.row === "wall" ? "wall" : "base";
    const offset = cursors[item.wall][lane];
    cursors[item.wall][lane] += item.width;
    const elevation = lane === "wall" ? plan.wallElevation : 0;
    if (cursors[item.wall][lane] > plan.walls[item.wall] || elevation + item.height > (plan.roomHeight ?? 2600) || (item.wall === "b" && item.depth > plan.walls.a)) return;
    const position: [number, number, number] = item.wall === "a"
      ? [offset + item.width / 2, elevation + item.height / 2, item.depth / 2]
      : [plan.walls.a - item.depth / 2, elevation + item.height / 2, offset + item.width / 2];
    const size: [number, number, number] = [item.width, item.height, item.depth];
    modules.push({ id: item.id, kind: item.kind, name: "Reserva", row: item.row, wall: item.wall, size, position, rotationY: item.wall === "b" ? -Math.PI / 2 : 0, price: null });
    if (item.kind === "space") continue;
    const worldSize = item.wall === "a" ? size : [item.depth, item.height, item.width];
    const box = { min: position.map((value, axis) => value - worldSize[axis] / 2), max: position.map((value, axis) => value + worldSize[axis] / 2) };
    if (boxes.some(previous => overlaps(box, previous))) return;
    boxes.push(box);
    envelope.width = Math.max(envelope.width, box.max[0]);
    envelope.height = Math.max(envelope.height, box.max[1]);
    envelope.depth = Math.max(envelope.depth, box.max[2]);
  }
  // Slot calculations expect the same occupied-envelope centering convention.
  for (const module of modules) module.position = [module.position[0] - envelope.width / 2, module.position[1], module.position[2] - envelope.depth / 2];
  return { plan, modules, envelope, geometry: [], price: null, furniturePrice: null, servicesPrice: null, materials: [], warnings: [] };
}

/** API order is retained; every choice still needs the server's composition check. */
export function getKitchenAddChoices(
  plan: KitchenPlan,
  quote: KitchenQuote | undefined,
  products: readonly PublicProduct[],
  wall: "a" | "b",
  row: "base" | "wall" | "tall",
): KitchenAddChoice[] {
  if ((wall !== "a" && wall !== "b") || !["base", "wall", "tall"].includes(row) || (wall === "b" && plan.layout !== "l") || plan.items.length >= 16) return [];
  const hasFurniture = plan.items.some(item => item.kind === "furniture");
  const layout = hasFurniture ? (currentQuote(plan, quote) ? quote : undefined) : reservationLayout(plan);
  if (!layout) return [];
  const spaces = getKitchenSlots(plan, layout).filter(space => !space.replaceId && space.wall === wall && space.row === (row === "tall" ? "base" : row))
    .map((space): KitchenSlot => row === "tall" ? {
      ...space, id: `${space.id}-tall`, row: "tall", height: Math.min(3000, plan.roomHeight ?? 2600),
      position: [space.position[0], Math.min(2000, plan.roomHeight ?? 2600) / 2, space.position[2]],
      label: `Añadir columna alta en pared ${wall.toUpperCase()}, espacio de ${space.widthAvailable / 10} cm`,
      planFingerprint: JSON.stringify(plan),
    } : space)
    .filter(space => plan.items.length + Math.ceil(space.leadingSpace / 2000) + 1 <= 16);
  const choices: KitchenAddChoice[] = [];
  for (const product of products) {
    for (const space of spaces) {
      const config = fitKitchenSlotProduct(product, space);
      if (!config) continue;
      choices.push({ product, config, space });
      break;
    }
  }
  return choices;
}
