import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFurniture, defaultSettings, getConstructionOptions, productSchema, seedProducts, validateConfig, validateProduct } from "../lib/furniture.ts";
import { exportCatalogCSV, importCatalogCSV } from "../lib/catalog-csv.ts";
import type { Product } from "../lib/furniture.ts";

const readCollection = (file: string): Product[] => JSON.parse(readFileSync(new URL(`../catalog/${file}`, import.meta.url), "utf8")).products.map((value: unknown) => productSchema.parse(value));
const products = readCollection("coleccion-taller-ampliada.json");
const previous = [...seedProducts, ...readCollection("coleccion-el-capo.json"), ...readCollection("coleccion-taller.json")];
const formKey = (product: Product) => {
  const { finish: _finish, interior: _interior, handle: _handle, install: _install, transport: _transport, ...form } = product.defaults;
  return JSON.stringify([product.construction || { kind: "cabinet" }, form]);
};

test("the additional workshop collection adds 12 valid, distinct editable drafts without replacing existing models", () => {
  assert.equal(products.length, 12);
  const ids = new Set(previous.map(p => p.id));
  const forms = new Set(previous.map(formKey));
  const orders = new Set(previous.map(p => p.order));
  for (const product of products) {
    assert.equal(ids.has(product.id), false, product.id);
    assert.equal(forms.has(formKey(product)), false, `${product.id}: repeated geometry`);
    assert.equal(orders.has(product.order), false, `${product.id}: repeated order`);
    ids.add(product.id);
    forms.add(formKey(product));
    orders.add(product.order);
    assert.equal(product.active, false);
    assert.equal(product.version, 1);
    validateProduct(product, defaultSettings);
    const built = buildFurniture(product, product.defaults);
    assert.ok(Number.isFinite(built.price) && built.price > 0);
    assert.ok(built.panels.length > 0);
    for (const panel of built.panels) {
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
});

test("additional workshop models preserve every editable parameter through admin CSV", () => {
  const result = importCatalogCSV(exportCatalogCSV(products), defaultSettings);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.products, products);
});

test("additional model dimension limits each allow a supported configuration", () => {
  for (const product of products) {
    const options = getConstructionOptions(product);
    for (const axis of ["width", "height", "depth"] as const) {
      for (const endpoint of ["min", "max"] as const) {
        let viable = false;
        for (const modules of options.modules) {
          for (const shelves of options.shelves) {
            for (const doors of options.doors) {
              try {
                validateConfig(product, { ...product.defaults, [axis]: product.limits[axis][endpoint], modules, shelves, doors });
                viable = true;
              } catch { /* A different supported distribution can satisfy this endpoint. */ }
              if (viable) break;
            }
            if (viable) break;
          }
          if (viable) break;
        }
        assert.ok(viable, `${product.id}: ${axis}.${endpoint} has no valid distribution`);
      }
    }
  }
});
