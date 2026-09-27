import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  buildFurniture,
  defaultSettings,
  productSchema,
  seedProducts,
  validateConfig,
  validateProduct,
} from "../lib/furniture.ts";
import { exportCatalogCSV, importCatalogCSV } from "../lib/catalog-csv.ts";

const { products } = z
  .object({ products: z.array(productSchema).length(4) })
  .strict()
  .parse(
    JSON.parse(
      readFileSync(
        new URL("../catalog/coleccion-el-capo.json", import.meta.url),
        "utf8",
      ),
    ),
  );

test("the opt-in catalog imports four distinct drafts with valid official finishes and renderable defaults", () => {
  assert.equal(new Set(products.map((product) => product.id)).size, 4);
  const existingIds = new Set(seedProducts.map((product) => product.id));
  const originalSettings = structuredClone(defaultSettings);
  const expectedPanels = [8, 8, 10, 8];
  for (const [index, product] of products.entries()) {
    assert.equal(product.active, false);
    assert.equal(product.version, 1);
    assert.equal(existingIds.has(product.id), false);
    const validated = validateProduct(product, defaultSettings);
    const material = defaultSettings.materials.find(
      (item) => item.id === validated.defaults.finish,
    )!;
    assert.equal(material.brand, "Hispano");
    assert.equal(material.active, true);
    assert.ok(material.sourceUrl?.startsWith("https://tableroshispanos.es/"));
    const result = buildFurniture(
      validated,
      validated.defaults,
      defaultSettings,
    );
    assert.equal(result.panels.length, expectedPanels[index]);
    assert.equal(result.doors, 0);
    assert.ok(
      result.panels.every(
        (panel) =>
          panel.thickness === 18 && panel.length > 0 && panel.width > 0,
      ),
    );
    assert.ok(Number.isFinite(result.price) && result.price > 0);
  }
  assert.deepEqual(defaultSettings, originalSettings);
});

test("the new collection roundtrips through the existing admin CSV contract without changing defaults", () => {
  const imported = importCatalogCSV(
    exportCatalogCSV(products),
    defaultSettings,
  );
  assert.deepEqual(imported.errors, []);
  assert.deepEqual(imported.products, products);
});

test("catalog limits retain support and shelf-clearance restrictions at the useful extremes", () => {
  const maximumModules = [2, 3, 4, 4];
  for (const [index, product] of products.entries()) {
    const minimum = {
      ...product.defaults,
      width: product.limits.width.min,
      height: product.limits.height.min,
      depth: product.limits.depth.min,
    };
    const maximum = {
      ...product.defaults,
      width: product.limits.width.max,
      height: product.limits.height.max,
      depth: product.limits.depth.max,
      modules: maximumModules[index],
    };
    assert.equal(validateConfig(product, minimum), true);
    assert.equal(validateConfig(product, maximum), true);
    assert.ok(buildFurniture(product, minimum).panels.length > 0);
    assert.ok(buildFurniture(product, maximum).panels.length > 0);
  }
  for (const product of [products[1], products[2]])
    assert.throws(
      () =>
        validateConfig(product, {
          ...product.defaults,
          width: product.limits.width.max,
        }),
      /750 mm/,
    );
  const lowTV = products[3];
  assert.throws(
    () =>
      validateConfig(lowTV, {
        ...lowTV.defaults,
        height: lowTV.limits.height.min,
        shelves: 2,
      }),
    /100 mm/,
  );
  assert.throws(
    () =>
      validateConfig(products[0], {
        ...products[0].defaults,
        width: products[0].limits.width.min - 10,
      }),
    /Medida inválida/,
  );
});
