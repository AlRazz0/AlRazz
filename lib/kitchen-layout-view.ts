import type { KitchenItem, KitchenPlan, KitchenQuote } from "./kitchen.ts";
import { subtractKitchenIntervals } from "./kitchen-free-intervals.ts";

type Interval = [number, number];

export type KitchenLayoutBlock = {
  id: string;
  label: string;
  kind: KitchenItem["kind"];
  row: KitchenItem["row"];
  width: number | null;
  height: number | null;
  depth: number | null;
  offset: number | null;
  elevation: number | null;
  valid: boolean;
  heightExcess: number;
  blockedByLower: boolean;
  canMoveBefore: boolean;
  canMoveAfter: boolean;
};
export type KitchenLayoutLane = {
  id: "base" | "wall";
  label: string;
  blocks: KitchenLayoutBlock[];
  corner: number | null;
  occupied: number | null;
  used: number | null;
  free: number | null;
  overflow: number | null;
  heightAvailable: number | null;
  blocked: number | null;
  /** Additional unavailable width, excluding existing furniture and the corner. */
  blockedIntervals: Interval[];
  /** Complete lower-row obstruction, also useful for identifying collisions. */
  obstacleIntervals: Interval[];
  freeIntervals: Interval[];
  blockingLabels: string[];
};
export type KitchenLayoutWall = {
  id: "a" | "b";
  length: number | null;
  lanes: KitchenLayoutLane[];
};
export type KitchenLayoutView = {
  walls: KitchenLayoutWall[];
  invalid: boolean;
  fromQuote: boolean;
};

const gapNames = {
  fridge: "Reserva de refrigeradora",
  cooker: "Reserva de cocina / horno",
  "sink-gap": "Reserva de lavadero",
  space: "Espacio libre reservado",
};
const measure = (value: number): number | null => Number.isFinite(value) && value > 0 ? value : null;
const nonnegative = (value: number): number | null => Number.isFinite(value) && value >= 0 ? value : null;
const laneOf = (row: KitchenItem["row"]) => row === "wall" ? "wall" : "base";
const intervalWidth = (intervals: readonly Interval[]) => intervals.reduce((total, [from, to]) => total + to - from, 0);
const intersects = (left: Interval, right: Interval) => Math.min(left[1], right[1]) - Math.max(left[0], right[0]) > 0.01;
const blockInterval = (block: KitchenLayoutBlock): Interval | null => block.offset !== null && block.width !== null
  ? [block.offset, block.offset + block.width] : null;

/** Compare only layout-relevant data. A stale quote must never place a newer item. */
function matchingLayout(plan: KitchenPlan, quote: KitchenQuote | undefined): quote is KitchenQuote {
  if (!quote || quote.plan.layout !== plan.layout || quote.plan.walls.a !== plan.walls.a ||
    quote.plan.walls.b !== plan.walls.b || quote.plan.wallElevation !== plan.wallElevation ||
    (quote.plan.roomHeight ?? 2600) !== (plan.roomHeight ?? 2600) ||
    quote.modules.length !== plan.items.length ||
    ![quote.envelope.width, quote.envelope.depth].every((value) => Number.isFinite(value) && value >= 0)) return false;
  return plan.items.every((item, index) => {
    const module = quote.modules[index];
    const size = item.kind === "furniture" ? item.config : item;
    return module.id === item.id && module.kind === item.kind && module.row === item.row &&
      module.wall === item.wall && (item.kind !== "furniture" || module.productId === item.productId) &&
      module.size.every((value, axis) => value === [size.width, size.height, size.depth][axis]) &&
      module.position.every(Number.isFinite);
  });
}

/**
 * A dimension diagram, never a quote, board calculation or manufacturing check.
 * Current server placements take priority; an uncalculated draft shows its lane
 * widths and the same conservative corner reserve used by the planner.
 */
export function buildKitchenLayoutView(
  plan: KitchenPlan,
  quote?: KitchenQuote,
  products: readonly { id: string; name: string }[] = [],
): KitchenLayoutView {
  const fromQuote = matchingLayout(plan, quote);
  const modules = new Map(fromQuote ? quote.modules.map((module) => [module.id, module]) : []);
  const productNames = new Map(products.map((product) => [product.id, product.name]));
  const roomHeight = measure(plan.roomHeight ?? 2600);
  const wallElevation = nonnegative(plan.wallElevation);
  const aDepths = plan.items.filter((item) => item.wall === "a" && item.kind !== "space")
    .map((item) => measure(item.kind === "furniture" ? item.config.depth : item.depth));
  const maximumDepth = aDepths.includes(null) ? null : Math.max(0, ...aDepths as number[]);
  const draftCorner = maximumDepth === null ? null : maximumDepth ? maximumDepth + 50 : 0;
  const serverOffset = (id: string, wall: "a" | "b", width: number) => {
    const module = modules.get(id);
    if (!fromQuote || !module) return null;
    const along = wall === "a" ? module.position[0] + quote.envelope.width / 2
      : module.position[2] + quote.envelope.depth / 2;
    return nonnegative(Math.max(0, along - width / 2));
  };
  const bStarts = fromQuote ? quote.modules.filter((module) => module.wall === "b")
    .map((module) => serverOffset(module.id, "b", module.size[0])).filter((value): value is number => value !== null) : [];
  const corner = bStarts.length ? Math.min(...bStarts) : draftCorner;
  const walls = (plan.layout === "l" ? ["a", "b"] as const : ["a"] as const).map((wall): KitchenLayoutWall => {
    const length = measure(plan.walls[wall]);
    const lanes = (["wall", "base"] as const).map((lane): KitchenLayoutLane => {
      const items = plan.items.filter((item) => item.wall === wall && laneOf(item.row) === lane);
      const reserve = wall === "b" ? corner : 0;
      let cursor: number | null = reserve;
      const blocks = items.map((item, index): KitchenLayoutBlock => {
        const size = item.kind === "furniture" ? item.config : item;
        const width = measure(size.width), height = measure(size.height), depth = measure(size.depth);
        const module = modules.get(item.id);
        const elevation = module && height !== null ? nonnegative(module.position[1] - height / 2)
          : lane === "wall" ? wallElevation : 0;
        const offset = width !== null && fromQuote ? serverOffset(item.id, wall, width) : cursor;
        cursor = width !== null && offset !== null ? offset + width : null;
        return {
          id: item.id, kind: item.kind, row: item.row,
          label: module?.name || (item.kind === "furniture" ? productNames.get(item.productId) || "Mueble de la cocina" : gapNames[item.kind]),
          width, height, depth, offset, elevation,
          valid: width !== null && height !== null && depth !== null && offset !== null && elevation !== null,
          heightExcess: height !== null && elevation !== null && roomHeight !== null ? Math.max(0, elevation + height - roomHeight) : 0,
          blockedByLower: false,
          canMoveBefore: index > 0, canMoveAfter: index < items.length - 1,
        };
      });
      const allocated = blocks.some((block) => block.width === null) ? null : blocks.reduce((sum, block) => sum + block.width!, 0);
      const occupied = blocks.some((block) => block.width === null) ? null : blocks.filter((block) => block.kind !== "space")
        .reduce((sum, block) => sum + block.width!, 0);
      const used = reserve === null || allocated === null ? null : Math.max(reserve,
        ...blocks.map((block) => block.offset !== null && block.width !== null ? block.offset + block.width : reserve + allocated));
      return {
        id: lane, label: lane === "wall" ? "Alacenas" : "Muebles bajos y columnas", blocks,
        corner: reserve, occupied, used,
        free: null,
        overflow: length !== null && used !== null ? Math.max(0, used - length) : null,
        heightAvailable: roomHeight !== null && (lane === "base" || wallElevation !== null)
          ? Math.max(0, roomHeight - (lane === "wall" ? wallElevation! : 0)) : null,
        blocked: null, blockedIntervals: [], obstacleIntervals: [], freeIntervals: [], blockingLabels: [],
      };
    });
    const lower = lanes.find((lane) => lane.id === "base")!;
    for (const lane of lanes) {
      if (length === null || lane.corner === null || lane.blocks.some((block) => !block.valid) ||
        roomHeight === null || wallElevation === null ||
        (lane.id === "wall" && lower.blocks.some((block) => block.kind !== "space" && !block.valid))) continue;
      const range: Interval = [Math.min(lane.corner, length), length];
      const own = lane.blocks.filter((block) => block.kind !== "space")
        .map(blockInterval).filter((interval): interval is Interval => interval !== null);
      const obstructing = lane.id === "wall" ? lower.blocks.filter((block) => block.kind !== "space" &&
        block.elevation !== null && block.height !== null &&
        intersects([block.elevation, block.elevation + block.height], [wallElevation, roomHeight])) : [];
      const obstacles = obstructing.map(blockInterval).filter((interval): interval is Interval => interval !== null);
      const withoutLower = subtractKitchenIntervals(range, own);
      lane.freeIntervals = subtractKitchenIntervals(range, [...own, ...obstacles]);
      lane.free = intervalWidth(lane.freeIntervals);
      lane.blockedIntervals = withoutLower.flatMap((available) => subtractKitchenIntervals(available, lane.freeIntervals));
      lane.blocked = intervalWidth(lane.blockedIntervals);
      lane.obstacleIntervals = subtractKitchenIntervals(range, subtractKitchenIntervals(range, obstacles));
      lane.blockingLabels = [...new Set(obstructing.filter((block) => {
        const interval = blockInterval(block);
        return interval !== null && intersects(interval, range);
      }).map((block) => block.label))];
      for (const block of lane.blocks) {
        const interval = blockInterval(block);
        block.blockedByLower = block.kind !== "space" && interval !== null && obstacles.some((obstacle) => intersects(interval, obstacle));
      }
    }
    return { id: wall, length, lanes };
  });
  return {
    walls, fromQuote,
    invalid: roomHeight === null || wallElevation === null || walls.some((wall) => wall.length === null ||
      wall.lanes.some((lane) => lane.corner === null || lane.blocks.some((block) => !block.valid))),
  };
}
