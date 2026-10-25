import { test } from "node:test";
import assert from "node:assert/strict";
import { buildKitchen, type KitchenItem, type KitchenPlan } from "../lib/kitchen.ts";
import { defaultSettings } from "../lib/furniture.ts";
import { productTemplate } from "../lib/product-templates.ts";
import { buildKitchenLayoutView } from "../src/kitchen-layout-view.ts";

const space = (id: string, width: number, wall: "a" | "b" = "a", row: "base" | "wall" | "tall" = "base"): Exclude<KitchenItem, { kind: "furniture" }> => ({
  id, kind: "space", wall, row, width,
  height: row === "wall" ? 600 : row === "tall" ? 2000 : 900,
  depth: row === "wall" ? 300 : 600,
});
const planWith = (items: KitchenItem[], overrides: Partial<KitchenPlan> = {}): KitchenPlan => ({
  layout: "straight", walls: { a: 4000, b: 3000 }, roomHeight: 2700,
  wallElevation: 1500, install: false, transport: false, items, ...overrides,
});

test("layout lanes preserve physical order and combine tall units with the floor row", () => {
  const plan = planWith([space("base", 600), space("upper", 800, "a", "wall"),
    space("b-item", 400, "b"), space("tall", 900, "a", "tall"), space("after", 500)], { layout: "l" });
  const original = structuredClone(plan);
  const result = buildKitchenLayoutView(plan);
  const floor = result.walls[0].lanes.find((lane) => lane.id === "base")!;
  assert.deepEqual(floor.blocks.map(({ id, offset }) => [id, offset]), [["base", 0], ["tall", 600], ["after", 1500]]);
  assert.equal(floor.occupied, 0, "empty alignment spaces are not physical furniture");
  assert.equal(floor.free, 4000, "reserved empty spaces can be filled without moving neighbours");
  assert.deepEqual(floor.blocks.map(({ canMoveBefore, canMoveAfter }) => [canMoveBefore, canMoveAfter]),
    [[false, true], [true, true], [true, false]]);
  assert.equal(result.walls[0].lanes.find((lane) => lane.id === "wall")!.occupied, 0);
  assert.equal(result.walls[1].lanes.find((lane) => lane.id === "base")!.blocks[0].offset, 0,
    "free placeholders on A do not create a material corner obstruction");
  assert.deepEqual(plan, original);
});

test("the uncalculated L diagram explicitly reserves the current corner margin in both B rows", () => {
  const appliance: KitchenItem = { ...space("fridge", 900), kind: "fridge", row: "tall", height: 2000, depth: 650 };
  const plan = planWith([appliance, space("b-floor", 600, "b")], { layout: "l" });
  const result = buildKitchenLayoutView(plan);
  assert.equal(result.fromQuote, false);
  const b = result.walls.find((wall) => wall.id === "b")!;
  for (const lane of b.lanes) assert.equal(lane.corner, 700);
  assert.equal(b.lanes.find((lane) => lane.id === "base")!.blocks[0].offset, 700);
  assert.equal(b.lanes.find((lane) => lane.id === "base")!.free, 2300);
  assert.equal(b.lanes.find((lane) => lane.id === "wall")!.free, 2300,
    "an empty upper row still retains the same explicit corner reserve");
});

test("10 and 50 mm fillers consume their exact width without visual rounding", () => {
  const result = buildKitchenLayoutView(planWith([space("a", 600), space("thin", 10), space("gap", 50), space("b", 600)]));
  const floor = result.walls[0].lanes.find((lane) => lane.id === "base")!;
  assert.deepEqual(floor.blocks.map(({ width, offset }) => [width, offset]), [[600, 0], [10, 600], [50, 610], [600, 660]]);
  assert.equal(floor.used, 1260);
  assert.equal(floor.free, 4000);
  assert.deepEqual(floor.freeIntervals, [[0, 4000]]);
});

test("an overflowing draft remains visible with its excess instead of pretending to fit", () => {
  const plan = planWith([
    { ...space("first", 1800), kind: "fridge" },
    { ...space("last", 1500), kind: "fridge" },
  ], { walls: { a: 3000, b: 3000 } });
  const floor = buildKitchenLayoutView(plan).walls[0].lanes.find((lane) => lane.id === "base")!;
  assert.equal(floor.blocks.length, 2);
  assert.equal(floor.blocks[1].offset, 1800);
  assert.equal(floor.occupied, 3300);
  assert.equal(floor.used, 3300);
  assert.equal(floor.free, 0);
  assert.equal(floor.overflow, 300);
});

test("empty kitchens and empty lanes keep their actual room capacity", () => {
  const result = buildKitchenLayoutView(planWith([]));
  assert.equal(result.walls.length, 1);
  assert.equal(result.invalid, false);
  for (const lane of result.walls[0].lanes) {
    assert.equal(lane.blocks.length, 0);
    assert.equal(lane.occupied, 0);
    assert.equal(lane.free, 4000);
    assert.equal(lane.overflow, 0);
  }
});

test("incomplete measures never become NaN coordinates or fabricated positions for later items", () => {
  const plan = planWith([space("bad", NaN), space("later", 600)], { walls: { a: NaN, b: 3000 }, roomHeight: NaN });
  const result = buildKitchenLayoutView(plan);
  const floor = result.walls[0].lanes.find((lane) => lane.id === "base")!;
  assert.equal(result.invalid, true);
  assert.equal(result.walls[0].length, null);
  assert.equal(floor.blocks[0].width, null);
  assert.equal(floor.blocks[1].offset, null);
  assert.equal(floor.occupied, null);
  assert.equal(floor.free, null);
  assert.equal(floor.heightAvailable, null);
  const check = (value: unknown) => {
    if (typeof value === "number") assert.ok(Number.isFinite(value));
    else if (value && typeof value === "object") Object.values(value).forEach(check);
  };
  check(result);
});

test("height indicators use the wall-cabinet elevation and the shared floor for tall units", () => {
  const upper = { ...space("upper", 600, "a", "wall"), height: 900 };
  const tall = { ...space("tall", 600, "a", "tall"), height: 2800 };
  const result = buildKitchenLayoutView(planWith([upper, tall], { wallElevation: 1900 }));
  const wall = result.walls[0].lanes.find((lane) => lane.id === "wall")!;
  const floor = result.walls[0].lanes.find((lane) => lane.id === "base")!;
  assert.equal(wall.heightAvailable, 800);
  assert.equal(wall.blocks[0].elevation, 1900);
  assert.equal(wall.blocks[0].heightExcess, 100);
  assert.equal(floor.blocks[0].elevation, 0);
  assert.equal(floor.blocks[0].heightExcess, 100);
});

test("server placements and historical names take priority without mutating the plan or quote", () => {
  const product = { ...productTemplate("kitchen-base"), active: true };
  const item: KitchenItem = { id: "base-a", kind: "furniture", productId: product.id,
    row: "base", wall: "a", config: { ...product.defaults, install: false, transport: false } };
  const plan = planWith([item, space("b-place", 600, "b")], { layout: "l" });
  const quote = buildKitchen(plan, [product], defaultSettings).result;
  // Supplied placements may include a server-approved alignment margin beyond
  // the draft's simple conservative corner estimate. Render that placement.
  const bModule = quote.modules.find((module) => module.id === "b-place")!;
  bModule.position[2] += 40;
  quote.modules[0].name = "Nombre conservado en la versión";
  const original = structuredClone({ plan, quote });
  const result = buildKitchenLayoutView(plan, quote, [{ id: product.id, name: "Nombre actual distinto" }]);
  assert.equal(result.fromQuote, true);
  assert.equal(result.walls[0].lanes.find((lane) => lane.id === "base")!.blocks[0].label, "Nombre conservado en la versión");
  const b = result.walls[1];
  const expectedOffset = bModule.position[2] + quote.envelope.depth / 2 - bModule.size[0] / 2;
  assert.equal(b.lanes.find((lane) => lane.id === "base")!.blocks[0].offset, expectedOffset);
  for (const lane of b.lanes) assert.equal(lane.corner, expectedOffset);
  assert.deepEqual({ plan, quote }, original);
});

test("a quote for the previous order or dimensions is ignored while the new draft remains inspectable", () => {
  const product = { ...productTemplate("kitchen-base"), active: true };
  const furniture: KitchenItem = { id: "cabinet", kind: "furniture", productId: product.id,
    row: "base", wall: "a", config: { ...product.defaults, install: false, transport: false } };
  const plan = planWith([furniture, space("reserved", 500)]);
  const quote = buildKitchen(plan, [product], defaultSettings).result;
  const reordered = { ...plan, items: [plan.items[1], plan.items[0]] };
  const changedWidth = { ...plan, walls: { ...plan.walls, a: 3500 } };
  for (const draft of [reordered, changedWidth]) {
    const result = buildKitchenLayoutView(draft, quote);
    assert.equal(result.fromQuote, false);
    assert.deepEqual(result.walls[0].lanes.find((lane) => lane.id === "base")!.blocks.map((block) => block.id),
      draft.items.map((item) => item.id));
  }
});

function kitchenWithTallObstruction() {
  const base = { ...productTemplate("kitchen-base"), id: "map-base", active: true };
  const upper = { ...productTemplate("cabinet"), id: "map-upper", name: "Alacena de prueba", category: "Cocina" as const, active: true,
    limits: { width: { min: 300, max: 1800 }, height: { min: 500, max: 1000 }, depth: { min: 250, max: 450 } } };
  const counter: KitchenItem = { id: "counter", kind: "furniture", wall: "a", row: "base", productId: base.id,
    config: { ...base.defaults, width: 1800, modules: 3 } };
  const cabinet: KitchenItem = { id: "upper", kind: "furniture", wall: "a", row: "wall", productId: upper.id,
    config: { ...upper.defaults, width: 1040, height: 600, depth: 300, modules: 2, shelves: 1 } };
  const fridge: KitchenItem = { ...space("fridge", 900, "a", "tall"), kind: "fridge", height: 2000, depth: 650 };
  const plan = planWith([counter, fridge, cabinet]);
  const quote = buildKitchen(plan, [base, upper], defaultSettings).result;
  return { base, upper, counter, cabinet, fridge, plan, quote };
}

test("upper free width excludes a high appliance and retains both usable intervals", () => {
  const { plan, quote } = kitchenWithTallObstruction();
  const before = structuredClone({ plan, quote });
  for (const suppliedQuote of [undefined, quote]) {
    const view = buildKitchenLayoutView(plan, suppliedQuote);
    const upper = view.walls[0].lanes.find((lane) => lane.id === "wall")!;
    assert.equal(upper.occupied, 1040);
    assert.equal(upper.blocked, 900);
    assert.equal(upper.free, 2060, "2960 mm of empty frontage is not all usable above a refrigerator");
    assert.deepEqual(upper.obstacleIntervals, [[1800, 2700]]);
    assert.deepEqual(upper.blockedIntervals, [[1800, 2700]]);
    assert.deepEqual(upper.freeIntervals, [[1040, 1800], [2700, 4000]]);
    assert.deepEqual(upper.blocks.map((block) => block.id), ["upper"],
      "a lower appliance must not become a movable item in the upper lane");
    assert.ok(upper.blockingLabels.length === 1);
    assert.equal(upper.occupied! + upper.blocked! + upper.free!, 4000);
  }
  assert.deepEqual({ plan, quote }, before);
});

test("a partially obstructed upper reservation remains fillable in its unobstructed portion", () => {
  const { base, upper, counter, cabinet, fridge } = kitchenWithTallObstruction();
  const neighbour: KitchenItem = { ...cabinet, id: "neighbour", config: { ...cabinet.config, width: 600 } };
  const plan = planWith([fridge, space("upper-gap", 1800, "a", "wall"), neighbour,
    { ...counter, config: { ...counter.config, width: 600, modules: 1 } }]);
  const quote = buildKitchen(plan, [base, upper], defaultSettings).result;
  const before = structuredClone({ plan, quote });
  const lane = buildKitchenLayoutView(plan, quote).walls[0].lanes.find((lane) => lane.id === "wall")!;
  assert.equal(lane.occupied, 600, "an empty reservation is not an installed cabinet");
  assert.equal(lane.blocked, 900);
  assert.equal(lane.free, 2500);
  assert.deepEqual(lane.freeIntervals, [[900, 1800], [2400, 4000]]);
  assert.deepEqual(lane.blocks.map(({ id, width, offset }) => [id, width, offset]),
    [["upper-gap", 1800, 0], ["neighbour", 600, 1800]], "the diagram must not allocate, split or reorder the draft");
  assert.deepEqual({ plan, quote }, before);
});

test("the upper obstruction follows supplied server positions rather than obsolete draft offsets", () => {
  const { plan, quote } = kitchenWithTallObstruction();
  quote.modules.find((module) => module.id === "fridge")!.position[0] += 100;
  const before = structuredClone({ plan, quote });
  const lane = buildKitchenLayoutView(plan, quote).walls[0].lanes.find((lane) => lane.id === "wall")!;
  assert.deepEqual(lane.obstacleIntervals, [[1900, 2800]]);
  assert.deepEqual(lane.freeIntervals, [[1040, 1900], [2800, 4000]]);
  assert.equal(lane.free, 2060);
  assert.deepEqual({ plan, quote }, before);
});

test("lower obstruction unions never count existing upper furniture twice", () => {
  const { cabinet } = kitchenWithTallObstruction();
  const plan = planWith([
    { ...space("tower", 800, "a", "tall"), kind: "fridge", height: 2200 },
    { ...space("fridge", 800, "a", "tall"), kind: "fridge", height: 2000 },
    cabinet,
  ]);
  const lane = buildKitchenLayoutView(plan).walls[0].lanes.find((lane) => lane.id === "wall")!;
  assert.deepEqual(lane.obstacleIntervals, [[0, 1600]], "adjacent lower obstructions form one unavailable run");
  assert.deepEqual(lane.blockedIntervals, [[1040, 1600]], "occupied upper frontage must not be added twice");
  assert.equal(lane.occupied, 1040);
  assert.equal(lane.blocked, 560);
  assert.equal(lane.free, 2400);
  assert.equal(lane.blocks[0].blockedByLower, true, "an existing upper collision must remain visible for correction");
  assert.equal(lane.occupied! + lane.blocked! + lane.free!, 4000);
});

test("only physical lower pieces reaching the upper vertical band reduce its available width", () => {
  const atBoundary: KitchenItem = { ...space("fridge", 900, "a", "tall"), kind: "fridge", height: 1500 };
  const emptyTall = { ...space("empty", 600, "a", "tall"), height: 2600 };
  const lane = buildKitchenLayoutView(planWith([atBoundary, emptyTall])).walls[0].lanes.find((lane) => lane.id === "wall")!;
  assert.equal(lane.blocked, 0, "a top exactly at the cabinet elevation does not intersect the upper band");
  assert.equal(lane.free, 4000);
  assert.deepEqual(lane.obstacleIntervals, []);
  const higher = buildKitchenLayoutView(planWith([{ ...atBoundary, height: 1510 }, emptyTall])).walls[0].lanes.find((lane) => lane.id === "wall")!;
  assert.equal(higher.blocked, 900);
  assert.equal(higher.free, 3100);
  assert.deepEqual(higher.obstacleIntervals, [[0, 900]]);
});
