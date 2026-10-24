import assert from "node:assert/strict";
import test from "node:test";
import { defaultSettings, type Product } from "../lib/furniture.ts";
import { buildKitchen, publicKitchenQuote, type KitchenPlan, type KitchenSnapshot } from "../lib/kitchen.ts";
import { productTemplate } from "../lib/product-templates.ts";
import type { VisualPanel } from "../lib/public-geometry.ts";

const single: Product = { ...productTemplate("kitchen-base"), id: "test-single", active: true };
const double: Product = { ...single, id: "test-double", defaults: { ...single.defaults, width: 1200, modules: 2 } };
const item = (id: string, product: Product, wall: "a" | "b" = "a") => ({
  id, kind: "furniture" as const, row: "base" as const, wall,
  productId: product.id, config: { ...product.defaults },
});
const plan = (items: KitchenPlan["items"], layout: KitchenPlan["layout"] = "straight"): KitchenPlan => ({
  items, layout, walls: { a: 3000, b: 2400 }, roomHeight: 2600,
  wallElevation: 1450, install: true, transport: true,
});
const withoutHinges = (geometry: VisualPanel[]) => geometry.map(({ hinge: _hinge, ...panel }) => panel);

function historical(snapshot: KitchenSnapshot) {
  snapshot.result.geometry = withoutHinges(snapshot.result.geometry);
  // Deliberately differ from today's engine output: these saved amounts must win.
  snapshot.result.price = 123456;
  snapshot.result.furniturePrice = 120000;
  snapshot.result.servicesPrice = 3456;
  return snapshot;
}

test("historical independent one-leaf furniture stays left-hinged per module, not alternated across the whole kitchen", () => {
  const saved = historical(buildKitchen(plan([item("one", single), item("two", single)]), [single], defaultSettings));
  const before = structuredClone(saved);
  const quote = publicKitchenQuote(saved);
  assert.deepEqual(quote.geometry.filter((panel) => panel.door).map((panel) => panel.hinge), ["left", "left"]);
  assert.deepEqual(withoutHinges(quote.geometry), saved.result.geometry);
  assert.equal(quote.price, 123456);
  assert.equal(quote.furniturePrice, 120000);
  assert.equal(quote.servicesPrice, 3456);
  assert.strictEqual(quote.modules, saved.result.modules);
  assert.deepEqual(saved, before, "public projection must not write hinge metadata into the historical snapshot");
});

test("historical rotated pairs retain exact world geometry and handles through appliance placeholders and empty gaps", () => {
  const first = item("one", single);
  first.config.handle = "embutido";
  const pair = item("pair", double, "b");
  pair.config.handle = "exterior";
  const saved = historical(buildKitchen(plan([
    { id: "fridge", kind: "fridge", wall: "a", row: "tall", width: 500, height: 1900, depth: 650 },
    { id: "gap", kind: "space", wall: "a", row: "base", width: 100, height: 850, depth: 600 },
    first, pair,
  ], "l"), [single, double], defaultSettings));
  const before = structuredClone(saved);
  const quote = publicKitchenQuote(saved);
  const doors = quote.geometry.filter((panel) => panel.door);
  assert.deepEqual(doors.map((panel) => panel.hinge), ["left", "left", "right"]);
  assert.deepEqual(doors.map((panel) => panel.handle), ["embutido", "exterior", "exterior"]);
  assert.deepEqual(doors.slice(1).map((panel) => panel.rotationY), [-Math.PI / 2, -Math.PI / 2]);
  assert.equal(quote.geometry.filter((panel) => panel.surface === "placeholder").length, 1);
  assert.deepEqual(withoutHinges(quote.geometry), saved.result.geometry);
  assert.deepEqual(saved, before);
});

test("historical glass fixtures receive paired hinges without replacing surfaces or introducing board cuts", () => {
  const glass: Product = { ...double, id: "test-glass", frontOptions: ["melamine", "glass", "aluminum-glass"] };
  const selected = item("glass", glass, "b");
  selected.config.front = "aluminum-glass";
  selected.config.handle = "exterior";
  const saved = historical(buildKitchen(plan([selected], "l"), [glass], defaultSettings));
  const before = structuredClone(saved);
  const quote = publicKitchenQuote(saved);
  const doors = quote.geometry.filter((panel) => panel.door);
  assert.deepEqual(doors.map((panel) => panel.hinge), ["left", "right"]);
  assert.ok(doors.every((panel) => panel.surface === "aluminum-glass"));
  assert.equal(saved.modules[0].result.panels.filter((panel) => panel.door).length, 0);
  assert.deepEqual(withoutHinges(quote.geometry), saved.result.geometry);
  assert.deepEqual(saved, before);
});

test("explicit hinge metadata is authoritative and complete snapshots keep their existing public result", () => {
  const saved = buildKitchen(plan([item("pair", double)]), [double], defaultSettings);
  const doors = saved.result.geometry.filter((panel) => panel.door);
  doors[0].hinge = "right";
  doors[1].hinge = "left";
  const before = structuredClone(saved);
  assert.strictEqual(publicKitchenQuote(saved), saved.result);
  delete doors[1].hinge;
  const partialBefore = structuredClone(saved);
  const quote = publicKitchenQuote(saved);
  assert.deepEqual(quote.geometry.filter((panel) => panel.door).map((panel) => panel.hinge), ["right", "right"]);
  assert.deepEqual(saved, partialBefore);
  assert.equal(before.result.price, quote.price);
});

test("visual decoration keeps historical and current quote-only privacy while leaving every stored amount untouched", () => {
  const saved = historical(buildKitchen(plan([item("pair", double)]), [double], defaultSettings));
  const before = structuredClone(saved);
  const currentHidden = publicKitchenQuote(saved, [{ ...double, showPrice: false, basePrice: 999999 }]);
  assert.equal(currentHidden.price, null);
  assert.equal(currentHidden.furniturePrice, null);
  assert.equal(currentHidden.servicesPrice, null);
  assert.ok(currentHidden.modules.every((module) => module.price === null));
  assert.deepEqual(currentHidden.geometry.filter((panel) => panel.door).map((panel) => panel.hinge), ["left", "right"]);
  assert.deepEqual(saved, before);
  saved.modules[0].product.showPrice = false;
  assert.equal(publicKitchenQuote(saved, [{ ...double, showPrice: true }]).price, null,
    "publishing a model today must not expose a quote-only historical kitchen");
  assert.equal(saved.result.price, 123456);
});

test("unexpected historical shapes retain all saved geometry and prices rather than partially decorating the wrong parts", () => {
  const original = historical(buildKitchen(plan([item("one", single), item("pair", double)]), [single, double], defaultSettings));
  const changes: ((snapshot: KitchenSnapshot) => void)[] = [
    (snapshot) => { snapshot.result.geometry.pop(); },
    (snapshot) => { snapshot.modules[1].itemId = "missing-source"; },
    (snapshot) => { snapshot.modules[1].result.panels = undefined as unknown as typeof snapshot.modules[1]["result"]["panels"]; },
    (snapshot) => { snapshot.result.geometry[0].size = [999, 999, 999]; },
  ];
  for (const change of changes) {
    const saved = structuredClone(original);
    change(saved);
    const before = structuredClone(saved);
    const quote = publicKitchenQuote(saved);
    assert.strictEqual(quote.geometry, saved.result.geometry);
    assert.equal(quote.price, saved.result.price);
    assert.equal(quote.furniturePrice, saved.result.furniturePrice);
    assert.equal(quote.servicesPrice, saved.result.servicesPrice);
    assert.deepEqual(saved, before);
    assert.ok(quote.geometry.every((panel) => panel.hinge === undefined));
    const hidden = publicKitchenQuote(saved, [{ ...double, showPrice: false }]);
    assert.equal(hidden.price, null, "shape compatibility failures must never bypass price privacy");
  }
});
