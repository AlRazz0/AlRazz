import assert from "node:assert/strict";
import test from "node:test";
import { buildKitchen, type KitchenPlan } from "../lib/kitchen.ts";
import { defaultSettings, type Product } from "../lib/furniture.ts";
import { productTemplate } from "../lib/product-templates.ts";
import { getKitchenSlots } from "../src/kitchen-slots.ts";

const base: Product = { ...productTemplate("kitchen-base"), active: true };
const cabinet = (id: string, wall: "a" | "b" = "a") => ({ id, wall, row: "base" as const, kind: "furniture" as const, productId: base.id, config: { ...base.defaults } });
const plan = (items: KitchenPlan["items"]): KitchenPlan => ({ layout: "straight", walls: { a: 3600, b: 2400 }, roomHeight: 2700, wallElevation: 1500, install: false, transport: false, items });
const quote = (input: KitchenPlan) => buildKitchen(input, [base], defaultSettings).result;

test("slots replace existing air without moving neighbours and show free space beyond the occupied envelope", () => {
  const input = plan([cabinet("left"), { id: "free", wall: "a", row: "base", kind: "space", width: 600, height: 900, depth: 600 }, cabinet("right")]);
  const result = quote(input), before = structuredClone({ input, result });
  const slots = getKitchenSlots(input, result);
  const hole = slots.find(slot => slot.replaceId === "free")!;
  assert.equal(hole.offset, 600);
  assert.equal(hole.widthAvailable, 600);
  assert.equal(hole.leadingSpace, 0);
  assert.equal(hole.position[0], result.modules.find(module => module.id === "free")!.position[0]);
  const end = slots.find(slot => slot.row === "base" && !slot.replaceId)!;
  assert.equal(end.offset, 1800);
  assert.equal(end.widthAvailable, 1800);
  assert.ok(end.position[0] > result.envelope.width / 2);
  const replaced = { ...input, items: input.items.map(item => item.id === "free" ? cabinet("inserted") : item) };
  const after = quote(replaced);
  assert.deepEqual(after.modules.find(module => module.id === "right")!.position, result.modules.find(module => module.id === "right")!.position);
  assert.deepEqual({ input, result }, before);
});

test("upper slots avoid the refrigerator and express an alignment spacer for safe insertion", () => {
  const input = plan([{ id: "fridge", wall: "a", row: "tall", kind: "fridge", width: 900, height: 2000, depth: 650 }, cabinet("base")]);
  const result = quote(input);
  const upper = getKitchenSlots(input, result).filter(slot => slot.row === "wall");
  assert.equal(upper.length, 1);
  assert.equal(upper[0].offset, 900);
  assert.equal(upper[0].leadingSpace, 900);
  assert.equal(upper[0].widthAvailable, 2700);
  assert.ok(upper[0].height <= input.roomHeight! - input.wallElevation);
});

test("an upper air gap occupied by a tall appliance is not offered as a furniture placement", () => {
  const input = plan([{ id: "fridge", wall: "a", row: "tall", kind: "fridge", width: 900, height: 2000, depth: 650 }, cabinet("base"), { id: "upper-air", wall: "a", row: "wall", kind: "space", width: 900, height: 700, depth: 300 }]);
  const slots = getKitchenSlots(input, quote(input));
  assert.ok(slots.every(slot => slot.replaceId !== "upper-air"));
});

test("L slots preserve the reserved corner and use the server's occupied-world centering", () => {
  const input = { ...plan([cabinet("a"), cabinet("b", "b")]), layout: "l" as const };
  const result = quote(input);
  const slots = getKitchenSlots(input, result);
  const floorB = slots.find(slot => slot.wall === "b" && slot.row === "base")!;
  assert.equal(floorB.offset, 1250);
  assert.equal(floorB.widthAvailable, 1150);
  assert.equal(floorB.position[2], 1250 + 300 - result.envelope.depth / 2);
  assert.equal(floorB.position[0], input.walls.a - floorB.depth - 35 - result.envelope.width / 2);
  const wallB = slots.find(slot => slot.wall === "b" && slot.row === "wall")!;
  assert.equal(wallB.offset, 650);
  assert.equal(wallB.leadingSpace, 0);
});

test("full walls and stale quotes do not produce misleading placement buttons", () => {
  const input = { ...plan([cabinet("a"), cabinet("b")]), walls: { a: 1200, b: 2400 } };
  const result = quote(input);
  assert.ok(getKitchenSlots(input, result).every(slot => slot.row === "wall"));
  assert.deepEqual(getKitchenSlots({ ...input, walls: { a: 3000, b: 2400 } }, result), []);
  assert.deepEqual(getKitchenSlots({ ...input, items: [...input.items].reverse() }, result), []);
  const changed = structuredClone(input);
  if (changed.items[0].kind === "furniture") changed.items[0].config.width += 10;
  assert.deepEqual(getKitchenSlots(changed, result), []);
});

test("adding on A cannot silently push an already full B wall beyond its room boundary", () => {
  const input = { ...plan([cabinet("b1", "b"), cabinet("b2", "b")]), layout: "l" as const, walls: { a: 3600, b: 1200 } };
  const result = quote(input);
  assert.ok(getKitchenSlots(input, result).every(slot => slot.wall !== "a"));
  const bigger = { ...input, walls: { a: 3600, b: 1550 } };
  const slots = getKitchenSlots(bigger, quote(bigger));
  assert.ok(slots.filter(slot => slot.wall === "a").every(slot => slot.depth <= 300));
});
