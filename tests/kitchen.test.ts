import assert from "node:assert/strict";
import test from "node:test";
import { buildKitchen, kitchenPlanSchema, type KitchenPlan } from "../lib/kitchen.ts";
import { buildFurniture, defaultSettings, type Product } from "../lib/furniture.ts";
import { productTemplate } from "../lib/product-templates.ts";

const base: Product = { ...productTemplate("kitchen-base"), active: true };
const wall: Product = {
  ...productTemplate("cabinet"), id: "test-alacena", name: "Alacena de prueba", category: "Cocina", active: true,
  limits: { width: { min: 400, max: 1200 }, height: { min: 500, max: 1000 }, depth: { min: 250, max: 450 } },
  defaults: { ...base.defaults, width: 600, height: 700, depth: 300, shelves: 1, modules: 1 },
};
const tall: Product = {
  ...productTemplate("cabinet"), id: "test-columna", name: "Columna de prueba", category: "Cocina", active: true,
  limits: { width: { min: 400, max: 1200 }, height: { min: 1600, max: 2200 }, depth: { min: 450, max: 650 } },
  defaults: { ...base.defaults, width: 600, height: 2000, depth: 600, shelves: 3, modules: 1, doors: "none" },
};
const products = [base, wall, tall];
const furniture = (id: string, product: Product, row: "base" | "wall" | "tall" = "base", face: "a" | "b" = "a") => ({ id, kind: "furniture" as const, wall: face, row, productId: product.id, config: { ...product.defaults } });
const plan = (items: KitchenPlan["items"]): KitchenPlan => ({ layout: "straight", walls: { a: 3000, b: 2400 }, roomHeight: 2600, wallElevation: 1450, install: true, transport: true, items });

test("kitchen uses one manufacturing engine and charges installation/delivery once", () => {
  const input = plan([furniture("base1", base), furniture("base2", base), furniture("wall1", wall, "wall")]);
  input.items[0].kind === "furniture" && (input.items[0].config.install = true);
  input.items[1].kind === "furniture" && (input.items[1].config.transport = true);
  const original = structuredClone(input);
  const snapshot = buildKitchen(input, products, defaultSettings);
  const expected = 2 * buildFurniture(base, base.defaults, defaultSettings).price + buildFurniture(wall, wall.defaults, defaultSettings).price;
  assert.equal(snapshot.result.furniturePrice, expected);
  assert.equal(snapshot.result.servicesPrice, defaultSettings.installation + defaultSettings.delivery);
  assert.equal(snapshot.result.price, expected + 200);
  assert.ok(snapshot.modules.every((module) => !module.config.install && !module.config.transport));
  assert.ok(snapshot.modules.every((module) => module.result.breakdown.installation === 0 && module.result.breakdown.delivery === 0));
  assert.deepEqual(input, original);
  assert.equal(snapshot.result.geometry.length, snapshot.modules.reduce((n, module) => n + module.result.panels.length + (module.result.fixtures?.length ?? 0), 0));
});

test("L layout preserves local sizes while rotating every panel and retaining corner clearance", () => {
  const input = { ...plan([furniture("a1", base), furniture("b1", base, "base", "b")]), layout: "l" as const };
  const snapshot = buildKitchen(input, products, defaultSettings);
  const a = snapshot.result.modules[0], b = snapshot.result.modules[1];
  assert.equal(b.rotationY, -Math.PI / 2);
  assert.equal(b.position[2] - base.defaults.width / 2 - (a.position[2] + base.defaults.depth / 2), 50);
  const count = snapshot.modules[0].result.panels.length;
  const rotated = snapshot.result.geometry.slice(count);
  assert.equal(rotated.length, snapshot.modules[1].result.panels.length);
  rotated.forEach((panel, index) => {
    const original = snapshot.modules[1].result.panels[index];
    assert.deepEqual(panel.size, original.size);
    assert.equal(panel.rotationY, -Math.PI / 2);
    assert.equal(panel.position[0], b.position[0] - original.position[2]);
    assert.equal(panel.position[2], b.position[2] + original.position[0]);
  });
  assert.throws(() => buildKitchen({ ...input, walls: { a: 3000, b: 1000 } }, products, defaultSettings), /superan su longitud/);
});

test("kitchen rejects overlap with tall units and permits explicit air spacers", () => {
  assert.throws(() => buildKitchen(plan([furniture("tall1", tall, "tall"), furniture("wall1", wall, "wall")]), products, defaultSettings), /se cruza/);
  const spacer = { id: "air", kind: "space" as const, wall: "a" as const, row: "wall" as const, width: 600, height: 700, depth: 300 };
  const result = buildKitchen(plan([furniture("tall1", tall, "tall"), spacer, furniture("wall1", wall, "wall")]), products, defaultSettings);
  assert.equal(result.result.modules.find((item) => item.id === "air")?.price, 0);
  assert.ok(result.result.geometry.every((panel) => panel.surface !== "placeholder"));
  assert.equal(result.modules.length, 2);
});

test("appliance reservations have no cuts, accessories or charge and cannot intersect upper units", () => {
  const fridge = { id: "fridge", kind: "fridge" as const, wall: "a" as const, row: "tall" as const, width: 900, height: 1900, depth: 650 };
  const input = plan([fridge, furniture("base1", base)]);
  const result = buildKitchen(input, products, defaultSettings);
  assert.equal(result.modules.length, 1);
  assert.equal(result.result.modules[0].price, 0);
  assert.equal(result.result.geometry.filter((panel) => panel.surface === "placeholder").length, 1);
  assert.equal(result.result.furniturePrice, buildFurniture(base, base.defaults, defaultSettings).price);
  assert.throws(() => buildKitchen(plan([fridge, furniture("wall1", wall, "wall")]), products, defaultSettings), /se cruza/);
});

test("kitchen validates room size, per-row use, active products and strict plan limits", () => {
  const input = plan([furniture("base1", base), furniture("wall1", wall, "wall")]);
  assert.throws(() => buildKitchen({ ...input, wallElevation: 2000 }, products, defaultSettings), /altura disponible/);
  assert.throws(() => buildKitchen(plan([furniture("base1", base, "wall")]), products, defaultSettings), /como alacena/);
  assert.throws(() => buildKitchen(input, [{ ...base, active: false }, wall], defaultSettings), /ya no está disponible/);
  assert.throws(() => buildKitchen(input, [{ ...base, category: "Auxiliares" }, wall], defaultSettings), /colección de cocina/);
  assert.throws(() => kitchenPlanSchema.parse({ ...input, items: [input.items[0], input.items[0]] }));
  assert.throws(() => kitchenPlanSchema.parse({ ...input, walls: { a: 3001, b: 2400 } }));
  assert.throws(() => kitchenPlanSchema.parse({ ...input, items: Array.from({ length: 17 }, (_, n) => furniture(`base${n}`, base)) }));
  assert.throws(() => kitchenPlanSchema.parse({ ...input, items: [furniture("base1", base, "base", "b")] }));
  assert.throws(() => kitchenPlanSchema.parse({ ...input, price: 1 }));
});

test("glass fronts and configured unit/linear pricing flow into kitchen quotes without private rates", () => {
  const priced: Product = { ...base, pricing: { basis: "linear-meter", amount: 1000 }, frontOptions: ["melamine", "glass", "aluminum-glass"] };
  const item = furniture("glass1", priced);
  item.config = { ...item.config, front: "aluminum-glass", handle: "exterior" };
  const result = buildKitchen(plan([item]), [priced], defaultSettings);
  assert.equal(result.result.furniturePrice, buildFurniture(priced, item.config, defaultSettings).price);
  assert.ok(result.result.geometry.some((panel) => panel.surface === "aluminum-glass"));
  const publicJSON = JSON.stringify(result.result);
  for (const forbidden of ["unitCost", "breakdown", "basePrice", "frontRates", '"amount"', '"pricing"', '"panels"']) assert.ok(!publicJSON.includes(forbidden), forbidden);
});

test("mixed kitchen doors retain the handle selected for each individual module", () => {
  const push = furniture("push", base);
  const exterior = furniture("external", base);
  const recessed = furniture("recessed", base);
  push.config.handle = "push";
  exterior.config.handle = "exterior";
  recessed.config.handle = "embutido";
  const built = buildKitchen(plan([push, exterior, recessed]), products, defaultSettings);
  const doors = built.result.geometry.filter((panel) => panel.door);
  assert.deepEqual(doors.map((panel) => panel.handle), ["push", "exterior", "embutido"]);
  assert.ok(built.result.geometry.filter((panel) => !panel.door).every((panel) => panel.handle === undefined));
});
