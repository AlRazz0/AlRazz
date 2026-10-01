import type { KitchenPlan, KitchenQuote, KitchenModule } from "../lib/kitchen";

export type PlacementSlot = {
  id: string;
  position: [number, number, number];
  label: string;
};
export type KitchenSlot = PlacementSlot & {
  wall: "a" | "b";
  row: "base" | "wall";
  widthAvailable: number;
  height: number;
  depth: number;
  offset: number;
  leadingSpace: number;
  replaceId?: string;
};
const lane = (row: string) => row === "wall" ? "wall" : "base";
type Interval = [number, number];
const intersects = (a: Interval, b: Interval) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > 0.01;

/** Pure UI affordances. A slot never changes geometry, a price or a saved plan. */
export function getKitchenSlots(plan: KitchenPlan, quote: KitchenQuote): KitchenSlot[] {
  if (plan.layout !== quote.plan.layout || plan.walls.a !== quote.plan.walls.a || plan.walls.b !== quote.plan.walls.b || plan.wallElevation !== quote.plan.wallElevation || (plan.roomHeight ?? 2600) !== (quote.plan.roomHeight ?? 2600) || plan.items.length !== quote.modules.length) return [];
  // Ignore a stale quote while the next requested composition is being calculated.
  if (plan.items.some((item, index) => {
    const module = quote.modules[index];
    const measures = item.kind === "furniture" ? item.config : item;
    return module.id !== item.id || module.kind !== item.kind || module.wall !== item.wall || module.row !== item.row || module.size.some((size, axis) => size !== [measures.width, measures.height, measures.depth][axis]);
  })) return [];

  // The server starts its bounds at the room origin and centers the occupied
  // envelope, which can be narrower than the room itself.
  const shift = [quote.envelope.width / 2, 0, quote.envelope.depth / 2];
  const worldBox = (module: KitchenModule) => {
    const size = module.wall === "a" ? module.size : [module.size[2], module.size[1], module.size[0]];
    const center = module.position.map((value, axis) => value + shift[axis]);
    return { min: center.map((value, axis) => value - size[axis] / 2), max: center.map((value, axis) => value + size[axis] / 2) };
  };
  const occupied = quote.modules.filter(module => module.kind !== "space").map(worldBox);
  const corner = Math.max(0, ...quote.modules.filter(module => module.wall === "a" && module.kind !== "space").map(module => module.size[2]));
  const cursors = { a: { base: 0, wall: 0 }, b: { base: corner ? corner + 50 : 0, wall: corner ? corner + 50 : 0 } };
  const spaces: { module: KitchenModule; offset: number }[] = [];
  for (const module of quote.modules) {
    const row = lane(module.row);
    const offset = cursors[module.wall][row];
    cursors[module.wall][row] += module.size[0];
    if (module.kind === "space") spaces.push({ module, offset });
  }
  const currentCornerOffset = corner ? corner + 50 : 0;
  const occupiedB = Math.max(cursors.b.base, cursors.b.wall) - currentCornerOffset;
  // Adding the first/deeper unit on A can shift every B unit. Reserve enough
  // room for that automatic corner adjustment before offering a placement.
  const maximumNewDepthA = quote.modules.some(module => module.wall === "b")
    ? Math.max(corner, plan.walls.b - occupiedB - 50)
    : Infinity;
  const blockers = (wall: "a" | "b", row: "base" | "wall", height: number, depth: number): Interval[] => {
    const elevation = row === "wall" ? plan.wallElevation : 0;
    const normal: Interval = wall === "a" ? [0, depth] : [plan.walls.a - depth, plan.walls.a];
    const normalAxis = wall === "a" ? 2 : 0, alongAxis = wall === "a" ? 0 : 2;
    return occupied.filter(box => intersects([box.min[1], box.max[1]], [elevation, elevation + height]) && intersects([box.min[normalAxis], box.max[normalAxis]], normal))
      .map(box => [box.min[alongAxis], box.max[alongAxis]] as Interval);
  };
  const make = (wall: "a" | "b", row: "base" | "wall", offset: number, widthAvailable: number, height: number, depth: number, leadingSpace: number, replaceId?: string): KitchenSlot => {
    const elevation = row === "wall" ? plan.wallElevation : 0;
    const width = Math.min(600, widthAvailable);
    const y = elevation + Math.min(height, row === "wall" ? 700 : 900) / 2;
    const center: [number, number, number] = wall === "a" ? [offset + width / 2, y, depth + 35] : [plan.walls.a - depth - 35, y, offset + width / 2];
    return {
      id: replaceId ? `space-${replaceId}` : `end-${wall}-${row}-${offset}`,
      position: center.map((value, axis) => value - shift[axis]) as [number, number, number],
      label: `Añadir ${row === "wall" ? "alacena" : "módulo bajo"} en pared ${wall.toUpperCase()}, espacio de ${widthAvailable / 10} cm`,
      wall, row, widthAvailable, height, depth, offset, leadingSpace,
      ...(replaceId ? { replaceId } : {}),
    };
  };
  const slots: KitchenSlot[] = [];
  for (const { module, offset } of spaces) {
    const row = lane(module.row);
    const height = Math.min(module.size[1], row === "wall" ? 1200 : 1100, (plan.roomHeight ?? 2600) - (row === "wall" ? plan.wallElevation : 0));
    const depth = Math.min(module.size[2], row === "wall" ? 450 : 600, module.wall === "a" ? maximumNewDepthA : Infinity);
    if (module.size[0] < 300 || height < 100 || depth < 100) continue;
    if (blockers(module.wall, row, height, depth).some(block => intersects(block, [offset, offset + module.size[0]]))) continue;
    slots.push(make(module.wall, row, offset, module.size[0], height, depth, 0, module.id));
  }
  for (const wall of plan.layout === "l" ? ["a", "b"] as const : ["a"] as const) for (const row of ["base", "wall"] as const) {
    const height = Math.min(row === "wall" ? 1200 : 1100, (plan.roomHeight ?? 2600) - (row === "wall" ? plan.wallElevation : 0));
    const depth = Math.min(row === "wall" ? 450 : 600, wall === "a" ? maximumNewDepthA : Infinity);
    if (height < 100 || depth < 100 || (wall === "b" && depth > plan.walls.a)) continue;
    let free: Interval[] = [[cursors[wall][row], plan.walls[wall]]];
    for (const blocked of blockers(wall, row, height, depth)) {
      free = free.flatMap(interval => !intersects(interval, blocked) ? [interval] : [
        [interval[0], Math.min(interval[1], blocked[0])] as Interval,
        [Math.max(interval[0], blocked[1]), interval[1]] as Interval,
      ].filter(([a, b]) => b - a >= 300));
    }
    for (const [from, to] of free) {
      // A generated alignment spacer must respect the public minimum of 100 mm.
      const leading = from - cursors[wall][row];
      const offset = leading > 0 && leading < 100 ? cursors[wall][row] + 100 : from;
      if (to - offset >= 300) slots.push(make(wall, row, offset, to - offset, height, depth, offset - cursors[wall][row]));
    }
  }
  return slots;
}
