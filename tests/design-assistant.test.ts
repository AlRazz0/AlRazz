import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { buildFurniture, defaultSettings, getConstruction, productSchema, seedProducts, type Product } from "../lib/furniture.ts";
import { buildKitchen, type KitchenPlan } from "../lib/kitchen.ts";
import { summarizeKitchenSpace } from "../lib/kitchen-space-summary.ts";
import { productTemplate } from "../lib/product-templates.ts";
import { publicFurnitureResult } from "../lib/public-product.ts";
import { designAssistantInputSchema, getDesignRecommendations, type DesignAssistantInput, type DesignAssistantResult } from "../lib/design-assistant.ts";

const storage: Product = { ...productTemplate("cabinet"), id: "assistant-storage", name: "Almacenaje de prueba", active: true, defaults: { ...productTemplate("cabinet").defaults, doors: "full" }, pricing: { basis: "unit", amount: 400 } };
const wardrobe: Product = { ...productTemplate("wardrobe"), id: "assistant-wardrobe", active: true, pricing: { basis: "unit", amount: 700 } };
const desk: Product = { ...productTemplate("desk"), id: "assistant-desk", active: true, pricing: { basis: "unit", amount: 300 } };
const base: Product = { ...productTemplate("kitchen-base"), id: "assistant-base", active: true, pricing: { basis: "unit", amount: 200 } };
const upper: Product = {
  ...productTemplate("cabinet"), id: "assistant-upper", name: "Alacena de prueba", active: true, category: "Cocina", pricing: { basis: "unit", amount: 100 },
  limits: { width: { min: 300, max: 1200 }, height: { min: 500, max: 1000 }, depth: { min: 250, max: 450 } },
  defaults: { ...base.defaults, width: 600, height: 700, depth: 300, modules: 1 },
};
const input = (extra: Partial<DesignAssistantInput> = {}) => ({ purpose: "storage", width: 1900, height: 2400, depth: 600, ...extra });
const catalog = [storage, wardrobe, desk, base, upper];
function publicOnly(result: DesignAssistantResult) {
  const denied = new Set(["basePrice", "amount", "materialRate", "edgeRate", "doorHardware", "margin", "settings", "panels", "fixtures", "breakdown", "accessories", "unitCost", "cost", "snapshot"]);
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    for (const [key, entry] of Object.entries(node)) { assert.equal(denied.has(key), false, key); visit(entry); }
  };
  visit(result);
}

test("recommendations use published construction families and real server prices without mutating catalog or settings", () => {
  const products = [...catalog, { ...storage, id: "hidden-from-catalog", active: false }];
  const before = structuredClone({ products, settings: defaultSettings });
  for (const [purpose, allowed] of [["storage", ["cabinet", "open-shelf"]], ["wardrobe", ["wardrobe"]], ["desk", ["desk", "desk-storage"]]] as const) {
    const response = getDesignRecommendations(input({ purpose }), products, defaultSettings);
    assert.ok(response.options.length > 0 && response.options.length <= 3);
    for (const option of response.options) {
      assert.equal(option.kind, "furniture");
      if (option.kind !== "furniture") continue;
      const source = products.find(product => product.id === option.product.id)!;
      assert.ok(source.active);
      assert.ok((allowed as readonly string[]).includes(getConstruction(source).kind));
      assert.ok(option.config.width <= 1900 && option.config.height <= 2400 && option.config.depth <= 600);
      const authoritative = buildFurniture(source, option.config, defaultSettings);
      assert.equal(option.price, authoritative.price);
      assert.equal(option.product.preview.price, option.price);
      assert.deepEqual(option.product.preview, publicFurnitureResult(authoritative, source));
      assert.equal(option.withinBudget, null);
      assert.equal(option.budgetState, "not-provided");
      assert.equal("spaceSummary" in option, false, "single furniture retains its three-dimensional fit contract");
    }
    publicOnly(response);
  }
  assert.deepEqual({ products, settings: defaultSettings }, before);
});

test("a wide door-front proposal adapts columns through the same construction constraints", () => {
  const response = getDesignRecommendations(input({ width: 1900, height: 1800 }), [storage], defaultSettings);
  const full = response.options.find(option => option.kind === "furniture" && option.config.width === 1900);
  assert.ok(full && full.kind === "furniture");
  assert.equal(full.config.doors, "full");
  assert.ok(full.config.modules >= 4);
  assert.ok(full.reasons.some(reason => reason.includes("columnas")));
  assert.doesNotThrow(() => buildFurniture(storage, full.config, defaultSettings));
});

test("public budgets distinguish known within, over and quote-only amounts, including selected services", () => {
  const within = getDesignRecommendations(input({ budget: 500 }), [storage], defaultSettings);
  assert.equal(within.budgetState, "within");
  assert.ok(within.options.every(option => option.withinBudget === true && option.budgetState === "within"));
  const services = getDesignRecommendations(input({ budget: 500, install: true, transport: true }), [storage], defaultSettings);
  assert.equal(services.budgetState, "over");
  assert.ok(services.options.every(option => option.price === 600 && option.withinBudget === false && option.budgetState === "over"));
  const hidden = getDesignRecommendations(input({ budget: 1 }), [{ ...storage, showPrice: false }], defaultSettings);
  assert.equal(hidden.budgetState, "quote-required");
  assert.ok(hidden.options.every(option => option.price === null && option.withinBudget === null && option.budgetState === "quote-required"));
  publicOnly(hidden);
  const first = { ...storage, id: "hidden-first", order: 1, showPrice: false, pricing: { basis: "unit" as const, amount: 99999 } };
  const second = { ...storage, id: "hidden-second", order: 2, showPrice: false, pricing: { basis: "unit" as const, amount: 1 } };
  const original = getDesignRecommendations(input({ budget: 300 }), [first, second], defaultSettings);
  const changedRates = getDesignRecommendations(input({ budget: 300 }), [{ ...first, pricing: { basis: "unit", amount: 1 } }, { ...second, pricing: { basis: "unit", amount: 99999 } }], defaultSettings);
  assert.deepEqual(original, changedRates, "hidden selling rates cannot affect public ranking or budget claims");
});

test("finish selection is active-only, bounds stay strict, and an empty match remains a useful result", () => {
  const active = defaultSettings.materials.find(material => material.active)!;
  const response = getDesignRecommendations(input({ finish: active.id }), [storage], defaultSettings);
  assert.ok(response.options.every(option => option.kind === "furniture" && option.config.finish === active.id));
  assert.throws(() => getDesignRecommendations(input({ finish: "not-active" }), [storage], defaultSettings), /acabado activo/);
  for (const value of [input({ width: 1901 }), input({ budget: -1 }), { ...input(), width: "1900" }, { ...input(), eval: "1+1" }]) assert.equal(designAssistantInputSchema.safeParse(value).success, false);
  const missing = getDesignRecommendations(input({ depth: 100 }), [storage], defaultSettings);
  assert.equal(missing.budgetState, "no-options");
  assert.deepEqual(missing.options, []);
  assert.ok(missing.message.includes("medidas"));
});

test("straight and L kitchen proposals fit actual walls, use only catalog models and preserve price privacy", () => {
  for (const layout of ["straight", "l"] as const) {
    const request = input({ purpose: "kitchen", layout, wallB: layout === "l" ? 2400 : undefined, width: 3000, height: 2700, depth: 600, install: true, budget: 2000 });
    const response = getDesignRecommendations(request, [base, upper], defaultSettings);
    assert.ok(response.options.length > 0 && response.options.length <= 3);
    for (const option of response.options) {
      assert.equal(option.kind, "kitchen");
      if (option.kind !== "kitchen") continue;
      assert.equal(option.plan.layout, layout);
      assert.equal(option.plan.walls.a, 3000);
      if (layout === "l") {
        assert.equal(option.plan.walls.b, 2400);
        assert.ok(option.plan.items.some(item => item.wall === "b"));
      }
      assert.ok(option.plan.items.every(item => item.kind === "furniture" && [base.id, upper.id].includes(item.productId)));
      assert.equal(option.price, buildKitchen(option.plan, [base, upper], defaultSettings).result.price);
      assert.deepEqual(option.spaceSummary, summarizeKitchenSpace(option.result));
      assert.ok(option.fit.freeWidth >= 0 && option.fit.freeHeight >= 0 && option.fit.freeDepth >= 0);
      assert.equal(option.plan.install, true);
      assert.ok(option.reasons.some(reason => reason.includes("electrodomésticos")));
    }
    publicOnly(response);
  }
  assert.equal(designAssistantInputSchema.safeParse(input({ purpose: "kitchen", layout: "l" })).success, false);
  const tooTight = getDesignRecommendations(input({ purpose: "kitchen", layout: "l", wallB: 1000, width: 1000, height: 2000, depth: 600 }), [base], defaultSettings);
  assert.ok(tooTight.options.every(option => option.kind === "kitchen" && option.plan.items.every(item => item.kind === "furniture" && item.config.width >= base.limits.width.min)), "a tight corner may only use dimensions allowed by the real model");
  const impossible = getDesignRecommendations(input({ purpose: "kitchen", layout: "l", wallB: 1000, width: 1000, height: 2000, depth: 450 }), [{ ...base, limits: { ...base.limits, width: { min: 600, max: 1800 }, depth: { min: 600, max: 750 } } }], defaultSettings);
  assert.deepEqual(impossible.options, [], "do not invent a smaller unsupported cabinet to force the corner");
  const hidden = getDesignRecommendations(input({ purpose: "kitchen", width: 3000, height: 2700, budget: 1 }), [{ ...base, showPrice: false }], defaultSettings);
  assert.ok(hidden.options.length > 0 && hidden.options.every(option => option.price === null && option.withinBudget === null));
  publicOnly(hidden);
});

test("L recommendations report each asymmetric wall and row without adding upper and lower frontage", () => {
  const wide: Product = { ...base, id: "assistant-asymmetric-base", order: 0, defaults: { ...base.defaults, width: 1000, modules: 2 } };
  const response = getDesignRecommendations(input({ purpose: "kitchen", layout: "l", width: 3000, wallB: 2400, height: 2700 }), [wide, upper], defaultSettings);
  const storageOption = response.options.find(option => option.kind === "kitchen" && option.plan.items.filter(item => item.row === "base" && item.wall === "a").length === 2 && option.plan.items.filter(item => item.row === "base" && item.wall === "b").length === 1);
  assert.ok(storageOption?.kind === "kitchen", "a 1000 mm base fits twice on A and only once after B's corner");
  assert.equal(storageOption.spaceSummary.height, 850);
  assert.equal(storageOption.spaceSummary.moduleDepth, 600);
  const [a,b] = storageOption.spaceSummary.walls;
  assert.deepEqual([a.wall,a.length,a.corner,b.wall,b.length,b.corner], ["a",3000,0,"b",2400,650]);
  assert.deepEqual(a.rows.find(row => row.row === "base"), { row: "base", occupied: 2000, blocked: 0, free: 1000 });
  assert.deepEqual(b.rows.find(row => row.row === "base"), { row: "base", occupied: 1000, blocked: 0, free: 750 });
  assert.deepEqual(b.rows.find(row => row.row === "wall"), { row: "wall", occupied: 0, blocked: 0, free: 1750 });
  const upperOption = response.options.find(option => option.kind === "kitchen" && option.plan.items.some(item => item.row === "wall"));
  assert.ok(upperOption?.kind === "kitchen");
  const upperA = upperOption.spaceSummary.walls.find(wall => wall.wall === "a")!;
  const upperB = upperOption.spaceSummary.walls.find(wall => wall.wall === "b")!;
  assert.equal(upperOption.spaceSummary.height, 2200, "installed height includes the upper elevation");
  assert.deepEqual(upperA.rows.find(row => row.row === "base"), { row: "base", occupied: 1000, blocked: 0, free: 2000 });
  assert.deepEqual(upperA.rows.find(row => row.row === "wall"), { row: "wall", occupied: 600, blocked: 0, free: 2400 });
  assert.deepEqual(upperB.rows.find(row => row.row === "wall"), { row: "wall", occupied: 600, blocked: 0, free: 1150 });
  for (const wall of upperOption.spaceSummary.walls) for (const row of wall.rows)
    assert.equal(wall.corner + row.occupied + row.blocked + row.free, wall.length);
});

test("exact fit on B subtracts the corner once, while a straight plan exposes only A", () => {
  const wide: Product = { ...base, defaults: { ...base.defaults, width: 1000, modules: 2 } };
  const furniture = (id: string, wall: "a" | "b"): KitchenPlan["items"][number] => ({ id, kind: "furniture", productId: wide.id, wall, row: "base", config: { ...wide.defaults } });
  const plan: KitchenPlan = { layout: "l", walls: { a: 3000, b: 1650 }, roomHeight: 2700, wallElevation: 1500, install: false, transport: false, items: [furniture("a1","a"),furniture("a2","a"),furniture("b1","b")] };
  const exact = summarizeKitchenSpace(buildKitchen(plan,[wide],defaultSettings).result);
  const b = exact.walls.find(wall => wall.wall === "b")!;
  assert.equal(b.corner,650);
  assert.deepEqual(b.rows.find(row => row.row === "base"), { row: "base", occupied: 1000, blocked: 0, free: 0 });
  assert.deepEqual(b.rows.find(row => row.row === "wall"), { row: "wall", occupied: 0, blocked: 0, free: 1000 });
  const straight = summarizeKitchenSpace(buildKitchen({ ...plan,layout:"straight",items:plan.items.filter(item => item.wall === "a") },[wide],defaultSettings).result);
  assert.deepEqual(straight.walls.map(wall => wall.wall),["a"]);
  assert.equal(straight.walls[0].corner,0);
  assert.deepEqual(straight.walls[0].rows.find(row => row.row === "base"),{row:"base",occupied:2000,blocked:0,free:1000});
});

test("upper free intervals exclude a refrigerator, retain empty spaces and distinguish module depth from appliance depth", () => {
  const module = (id: string, product: Product, wall: "a" | "b", row: "base" | "wall"): KitchenPlan["items"][number] => ({id,kind:"furniture",productId:product.id,wall,row,config:{...product.defaults}});
  const plan: KitchenPlan = { layout:"l",walls:{a:3000,b:2400},roomHeight:2700,wallElevation:1500,install:false,transport:false,items:[
    module("lower-a",base,"a","base"),{id:"fridge",kind:"fridge",wall:"a",row:"tall",width:900,height:2400,depth:650},
    module("lower-b",base,"b","base"),module("upper-a",upper,"a","wall"),
    {id:"air-above-fridge",kind:"space",wall:"a",row:"wall",width:900,height:700,depth:300},module("second-upper",upper,"a","wall"),
    {id:"empty-tail",kind:"space",wall:"a",row:"wall",width:300,height:700,depth:300},
  ] };
  const quote = buildKitchen(plan,[base,upper],defaultSettings).result;
  const original = structuredClone(quote),summary = summarizeKitchenSpace(quote);
  assert.equal(summary.moduleDepth,600,"650 mm refrigerator clearance is not furniture depth");
  assert.equal(summary.height,2400,"installed height includes a taller reserved appliance");
  const a = summary.walls.find(wall => wall.wall === "a")!,b = summary.walls.find(wall => wall.wall === "b")!;
  assert.deepEqual(a.rows.find(row => row.row === "base"),{row:"base",occupied:1500,blocked:0,free:1500});
  assert.deepEqual(a.rows.find(row => row.row === "wall"),{row:"wall",occupied:1200,blocked:900,free:900});
  assert.equal(b.corner,700,"the same appliance still enlarges the physical corner reserve");
  assert.deepEqual(b.rows.find(row => row.row === "base"),{row:"base",occupied:600,blocked:0,free:1100});
  assert.deepEqual(quote,original,"summarizing a frozen quote must never modify its snapshot");
});

test("ranking is deterministic and returned options cannot mutate product settings or saved-like source previews", () => {
  const before = structuredClone({ catalog, settings: defaultSettings });
  const first = getDesignRecommendations(input({ budget: 450 }), catalog, defaultSettings);
  assert.deepEqual(getDesignRecommendations(input({ budget: 450 }), catalog, defaultSettings), first);
  const option = first.options[0];
  assert.ok(option && option.kind === "furniture");
  option.config.width = 999;
  option.product.defaults.width = 999;
  option.product.preview.geometry[0].size[0] = 999;
  assert.deepEqual({ catalog, settings: defaultSettings }, before);
});

test("recommendation work is bounded for the archived 56-model catalog and tight fitting cases", t => {
  const directory = new URL("../catalog/", import.meta.url);
  const archived = [...seedProducts, ...readdirSync(directory).filter(name => name.endsWith(".json")).flatMap(name => {
    const document = JSON.parse(readFileSync(new URL(name, directory), "utf8"));
    return Array.isArray(document.products) ? document.products : [];
  })];
  const fixtures = [...new Map(archived.map(value => { const parsed = productSchema.parse(value); return [parsed.id, { ...parsed, active: true }] as const; })).values()];
  const measurements: { purpose: string; case: string; models: number; ms: number; options: number }[] = [];
  for (const request of [input(), input({ width: 600, height: 600, depth: 600 }), input({ purpose: "wardrobe", width: 1900 }), input({ purpose: "kitchen", layout: "l", wallB: 2400, width: 3000, height: 2700 })]) {
    const started = performance.now();
    const response = getDesignRecommendations(request, fixtures, defaultSettings);
    measurements.push({ purpose: request.purpose, case: request.width === 600 ? "tight" : "normal", models: fixtures.length, ms: +(performance.now() - started).toFixed(3), options: response.options.length });
    assert.ok(response.options.length <= 3);
  }
  const warmInput = input({ purpose: "kitchen", layout: "l", wallB: 2400, width: 3000, height: 2700 });
  for (let warmup = 0; warmup < 4; warmup++) getDesignRecommendations(warmInput, fixtures, defaultSettings);
  const warm: number[] = [];
  for (let index = 0; index < 20; index++) {
    const started = performance.now();
    const response = getDesignRecommendations({ ...warmInput, width: 3000 + index % 3 * 10 }, fixtures, defaultSettings);
    warm.push(performance.now() - started);
    assert.equal(response.options.length, 3);
  }
  warm.sort((a, b) => a - b);
  t.diagnostic(JSON.stringify({ materials: defaultSettings.materials.length, measurements, warmKitchen: { samples: warm.length, meanMs: +(warm.reduce((a, b) => a + b, 0) / warm.length).toFixed(3), p95Ms: +warm[Math.floor(warm.length * .95)].toFixed(3), maximumMs: +warm.at(-1)!.toFixed(3) } }));
});
