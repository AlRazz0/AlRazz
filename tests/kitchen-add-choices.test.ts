import assert from "node:assert/strict";
import test from "node:test";
import { buildFurniture, defaultSettings, type Product } from "../lib/furniture.ts";
import { buildKitchen, type KitchenPlan, type KitchenQuote } from "../lib/kitchen.ts";
import { productTemplate } from "../lib/product-templates.ts";
import { publicFurnitureResult, publicProduct } from "../lib/public-product.ts";
import { getKitchenAddChoices } from "../src/kitchen-add-choices.ts";
import { insertKitchenModule } from "../src/kitchen-placement.ts";

const base: Product = { ...productTemplate("kitchen-base"), id: "choice-base", active: true };
const upper: Product = {
  ...productTemplate("cabinet"), id: "choice-upper", name: "Alacena", category: "Cocina", active: true,
  limits: { width: { min: 300, max: 1200 }, height: { min: 500, max: 1000 }, depth: { min: 250, max: 450 } },
  defaults: { ...base.defaults, width: 600, height: 700, depth: 300, modules: 1 },
};
const tall: Product = {
  ...productTemplate("cabinet"), id: "choice-tall", name: "Columna", category: "Cocina", active: true,
  limits: { width: { min: 400, max: 1200 }, height: { min: 1600, max: 2200 }, depth: { min: 500, max: 650 } },
  defaults: { ...base.defaults, width: 600, height: 2000, depth: 600, shelves: 3, modules: 1, doors: "none" },
};
const products = [base, upper, tall];
const publicFixture = (product: Product) => {
  const result = buildFurniture(product, product.defaults, defaultSettings);
  return { ...publicProduct(product, result.price), preview: publicFurnitureResult(result, product) };
};
const catalog = products.map(publicFixture);
const plan = (items: KitchenPlan["items"] = []): KitchenPlan => ({
  layout: "straight", walls: { a: 3600, b: 2400 }, roomHeight: 2700, wallElevation: 1500,
  install: false, transport: false, items,
});
const furniture = (id: string, product: Product, row: "base" | "wall" | "tall"): KitchenPlan["items"][number] => ({
  id, kind: "furniture", productId: product.id, wall: "a", row, config: structuredClone(product.defaults),
});
const quote = (input: KitchenPlan) => buildKitchen(input, products, defaultSettings).result;

test("add choices respect the requested row, remaining width and API product order", () => {
  const input = plan([furniture("upper", upper, "wall")]);
  const current = quote(input);
  const before = structuredClone({ input, current, catalog });
  const choices = getKitchenAddChoices(input, current, [catalog[2], catalog[0], catalog[1]], "a", "base");
  assert.deepEqual(choices.map(choice => choice.product.id), [base.id, upper.id]);
  assert.ok(choices.every(choice => !choice.space.replaceId && choice.space.row === "base" && choice.space.planFingerprint === JSON.stringify(input)));
  const upperChoices = getKitchenAddChoices(input, current, catalog, "a", "wall");
  assert.deepEqual(upperChoices.map(choice => choice.product.id), [upper.id], "a floor construction cannot be offered as an upper cabinet");
  for (const choice of choices) {
    const next = insertKitchenModule(input, choice.space, choice.product, choice.config, () => "add-base");
    assert.doesNotThrow(() => buildKitchen(next.plan, products, defaultSettings));
  }
  const full = { ...plan([furniture("first", base, "base"), furniture("last", base, "base")]), walls: { a: 1200, b: 2400 } };
  assert.deepEqual(getKitchenAddChoices(full, quote(full), catalog, "a", "base"), []);
  assert.deepEqual(getKitchenAddChoices(input, current, catalog, "b", "base"), []);
  assert.deepEqual({ input, current, catalog }, before);
});

test("an empty draft can start with base, upper or tall furniture without creating a model in the catalog", () => {
  const blank = plan();
  const before = structuredClone({ blank, catalog });
  for (const row of ["base", "wall", "tall"] as const) {
    const choices = getKitchenAddChoices(blank, undefined, catalog, "a", row);
    assert.ok(choices.length > 0);
    for (const choice of choices) {
      assert.equal(choice.space.row, row);
      assert.equal(choice.space.wall, "a");
      assert.equal(choice.space.planFingerprint, JSON.stringify(blank));
      const inserted = insertKitchenModule(blank, choice.space, choice.product, choice.config, () => `first-${row}`);
      assert.doesNotThrow(() => buildKitchen(inserted.plan, products, defaultSettings));
    }
  }
  assert.deepEqual(getKitchenAddChoices(blank, undefined, catalog, "a", "tall").map(choice => choice.product.id), [tall.id]);
  const corner = { ...blank, layout: "l" as const };
  assert.ok(getKitchenAddChoices(corner, undefined, catalog, "b", "base").length > 0);
  assert.deepEqual({ blank, catalog }, before);
});

test("reservations alone allow the first furniture while preserving the reserved lanes and known blockers", () => {
  const reserved = plan([{ id: "fridge", kind: "fridge", wall: "a", row: "tall", width: 900, height: 2000, depth: 650 }]);
  const before = structuredClone(reserved);
  for (const row of ["base", "wall"] as const) {
    const choices = getKitchenAddChoices(reserved, undefined, catalog, "a", row);
    assert.ok(choices.length > 0);
    const choice = choices.find(choice => choice.product.id === (row === "wall" ? upper.id : base.id))!;
    assert.ok(choice);
    assert.equal(choice.space.offset, 900);
    assert.equal(choice.space.leadingSpace, row === "wall" ? 900 : 0);
    let sequence = 0;
    const inserted = insertKitchenModule(reserved, choice.space, choice.product, choice.config, () => `reserved-${sequence++}`);
    assert.equal(inserted.plan.items[0].id, "fridge");
    assert.doesNotThrow(() => buildKitchen(inserted.plan, products, defaultSettings));
  }
  const air = plan([{ id: "margin", kind: "space", wall: "a", row: "base", width: 50, height: 900, depth: 600 }]);
  assert.equal(getKitchenAddChoices(air, undefined, catalog, "a", "base")[0].space.offset, 50);
  assert.deepEqual(reserved, before);
});

test("existing furniture requires a current, finite server quote; stale or malformed quotes never offer a fallback", () => {
  const input = plan([furniture("first", base, "base")]);
  const current = quote(input);
  assert.deepEqual(getKitchenAddChoices(input, undefined, catalog, "a", "base"), []);
  assert.deepEqual(getKitchenAddChoices({ ...input, install: true }, current, catalog, "a", "base"), []);
  assert.deepEqual(getKitchenAddChoices({ ...input, roomHeight: 2600 }, current, catalog, "a", "base"), []);
  const changed = structuredClone(input);
  if (changed.items[0].kind === "furniture") changed.items[0].config.depth -= 10;
  assert.deepEqual(getKitchenAddChoices(changed, current, catalog, "a", "base"), []);
  for (const broken of [
    { ...current, envelope: { ...current.envelope, width: NaN } },
    { ...current, modules: [] },
    { ...current, modules: [null] } as unknown as KitchenQuote,
    { ...current, modules: current.modules.map(module => ({ ...module, position: [Infinity, 0, 0] as [number, number, number] })) },
    { ...current, plan: undefined } as unknown as KitchenQuote,
  ]) assert.deepEqual(getKitchenAddChoices(input, broken, catalog, "a", "base"), []);
});

test("equivalent object key order is accepted and invalid reservation plans remain unoffered", () => {
  const input = plan([furniture("first", base, "base")]);
  const current = quote(input);
  const reordered = { items: input.items, transport: input.transport, install: input.install, wallElevation: input.wallElevation, roomHeight: input.roomHeight, walls: input.walls, layout: input.layout };
  assert.ok(getKitchenAddChoices(reordered, current, catalog, "a", "base").length > 0);
  const invalidReserve = plan([{ id: "bad", kind: "fridge", wall: "a", row: "tall", width: 50, height: 2000, depth: 650 }]);
  assert.deepEqual(getKitchenAddChoices(invalidReserve, undefined, catalog, "a", "base"), []);
  assert.deepEqual(getKitchenAddChoices({ ...plan(), walls: { a: 100, b: 2400 } }, undefined, catalog, "a", "base"), []);
  const inactive = catalog.map(product => ({ ...product, active: false }));
  assert.deepEqual(getKitchenAddChoices(plan(), undefined, inactive, "a", "base"), []);
});
