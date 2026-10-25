import assert from "node:assert/strict";
import test from "node:test";
import { subtractKitchenIntervals } from "../src/kitchen-free-intervals.ts";
import { getKitchenSlots } from "../src/kitchen-slots.ts";
import { fitKitchenSlotProduct, insertKitchenModule } from "../src/kitchen-placement.ts";
import { buildFurniture, defaultSettings, type Product } from "../lib/furniture.ts";
import { buildKitchen, type KitchenPlan } from "../lib/kitchen.ts";
import { productTemplate } from "../lib/product-templates.ts";
import { publicFurnitureResult, publicProduct } from "../lib/public-product.ts";

test("free intervals subtract the union of overlapping, duplicate and unordered blockers without mutating inputs", () => {
  const range: [number, number] = [0, 1000];
  const blockers: [number, number][] = [[300, 500], [100, 300], [200, 600], [100, 300], [1400, 1600]];
  const before = structuredClone({ range, blockers });
  assert.deepEqual(subtractKitchenIntervals(range, blockers), [[0, 100], [600, 1000]]);
  assert.deepEqual({ range, blockers }, before);
  assert.deepEqual(subtractKitchenIntervals([0, 1800], [[0, 900]]), [[900, 1800]]);
  assert.deepEqual(subtractKitchenIntervals([0, 1800], [[-200, 1900]]), []);
});

test("grid rounding never offers space occupied by a fractional obstacle", () => {
  assert.deepEqual(subtractKitchenIntervals([3, 997], [[100.1, 349.9]]), [[10, 100], [350, 990]]);
  assert.deepEqual(subtractKitchenIntervals([3, 997], [[100.1, 349.9]], 100), [[350, 990]]);
  assert.deepEqual(subtractKitchenIntervals([-97, 105], [[-15, 16]]), [[-90, -20], [20, 100]]);
  assert.deepEqual(subtractKitchenIntervals([0, 110], [[10, 100]]), [[0, 10], [100, 110]]);
  assert.deepEqual(subtractKitchenIntervals([0, 110], [[10, 100]], 11), []);
});

test("invalid ranges cannot become offers and nonfinite blockers cannot poison valid intervals", () => {
  for (const range of [[NaN, 100], [0, Infinity], [100, 0], [0, 0], [1, 9]] as [number, number][])
    assert.deepEqual(subtractKitchenIntervals(range, []), []);
  for (const minimum of [NaN, Infinity, 0, -10])
    assert.deepEqual(subtractKitchenIntervals([0, 1000], [], minimum), []);
  assert.deepEqual(subtractKitchenIntervals([0, 100], [[NaN, 10], [10, Infinity], [70, 30], [40, 40]]), [[0, 100]]);
  assert.deepEqual(subtractKitchenIntervals([0, 100], [[-100, 0], [100, 200]]), [[0, 100]]);
});

test("repeated interval subtraction keeps every offered ten-mm cell outside the original obstacles", () => {
  for (let count = 0; count < 60; count++) {
    const blockers: [number, number][] = Array.from({ length: 7 }, (_, i) => {
      const start = ((count * 73 + i * 137) % 1400) - 200 + .2;
      return [start, start + 15 + ((count * 31 + i * 11) % 250)];
    });
    const free = subtractKitchenIntervals([0, 1000], blockers);
    for (let index = 0; index < free.length; index++) {
      const [from, to] = free[index];
      assert.equal(from % 10, 0);
      assert.equal(to % 10, 0);
      assert.ok(to - from >= 10 && from >= 0 && to <= 1000);
      if (index) assert.ok(free[index - 1][1] <= from);
      assert.ok(blockers.every(([start, end]) => Math.min(to, end) - Math.max(from, start) <= 0));
    }
  }
});

test("a refrigerator blocks only its part of an upper reservation; insertion preserves both margins, neighbours and their quotes", () => {
  const base: Product = { ...productTemplate("kitchen-base"), id: "partial-base", active: true };
  const upper: Product = {
    ...productTemplate("cabinet"), id: "partial-upper", name: "Alacena de prueba", category: "Cocina", active: true,
    limits: { width: { min: 300, max: 1200 }, height: { min: 500, max: 1000 }, depth: { min: 250, max: 450 } },
    defaults: { ...base.defaults, width: 600, height: 700, depth: 300, modules: 1 },
  };
  const furniture = (id: string, product: Product, row: "base" | "wall") => ({
    id, kind: "furniture" as const, wall: "a" as const, row,
    productId: product.id, config: { ...product.defaults },
  });
  const plan: KitchenPlan = {
    layout: "straight", walls: { a: 3000, b: 2400 }, roomHeight: 2700, wallElevation: 1500,
    install: false, transport: false,
    items: [
      { id: "fridge", kind: "fridge", wall: "a", row: "tall", width: 900, height: 2000, depth: 650 },
      { id: "upper-air", kind: "space", wall: "a", row: "wall", width: 1800, height: 700, depth: 300 },
      furniture("upper-neighbour", upper, "wall"), furniture("base-neighbour", base, "base"),
    ],
  };
  const quote = buildKitchen(plan, [base, upper], defaultSettings).result;
  const before = structuredClone({ plan, quote });
  const slot = getKitchenSlots(plan, quote).find((space) => space.replaceId === "upper-air");
  assert.ok(slot, "the unoccupied part of a reservation must remain selectable");
  assert.equal(slot.offset, 900);
  assert.equal(slot.leadingSpace, 900);
  assert.equal(slot.widthAvailable, 900);
  assert.equal(slot.replaceWidth, 1800);

  const result = buildFurniture(upper, upper.defaults, defaultSettings);
  const product = { ...publicProduct(upper, result.price), preview: publicFurnitureResult(result, upper) };
  const fitted = fitKitchenSlotProduct(product, slot);
  assert.ok(fitted);
  assert.equal(fitted.width, 600);
  let sequence = 0;
  const added = insertKitchenModule(plan, slot, product, fitted, () => `partial-${++sequence}`);
  const row = added.plan.items.filter((item) => item.wall === "a" && item.row === "wall");
  assert.deepEqual(row.map((item) => [item.kind, item.kind === "furniture" ? item.config.width : item.width]),
    [["space", 900], ["furniture", 600], ["space", 300], ["furniture", 600]]);
  const after = buildKitchen(added.plan, [base, upper], defaultSettings).result;
  const selected = after.modules.find((module) => module.id === added.selected)!;
  assert.equal(selected.position[0] + after.envelope.width / 2 - selected.size[0] / 2, 900);
  assert.equal(selected.position[1] - selected.size[1] / 2, 1500);
  for (const id of ["fridge", "upper-neighbour", "base-neighbour"]) {
    const original = quote.modules.find((module) => module.id === id)!;
    const preserved = after.modules.find((module) => module.id === id)!;
    assert.deepEqual(preserved.position, original.position);
    assert.equal(preserved.price, original.price);
  }
  assert.equal(after.price, quote.price! + buildFurniture(upper, fitted, defaultSettings).price);
  assert.equal(after.servicesPrice, quote.servicesPrice);
  assert.deepEqual({ plan, quote }, before);
});
