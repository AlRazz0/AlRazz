import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFurniture,
  cutCSV,
  configSchema,
  defaultSettings,
  productSchema,
  seedProducts,
  validateConfig,
  validateProduct,
  type Product,
  type ProductExtra,
} from "../lib/furniture.ts";
import { priceExtraSelections, productExtrasSchema } from "../lib/product-extras.ts";
import { publicProduct } from "../lib/public-product.ts";
import { buildKitchen, type KitchenPlan } from "../lib/kitchen.ts";
import { productTemplate } from "../lib/product-templates.ts";
import { exportCatalogCSV, importCatalogCSV } from "../lib/catalog-csv.ts";
import { buildAdminPreview } from "../src/admin-product-preview.ts";
import { kitchenCutCSV } from "../src/kitchen-admin-export.ts";

const extra = (overrides: Partial<ProductExtra> = {}): ProductExtra => ({
  id: "perfil",
  name: "Perfil de prueba",
  description: "Servicio opcional; validar aplicación en taller.",
  active: true,
  pricing: { basis: "unit", amount: 25 },
  maxQuantity: 5,
  ...overrides,
});
function model(): Product {
  return {
    ...structuredClone(seedProducts[2]),
    pricing: { basis: "unit", amount: 1000 },
    defaults: { ...seedProducts[2].defaults, width: 1200, height: 1000, depth: 400, modules: 2, install: false, transport: false },
  };
}
const round = (value: number) => Math.ceil(value / 10) * 10;

test("optional extra fields do not modify legacy schemas, geometry or prices", () => {
  const product = model();
  assert.equal(Object.hasOwn(productSchema.parse(product), "extras"), false);
  assert.equal(Object.hasOwn(configSchema.parse(product.defaults), "extras"), false);
  const expected = buildFurniture(product, product.defaults);
  assert.deepEqual(buildFurniture({ ...product, extras: [extra()] }, product.defaults), expected);
  assert.deepEqual(buildFurniture({ ...product, extras: [] }, { ...product.defaults, extras: [] }), expected);
  assert.equal(Object.hasOwn(expected, "extras"), false);
  assert.equal(Object.hasOwn(expected.breakdown, "extras"), false);
});

test("extras use the configured dimensions and copies with one final retail rounding", () => {
  const product = model();
  product.extras = [
    extra({ id: "unidad" }),
    extra({ id: "perfil", pricing: { basis: "linear-meter", dimension: "width", amount: 50 } }),
    extra({ id: "superficie", pricing: { basis: "square-meter", plane: "front", amount: 80 } }),
  ];
  const config = { ...product.defaults, extras: [{ id: "unidad", quantity: 3 }, { id: "perfil", quantity: 2 }, { id: "superficie", quantity: 1 }] };
  const baseline = buildFurniture(product, product.defaults);
  const before = structuredClone({ product, config });
  const result = buildFurniture(product, config);
  assert.equal(result.breakdown.extras, 75 + 120 + 96);
  assert.equal(result.price, round(1000 + 75 + 120 + 96));
  assert.deepEqual(result.extras!.map((line) => [line.measurement, line.quantity, line.amount]), [[1, 3, 75], [1.2, 2, 120], [1.2, 1, 96]]);
  assert.deepEqual(result.panels, baseline.panels);
  assert.deepEqual(result.accessories, baseline.accessories);
  assert.deepEqual({ product, config }, before);
  // These are retail surcharges, not supplier costs to which margin is applied again.
  assert.equal(buildFurniture(product, config, { ...defaultSettings, margin: 0.7 }).price, result.price);
  assert.equal(buildAdminPreview({ ...product, defaults: config }, defaultSettings).result.price, result.price);
});

test("linear and area measurement sources remain explicit across all dimensions", () => {
  const config = { width: 1200, height: 1000, depth: 400, extras: [{ id: "perfil", quantity: 2 }] };
  for (const [dimension, measurement] of [["width", 1.2], ["height", 1], ["depth", 0.4]] as const) {
    const [line] = priceExtraSelections([extra({ pricing: { basis: "linear-meter", dimension, amount: 100 } })], config);
    assert.equal(line.measurement, measurement);
    assert.equal(line.amount, measurement * 200);
  }
  for (const [plane, measurement] of [["front", 1.2], ["side", 0.4], ["top", 0.48]] as const) {
    const [line] = priceExtraSelections([extra({ pricing: { basis: "square-meter", plane, amount: 100 } })], config);
    assert.equal(line.measurement, measurement);
    assert.equal(line.amount, measurement * 200);
  }
});

test("retail extras are included with calculated prices and services without a second margin", () => {
  const product = { ...model(), pricing: { basis: "calculated" as const }, extras: [extra()] };
  const config = { ...product.defaults, install: true, transport: true, extras: [{ id: "perfil", quantity: 3 }] };
  const result = buildFurniture(product, config);
  const cost = result.breakdown.materials + result.breakdown.edges + result.breakdown.hardware + result.breakdown.labor;
  assert.equal(result.price, round(cost / (1 - defaultSettings.margin) + 75 + defaultSettings.installation + defaultSettings.delivery));
});

test("server configuration validation rejects disabled, unknown, forged and excessive selections", () => {
  const product = { ...model(), extras: [extra()] };
  for (const selections of [
    [{ id: "missing", quantity: 1 }],
    [{ id: "perfil", quantity: 6 }],
    [{ id: "perfil", quantity: 0 }],
    [{ id: "perfil", quantity: -1 }],
    [{ id: "perfil", quantity: 1.5 }],
    [{ id: "perfil", quantity: 1, amount: 0 }],
    [{ id: "perfil", quantity: 1 }, { id: "perfil", quantity: 1 }],
  ]) {
    assert.throws(() => buildFurniture(product, { ...product.defaults, extras: selections }));
  }
  assert.throws(() => validateConfig({ ...product, extras: [extra({ active: false })] }, { ...product.defaults, extras: [{ id: "perfil", quantity: 1 }] }), /no está disponible/);
  assert.throws(() => validateProduct({ ...product, defaults: { ...product.defaults, extras: [{ id: "missing", quantity: 1 }] } }), /no está disponible/);
  assert.throws(() => validateProduct({ ...product, defaults: { ...product.defaults, extras: [{ id: "perfil", quantity: 10 }] } }), /máximo/);
});

test("admin definitions are bounded declarative data and reject duplicate IDs and executable fields", () => {
  for (const invalid of [
    [extra(), extra()],
    [extra({ maxQuantity: 0 })],
    [extra({ maxQuantity: 101 })],
    [extra({ maxQuantity: 1.5 })],
    [extra({ pricing: { basis: "unit", amount: -1 } })],
    [extra({ pricing: { basis: "unit", amount: Number.POSITIVE_INFINITY } })],
    [{ ...extra(), formula: "config.width * 10" }],
    [{ ...extra(), pricing: { basis: "linear-meter", dimension: "width", amount: 10, code: "alert(1)" } }],
    [{ ...extra(), pricing: { basis: "linear-meter", dimension: "volume", amount: 10 } }],
    [{ ...extra(), pricing: { basis: "square-meter", plane: "all", amount: 10 } }],
    Array.from({ length: 21 }, (_, index) => extra({ id: `extra-${index}` })),
  ]) assert.equal(productExtrasSchema.safeParse(invalid).success, false);
});

test("public catalog omits rates and inactive extras but keeps the selection contract", () => {
  const product = { ...model(), extras: [
    extra(),
    extra({ id: "alto", pricing: { basis: "linear-meter" as const, dimension: "height" as const, amount: 800 } }),
    extra({ id: "cubierta", pricing: { basis: "square-meter" as const, plane: "top" as const, amount: 700 } }),
    extra({ id: "privado", active: false }),
  ] };
  const projected = publicProduct(product, 1000);
  assert.equal(projected.extras!.length, 3);
  assert.deepEqual(projected.extras!.map((item) => item.pricing), [{ basis: "unit" }, { basis: "linear-meter", dimension: "height" }, { basis: "square-meter", plane: "top" }]);
  for (const forbidden of ['"amount"', '"basePrice"', '"privado"']) assert.equal(JSON.stringify(projected).includes(forbidden), false);
  assert.equal(projected.extras![0].maxQuantity, 5);
  assert.equal(Object.hasOwn(publicProduct(model(), 1000), "extras"), false);
});

test("CSV round trips optional definitions and selections without enabling imported products", () => {
  const product = model();
  product.extras = [extra({ name: 'Perfil; "inox"\nreferencial', description: "Opción | especial" }), extra({ id: "fondo", pricing: { basis: "linear-meter", dimension: "depth", amount: 17.5 } })];
  product.defaults.extras = [{ id: "perfil", quantity: 2 }];
  for (const delimiter of [";", ","] as const) {
    const imported = importCatalogCSV(exportCatalogCSV([product], delimiter), defaultSettings);
    assert.deepEqual(imported.errors, []);
    assert.deepEqual(imported.products[0], { ...product, active: false });
  }
  const legacy = importCatalogCSV(exportCatalogCSV([model()]), defaultSettings).products[0];
  assert.equal(Object.hasOwn(legacy, "extras"), false);
  assert.equal(Object.hasOwn(legacy.defaults, "extras"), false);
});

test("private cut exports keep extras in a distinct retail ledger and escape spreadsheet formulas", () => {
  const product = { ...model(), extras: [extra({
    name: '=HYPERLINK("https://example.invalid")',
    pricing: { basis: "linear-meter" as const, dimension: "width" as const, amount: 50 },
  })] };
  const config = { ...product.defaults, extras: [{ id: "perfil", quantity: 2 }] };
  const result = buildFurniture(product, config);
  const ordinary = buildFurniture(product, product.defaults);
  const cuts = cutCSV(result);
  assert.ok(cuts.startsWith(cutCSV(ordinary)));
  assert.ok(cuts.includes("no representan piezas ni instrucciones de fabricación"));
  assert.ok(cuts.includes('"perfil";"\'=HYPERLINK('));
  assert.ok(cuts.includes(';"metro lineal";"ancho";"2";"1.2";"50";"120"'));
  const kitchen = kitchenCutCSV([{ itemId: "base-a", product: { name: "Base de prueba" }, result }]);
  assert.ok(kitchen.includes('"base-a";"Base de prueba";"perfil";"\'=HYPERLINK('));
  assert.ok(kitchen.includes("NO REPRESENTAN PIEZAS NI INSTRUCCIONES DE FABRICACIÓN"));
  assert.equal(kitchen.split("\r\n").filter((line) => line.includes('"MELAMINA"')).length, ordinary.panels.length);
});

test("CSV rejects forged definitions and default selections without partial import", () => {
  const candidate = model();
  candidate.extras = [extra()];
  candidate.defaults.extras = [{ id: "perfil", quantity: 2 }];
  for (const invalid of [
    { ...candidate, extras: [extra({ active: false })] },
    { ...candidate, defaults: { ...candidate.defaults, extras: [{ id: "missing", quantity: 1 }] } },
    { ...candidate, defaults: { ...candidate.defaults, extras: [{ id: "perfil", quantity: 6 }] } },
  ]) {
    const imported = importCatalogCSV(exportCatalogCSV([invalid]), defaultSettings);
    assert.equal(imported.products.length, 0);
    assert.equal(imported.errors.length, 1);
  }
  const csv = exportCatalogCSV([candidate]);
  const forged = csv.replace('""basis"":""unit""', '""basis"":""unit"",""formula"":""alert(1)""');
  assert.notEqual(forged, csv);
  const rejected = importCatalogCSV(forged, defaultSettings);
  assert.equal(rejected.products.length, 0);
  assert.equal(rejected.errors.length, 1);
});

test("kitchen snapshots preserve extra definitions and original amounts after catalog changes", () => {
  const product = { ...productTemplate("kitchen-base"), active: true, pricing: { basis: "unit" as const, amount: 1000 }, extras: [extra()] };
  product.defaults.finish = defaultSettings.materials.find((item) => item.active)!.id;
  const plan: KitchenPlan = { layout: "straight", walls: { a: 3000, b: 2400 }, wallElevation: 1500, install: false, transport: false, items: [{ id: "base-a", kind: "furniture", row: "base", wall: "a", productId: product.id, config: { ...product.defaults, extras: [{ id: "perfil", quantity: 3 }] } }] };
  const snapshot = buildKitchen(plan, [product], defaultSettings);
  assert.equal(snapshot.result.price, 1080);
  const original = JSON.stringify(snapshot);
  product.extras[0].pricing.amount = 900;
  product.extras[0].active = false;
  product.defaults.width += 100;
  assert.equal(JSON.stringify(snapshot), original);
  assert.equal(snapshot.modules[0].result.extras![0].unitPrice, 25);
  for (const forbidden of ['"unitPrice"', '"amount"', '"breakdown"']) assert.equal(JSON.stringify(snapshot.result).includes(forbidden), false);
});
