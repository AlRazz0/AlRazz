import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildFurniture,
  defaultSettings,
  getConstruction,
  getConstructionOptions,
  productSchema,
  seedProducts,
  validateConfig,
  validateProduct,
} from "../lib/furniture.ts";
import type { Product } from "../lib/furniture.ts";
import { exportCatalogCSV, importCatalogCSV } from "../lib/catalog-csv.ts";
import { publicGeometry } from "../lib/public-geometry.ts";

const readCollection = (file: string): Product[] =>
  JSON.parse(
    readFileSync(new URL(`../catalog/${file}`, import.meta.url), "utf8"),
  ).products.map((value: unknown) => productSchema.parse(value));

const products = readCollection("coleccion-cocinas-roperos.json");
const previous = [
  ...seedProducts,
  ...readCollection("coleccion-el-capo.json"),
  ...readCollection("coleccion-taller.json"),
  ...readCollection("coleccion-taller-ampliada.json"),
];
const formKey = (product: Product) => {
  const { width, height, depth, modules, shelves, doors } = product.defaults;
  return JSON.stringify({
    construction: getConstruction(product),
    width, height, depth, modules, shelves, doors,
  });
};

test("eight kitchen and wardrobe drafts extend the catalogue without mutating existing data", () => {
  assert.equal(products.length, 8);
  assert.equal(products.filter((p) => p.category === "Roperos").length, 4);
  assert.equal(products.filter((p) => p.category === "Cocina").length, 4);
  const original = JSON.stringify({ previous, products, defaultSettings });
  const ids = new Set(previous.map((p) => p.id));
  const orders = new Set(previous.map((p) => p.order));
  const forms = new Set(previous.map(formKey));
  for (const product of products) {
    assert.equal(ids.has(product.id), false, product.id);
    assert.equal(orders.has(product.order), false, product.id);
    assert.equal(forms.has(formKey(product)), false, `${product.id}: repeated geometry`);
    ids.add(product.id);
    orders.add(product.order);
    forms.add(formKey(product));
    assert.equal(product.active, false);
    assert.equal(product.version, 1);
    assert.ok(product.order >= 37 && product.order <= 44);
    validateProduct(product, defaultSettings);
    const result = buildFurniture(product, product.defaults, defaultSettings);
    assert.ok(Number.isFinite(result.price) && result.price > 0);
    assert.ok(result.panels.length > 0);
    for (const panel of result.panels) {
      assert.equal(panel.thickness, 18);
      assert.ok(panel.length > 0 && panel.width > 0);
      const low = [-product.defaults.width / 2, 0, -product.defaults.depth / 2];
      const high = [product.defaults.width / 2, product.defaults.height, product.defaults.depth / 2];
      for (let axis = 0; axis < 3; axis++) {
        assert.ok(panel.position[axis] - panel.size[axis] / 2 >= low[axis] - 1e-8);
        assert.ok(panel.position[axis] + panel.size[axis] / 2 <= high[axis] + 1e-8);
      }
    }
  }
  assert.equal(JSON.stringify({ previous, products, defaultSettings }), original);
});

test("wardrobes expose actual metal rails separately from their 18mm board cut list", () => {
  for (const product of products) {
    const construction = getConstruction(product);
    const result = buildFurniture(product, product.defaults);
    const visual = publicGeometry(result.panels, result.fixtures);
    const rails = visual.filter((shape) => shape.shape === "cylinder");
    if (construction.kind !== "wardrobe") {
      assert.equal(rails.length, 0);
      continue;
    }
    assert.equal(result.fixtures?.length, construction.hangingModules);
    assert.equal(rails.length, construction.hangingModules);
    for (const rail of rails) {
      assert.equal(rail.material, "metal");
      assert.deepEqual(rail.size.slice(1), [25, 25]);
      assert.ok(rail.position[1] - rail.size[1] / 2 >= 900);
      assert.ok(rail.position[1] < product.defaults.height - construction.loftHeight);
      assert.deepEqual(Object.keys(rail).sort(), ["material", "position", "shape", "size"]);
    }
    if (product.defaults.modules === construction.hangingModules) {
      assert.equal(product.defaults.shelves, 0);
      assert.deepEqual(getConstructionOptions(product, product.defaults).shelves, [0]);
    }
  }
});

test("kitchen base defaults contain a recessed plinth underneath the carcass", () => {
  const bases = products.filter((p) => p.construction?.kind === "kitchen-base");
  assert.equal(bases.length, 2);
  for (const product of bases) {
    const construction = getConstruction(product);
    assert.equal(construction.kind, "kitchen-base");
    if (construction.kind !== "kitchen-base") continue;
    const result = buildFurniture(product, product.defaults);
    const plinth = result.panels.filter(
      (panel) => panel.position[1] + panel.size[1] / 2 <= construction.plinthHeight + 1e-8,
    );
    assert.ok(plinth.length >= 4);
    for (const panel of plinth) {
      assert.equal(panel.position[1] - panel.size[1] / 2, 0);
      assert.ok(
        panel.position[2] + panel.size[2] / 2 <=
          product.defaults.depth / 2 - construction.plinthSetback + 1e-8,
      );
    }
    assert.ok(result.panels.some((panel) =>
      Math.abs(panel.position[1] - panel.size[1] / 2 - construction.plinthHeight) < 1e-8,
    ));
  }
});

test("admin CSV preserves wardrobe and kitchen construction parameters", () => {
  const result = importCatalogCSV(exportCatalogCSV(products), defaultSettings);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.products, products);
});

test("every new family dimension endpoint permits a supported distribution", () => {
  for (const product of products) {
    for (const axis of ["width", "height", "depth"] as const) {
      for (const endpoint of ["min", "max"] as const) {
        const config = { ...product.defaults, [axis]: product.limits[axis][endpoint] };
        const options = getConstructionOptions(product, config);
        let viable = false;
        for (const modules of options.modules) {
          const moduleConfig = { ...config, modules };
          for (const shelves of getConstructionOptions(product, moduleConfig).shelves) {
            for (const doors of options.doors) {
              try {
                validateConfig(product, { ...moduleConfig, shelves, doors });
                viable = true;
              } catch {
                // A different distribution can satisfy the dimension endpoint.
              }
              if (viable) break;
            }
            if (viable) break;
          }
          if (viable) break;
        }
        assert.ok(viable, `${product.id}: ${axis}.${endpoint}`);
      }
    }
  }
});
