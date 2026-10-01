import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildKitchen, type KitchenPlan } from "../lib/kitchen.ts";
import { defaultSettings, productSchema } from "../lib/furniture.ts";
import { productTemplate } from "../lib/product-templates.ts";
import {
  moveKitchenItem,
  startingKitchen,
} from "../src/kitchen-planner-state.ts";

test("starter kitchen fits current catalog modules without changing their defaults", () => {
  const catalog = JSON.parse(
    readFileSync(
      new URL("../catalog/coleccion-cocinas-roperos.json", import.meta.url),
      "utf8",
    ),
  );
  const products = catalog.products.map((product: unknown) => ({
    ...productSchema.parse(product),
    active: true,
  }));
  const before = structuredClone(products);
  const initial = startingKitchen(products);
  const result = buildKitchen(initial, products, defaultSettings);
  assert.ok(result.result.price > 0);
  assert.ok(initial.items.some((item) => item.kind === "sink-gap"));
  assert.ok(initial.items.some((item) => item.kind === "fridge"));
  assert.deepEqual(products, before);
  for (const item of initial.items)
    if (item.kind === "furniture") {
      const product = products.find(
        (product: { id: string }) => product.id === item.productId,
      )!;
      assert.deepEqual(item.config, {
        ...product.defaults,
        install: false,
        transport: false,
      });
    }
});

test("starter adapts to wide modules and can begin with a lone wall cabinet or tall pantry", () => {
  const wide = { ...productTemplate("kitchen-base"), active: true };
  wide.defaults = { ...wide.defaults, width: 2600, modules: 5 };
  wide.limits.width = { min: 2600, max: 2600 };
  const upper = {
    ...productTemplate("cabinet"),
    active: true,
    category: "Cocina" as const,
  };
  upper.defaults = {
    ...upper.defaults,
    width: 900,
    height: 600,
    depth: 300,
    shelves: 1,
    modules: 2,
  };
  upper.limits = {
    width: { min: 900, max: 900 },
    height: { min: 600, max: 600 },
    depth: { min: 300, max: 300 },
  };
  const tall = {
    ...productTemplate("cabinet"),
    active: true,
    category: "Cocina" as const,
  };
  tall.defaults = {
    ...tall.defaults,
    width: 900,
    height: 2200,
    depth: 600,
    doors: "none" as const,
  };
  tall.limits = {
    width: { min: 900, max: 900 },
    height: { min: 2200, max: 2200 },
    depth: { min: 600, max: 600 },
  };
  for (const products of [[wide], [upper], [tall]]) {
    const initial = startingKitchen(products);
    assert.ok(initial.items.some((item) => item.kind === "furniture"));
    assert.doesNotThrow(() => buildKitchen(initial, products, defaultSettings));
  }
  assert.equal(
    startingKitchen([wide]).items.filter((item) => item.kind === "furniture")
      .length,
    1,
  );
  assert.equal(startingKitchen([{ ...wide, active: false }]).items.length, 0);
});

test("reordering follows the visible wall lane and leaves unrelated rows untouched", () => {
  const item = (
    id: string,
    wall: "a" | "b",
    row: "base" | "wall" | "tall",
  ) => ({
    id,
    wall,
    row,
    kind: "space" as const,
    width: 600,
    height: 700,
    depth: 300,
  });
  const plan: KitchenPlan = {
    layout: "l",
    walls: { a: 4000, b: 3000 },
    wallElevation: 1500,
    install: false,
    transport: false,
    items: [
      item("a1", "a", "base"),
      item("aw", "a", "wall"),
      item("b1", "b", "base"),
      item("a2", "a", "tall"),
      item("a3", "a", "base"),
    ],
  };
  const original = structuredClone(plan);
  const moved = moveKitchenItem(plan, "a1", 1);
  assert.deepEqual(
    moved.items.map((item) => item.id),
    ["a2", "aw", "b1", "a1", "a3"],
  );
  assert.deepEqual(plan, original);
  assert.deepEqual(moveKitchenItem(moved, "a1", -1), plan);
  assert.equal(moveKitchenItem(plan, "aw", 1), plan);
  assert.equal(moveKitchenItem(plan, "a1", -1), plan);
  assert.equal(moveKitchenItem(plan, "missing", 1), plan);
});
