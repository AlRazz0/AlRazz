import assert from "node:assert/strict";
import test from "node:test";
import { defaultSettings, type Product } from "../lib/furniture.ts";
import { buildKitchen, kitchenItemSchema, kitchenPlanSchema, type KitchenPlan } from "../lib/kitchen.ts";
import { productTemplate } from "../lib/product-templates.ts";

const product: Product = { ...productTemplate("kitchen-base"), id: "gap-test-base", active: true };
const furniture = {
  id: "base", kind: "furniture" as const, wall: "a" as const, row: "base" as const,
  productId: product.id, config: { ...product.defaults },
};
const plan = (items: KitchenPlan["items"]): KitchenPlan => ({
  layout: "straight", walls: { a: 3000, b: 2400 }, roomHeight: 2700,
  wallElevation: 1500, install: true, transport: true, items,
});
const space = (width: number) => ({
  id: "alignment", kind: "space" as const, wall: "a" as const, row: "base" as const,
  width, height: 900, depth: 600,
});

test("ten- and fifty-mm alignment spaces pass the schema without adding boards, fixtures or charges", () => {
  const baseline = buildKitchen(plan([furniture]), [product], defaultSettings);
  for (const width of [10, 50]) {
    const input = plan([space(width), furniture]);
    const before = structuredClone(input);
    assert.doesNotThrow(() => kitchenPlanSchema.parse(input));
    const result = buildKitchen(input, [product], defaultSettings);
    assert.equal(result.result.modules.find((module) => module.id === "alignment")?.price, 0);
    assert.equal(result.result.geometry.length, baseline.result.geometry.length);
    assert.equal(result.modules.length, 1);
    assert.deepEqual(result.modules[0].result, baseline.modules[0].result,
      "an alignment reservation must not change the manufactured furniture");
    assert.equal(result.result.price, baseline.result.price);
    assert.equal(result.result.furniturePrice, baseline.result.furniturePrice);
    assert.equal(result.result.servicesPrice, baseline.result.servicesPrice);
    assert.deepEqual(input, before);
  }
});

test("small alignment gaps do not relax appliance reservation dimensions", () => {
  for (const kind of ["fridge", "cooker", "sink-gap"] as const) {
    const reservation = { ...space(50), id: "equipment", kind, row: kind === "fridge" ? "tall" as const : "base" as const };
    assert.equal(kitchenItemSchema.safeParse(reservation).success, false, kind);
    assert.throws(() => buildKitchen(plan([furniture, reservation]), [product], defaultSettings));
    assert.equal(kitchenItemSchema.safeParse({ ...reservation, width: 100 }).success, true, kind);
  }
});

test("alignment reservations still reject zero, nonfinite or off-grid widths and keep height/depth bounds", () => {
  for (const width of [0, 5, 15, 2001, NaN, Infinity])
    assert.equal(kitchenItemSchema.safeParse(space(width)).success, false, String(width));
  assert.equal(kitchenItemSchema.safeParse({ ...space(10), height: 50 }).success, false);
  assert.equal(kitchenItemSchema.safeParse({ ...space(50), depth: 50 }).success, false);
});
