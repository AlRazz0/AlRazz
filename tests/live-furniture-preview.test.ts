import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { buildFurniture, defaultSettings, publicMaterials, type Config, type Product } from "../lib/furniture.ts";
import { constructionTemplates, productTemplate } from "../lib/product-templates.ts";
import { publicGeometry } from "../lib/public-geometry.ts";
import { publicFurnitureResult, publicProduct } from "../lib/public-product.ts";
import { buildKitchen, type KitchenPlan } from "../lib/kitchen.ts";
import { createLiveFurniturePreview, createLiveKitchenPreview } from "../src/live-furniture-preview.ts";
import type { PublicProduct } from "../src/types.ts";

function publicFixture(product: Product): PublicProduct {
  const result = buildFurniture(product, product.defaults, defaultSettings);
  return { ...publicProduct(product, result.price), preview: publicFurnitureResult(result, product) };
}
const materials = publicMaterials(defaultSettings);

test("all supported constructions use the server engine's exact public geometry with no rate inputs", () => {
  for (const template of constructionTemplates) {
    const product = structuredClone(template);
    product.active = true;
    product.pricing = { basis: "linear-meter", amount: 9876 };
    const publicModel = publicFixture(product);
    const before = structuredClone({ publicModel, materials });
    const preview = createLiveFurniturePreview(publicModel, materials);
    const result = preview(product.defaults);
    const authoritative = buildFurniture(product, product.defaults, defaultSettings);
    assert.deepEqual(result.geometry, publicGeometry(authoritative.panels, authoritative.fixtures), product.construction?.kind);
    assert.deepEqual(result.config, product.defaults);
    assert.deepEqual(Object.keys(result).sort(), ["config", "geometry"]);
    assert.equal("basePrice" in publicModel, false);
    assert.equal("amount" in publicModel.pricing!, false);
    assert.ok(materials.every(material => !("price" in material)));
    assert.deepEqual({ publicModel, materials }, before);
  }
});

test("glass fronts, aluminum frames and hanging rails retain the same geometry and hinges", () => {
  const product = productTemplate("cabinet");
  product.frontOptions = ["melamine", "glass", "aluminum-glass"];
  product.defaults = { ...product.defaults, height: 1200, doors: "full", handle: "exterior" };
  const preview = createLiveFurniturePreview(publicFixture(product), materials);
  for (const front of product.frontOptions) {
    const config = { ...product.defaults, front };
    const local = preview(config);
    const authoritative = buildFurniture(product, config, defaultSettings);
    assert.deepEqual(local.geometry, publicGeometry(authoritative.panels, authoritative.fixtures));
    assert.ok(local.geometry.some(panel => panel.door && panel.hinge));
    if (front !== "melamine") assert.ok(local.geometry.some(panel => panel.surface === front));
  }
  const wardrobe = productTemplate("wardrobe");
  const local = createLiveFurniturePreview(publicFixture(wardrobe), materials)(wardrobe.defaults);
  assert.ok(local.geometry.some(panel => panel.shape === "cylinder" && panel.material === "metal"));
});

test("consecutive measure changes return a new visual immediately and never modify a prior preview or snapshot", () => {
  const product = productTemplate("cabinet");
  const publicModel = publicFixture(product);
  const snapshot = structuredClone(publicModel.preview);
  const preview = createLiveFurniturePreview(publicModel, materials);
  const first = preview(product.defaults);
  const before = structuredClone(first);
  const nextConfig = { ...product.defaults, width: product.defaults.width + 10 };
  const next = preview(nextConfig);
  assert.notDeepEqual(next.geometry, first.geometry);
  assert.equal(next.config.width, nextConfig.width);
  assert.ok(next.geometry.some(panel => panel.size[0] === 18 && panel.position[0] === nextConfig.width / 2 - 9));
  next.config.width = 999;
  next.geometry[0].size[0] = 999;
  assert.deepEqual(first, before);
  assert.deepEqual(publicModel.preview, snapshot);
  assert.equal(nextConfig.width, product.defaults.width + 10);
});

test("private monetary fields cannot affect the visual and manufacturing instructions never leave this helper", () => {
  const product = productTemplate("cabinet");
  product.extras = [{ id: "finish-option", name: "Complemento", active: true, maxQuantity: 3, pricing: { basis: "square-meter", plane: "front", amount: 700 } }];
  product.defaults = { ...product.defaults, extras: [{ id: "finish-option", quantity: 2 }] };
  const publicModel = publicFixture(product);
  const original = createLiveFurniturePreview(publicModel, materials)(product.defaults);
  // Simulate accidental extra fields in a caller: the explicit projection drops them.
  const poisoned = { ...publicModel, basePrice: 99999, pricing: { basis: "unit", amount: 99999 }, publicPrice: 99999,
    extras: publicModel.extras!.map(extra => ({ ...extra, pricing: { ...extra.pricing, amount: 99999 } })) } as unknown as PublicProduct;
  const poisonedMaterials = materials.map(material => ({ ...material, price: 99999 }));
  assert.deepEqual(createLiveFurniturePreview(poisoned, poisonedMaterials)(product.defaults), original);
  const denied = new Set(["price", "basePrice", "amount", "cost", "unitCost", "breakdown", "panels", "fixtures", "materialName", "grain", "edges", "thickness", "lengthAxis", "widthAxis"]);
  const inspect = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) { assert.equal(denied.has(key), false, key); inspect(entry); }
  };
  inspect(original);
});

test("invalid dimensions, spans, materials and extras are rejected using the existing validation rules", () => {
  const product = productTemplate("cabinet");
  const preview = createLiveFurniturePreview(publicFixture(product), materials);
  assert.throws(() => preview({ ...product.defaults, width: product.defaults.width + 1 }));
  assert.throws(() => preview({ ...product.defaults, width: 1800, modules: 1 }), /750 mm/);
  assert.throws(() => preview({ ...product.defaults, finish: "not-an-active-finish" }), /material/i);
  assert.throws(() => preview({ ...product.defaults, extras: [{ id: "not-offered", quantity: 1 }] }), /no está disponible/);
  assert.doesNotThrow(() => preview(product.defaults), "a rejected change cannot poison later valid frames");
});

test("the hot path updates varied configurations across six constructions within measured frame times", t => {
  const durations: number[] = [];
  let rendered = 0, panels = 0;
  const preparationStarted = performance.now();
  const fixtures = constructionTemplates.map(product => ({ product, preview: createLiveFurniturePreview(publicFixture(product), materials) }));
  const preparationMs = performance.now() - preparationStarted;
  for (const { product, preview } of fixtures) {
    for (let warmup = 0; warmup < 10; warmup++) preview(product.defaults);
    for (let index = 0; index < 100; index++) {
      const width = Math.max(product.limits.width.min, Math.min(product.limits.width.max, product.defaults.width - (index % 3) * 10));
      const config: Config = { ...product.defaults, width };
      const started = performance.now();
      const result = preview(config);
      durations.push(performance.now() - started);
      assert.equal(result.config.width, width);
      rendered++; panels += result.geometry.length;
    }
  }
  assert.equal(rendered, 600);
  assert.ok(panels > rendered);
  durations.sort((a, b) => a - b);
  const totalMs = durations.reduce((sum, duration) => sum + duration, 0);
  t.diagnostic(JSON.stringify({ configurations: rendered, preparationMs: +preparationMs.toFixed(3), totalMs: +totalMs.toFixed(3), meanMs: +(totalMs / rendered).toFixed(4), p95Ms: +durations[Math.floor(rendered * .95)].toFixed(4), maximumMs: +durations[rendered - 1].toFixed(4) }));
});

function kitchenFixtures() {
  const base: Product = { ...productTemplate("kitchen-base"), id: "live-kitchen-base", active: true, pricing: { basis: "unit", amount: 321 } };
  const upper: Product = {
    ...productTemplate("cabinet"), id: "live-kitchen-upper", category: "Cocina", active: true,
    frontOptions: ["melamine", "glass", "aluminum-glass"],
    limits: { width: { min: 300, max: 1200 }, height: { min: 500, max: 1000 }, depth: { min: 250, max: 450 } },
    defaults: { ...base.defaults, width: 600, height: 700, depth: 300, modules: 1, front: "aluminum-glass", handle: "exterior" },
  };
  const products = [base, upper];
  const item = (id: string, product: Product, row: "base" | "wall", wall: "a" | "b" = "a"): KitchenPlan["items"][number] => ({ id, kind: "furniture", productId: product.id, wall, row, config: { ...product.defaults } });
  const plan: KitchenPlan = {
    layout: "straight", walls: { a: 3000, b: 3000 }, roomHeight: 2700, wallElevation: 1500, install: true, transport: true,
    items: [item("left", base, "base"), { id: "space", kind: "space", wall: "a", row: "base", width: 50, height: 900, depth: 600 }, item("right", base, "base"), item("upper", upper, "wall")],
  };
  return { base, upper, products, item, plan };
}

test("live kitchens preserve exact shared-engine placement, hinges and envelope while excluding every price", () => {
  const { products, item, base, upper, plan } = kitchenFixtures();
  const publicModels = products.map(publicFixture);
  const preview = createLiveKitchenPreview(publicModels, materials);
  const before = structuredClone({ publicModels, materials, plan });
  const corner: KitchenPlan = { ...plan, layout: "l", items: [...plan.items, item("corner-base", base, "base", "b"), item("corner-upper", upper, "wall", "b")] };
  for (const input of [plan, corner]) {
    const local = preview(input);
    const authoritative = buildKitchen(input, products, defaultSettings).result;
    assert.deepEqual(local.plan, authoritative.plan);
    assert.deepEqual(local.geometry, authoritative.geometry);
    assert.deepEqual(local.envelope, authoritative.envelope);
    assert.deepEqual(local.materials, authoritative.materials);
    assert.deepEqual(local.modules, authoritative.modules.map(({ price: _price, ...module }) => module));
    assert.deepEqual(Object.keys(local).sort(), ["envelope", "geometry", "materials", "modules", "plan"]);
    assert.ok(local.modules.every(module => !("price" in module)));
    assert.ok(local.geometry.some(panel => panel.door && panel.hinge));
    const denied = new Set(["price", "furniturePrice", "servicesPrice", "basePrice", "amount", "cost", "snapshot", "breakdown", "panels", "fixtures", "settings"]);
    const inspect = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      for (const [key, entry] of Object.entries(value)) { assert.equal(denied.has(key), false, key); inspect(entry); }
    };
    inspect(local);
  }
  assert.deepEqual({ publicModels, materials, plan }, before);
});

test("kitchen previews reject physical overlap or bounds errors and never alter a prior valid visual", () => {
  const { products, plan } = kitchenFixtures();
  const preview = createLiveKitchenPreview(products.map(publicFixture), materials);
  const valid = preview(plan), before = structuredClone(valid);
  const overlap = structuredClone(plan);
  if (overlap.items[0].kind === "furniture") {
    overlap.items[0].row = "tall";
    overlap.items[0].productId = "live-kitchen-tall";
    overlap.items[0].config = { ...overlap.items[0].config, height: 2000, doors: "none" };
  }
  const tall: Product = { ...products[0], id: "live-kitchen-tall", construction: { kind: "cabinet" }, limits: { ...products[0].limits, height: { min: 1600, max: 2200 } }, defaults: { ...products[0].defaults, height: 2000, doors: "none" } };
  const withTall = createLiveKitchenPreview([...products, tall].map(publicFixture), materials);
  assert.throws(() => withTall(overlap), /cruza/i);
  assert.throws(() => preview({ ...plan, walls: { a: 1000, b: 3000 } }), /superan su longitud/i);
  const next = preview(plan);
  next.modules[0].position[0] = 9999;
  assert.deepEqual(valid, before);
});

test("sixteen-module kitchen frame times are measured with one catalog factory and no request", t => {
  const product: Product = {
    ...productTemplate("cabinet"), id: "live-sixteen", category: "Cocina", active: true,
    limits: { width: { min: 300, max: 600 }, height: { min: 700, max: 1000 }, depth: { min: 450, max: 650 } },
    defaults: { ...productTemplate("kitchen-base").defaults, width: 300, height: 800, depth: 600, modules: 1, shelves: 1, doors: "full" },
  };
  const initial: KitchenPlan = {
    layout: "straight", walls: { a: 6000, b: 3000 }, roomHeight: 2700, wallElevation: 1500, install: false, transport: false,
    items: Array.from({ length: 16 }, (_, index) => ({ id: `live-${index}`, kind: "furniture", wall: "a", row: "base", productId: product.id, config: { ...product.defaults } })),
  };
  const preview = createLiveKitchenPreview([publicFixture(product)], materials);
  for (let warmup = 0; warmup < 5; warmup++) preview(initial);
  const durations: number[] = [];
  for (let index = 0; index < 120; index++) {
    const plan = structuredClone(initial);
    if (plan.items[0].kind === "furniture") plan.items[0].config.width += (index % 5) * 10;
    const started = performance.now();
    const visual = preview(plan);
    durations.push(performance.now() - started);
    assert.equal(visual.modules.length, 16);
    assert.ok(visual.geometry.length > 16);
  }
  durations.sort((a, b) => a - b);
  const totalMs = durations.reduce((sum, duration) => sum + duration, 0);
  t.diagnostic(JSON.stringify({ kitchenModules: 16, configurations: durations.length, totalMs: +totalMs.toFixed(3), meanMs: +(totalMs / durations.length).toFixed(4), p95Ms: +durations[Math.floor(durations.length * .95)].toFixed(4), maximumMs: +durations.at(-1)!.toFixed(4) }));
});
