import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  buildFurniture,
  defaultSettings,
  frontKinds,
  getConstruction,
  productSchema,
  seedProducts,
  validateProduct,
} from "../lib/furniture.ts";
import type { Product } from "../lib/furniture.ts";
import { publicGeometry } from "../lib/public-geometry.ts";
import { exportCatalogCSV, importCatalogCSV } from "../lib/catalog-csv.ts";

const read = (file: string) =>
  z
    .object({ products: z.array(productSchema) })
    .strict()
    .parse(
      JSON.parse(
        readFileSync(
          new URL(`../catalog/${file}.json`, import.meta.url),
          "utf8",
        ),
      ),
    ).products;
const products = read("coleccion-cocinas-vitrinas");
const previous = [
  ...seedProducts,
  ...[
    "coleccion-el-capo",
    "coleccion-taller",
    "coleccion-taller-ampliada",
    "coleccion-cocinas-roperos",
  ].flatMap(read),
];
const formKey = (product: Product) => {
  const { width, height, depth, modules, shelves, doors } = product.defaults;
  return JSON.stringify({
    construction: getConstruction(product),
    width,
    height,
    depth,
    modules,
    shelves,
    doors,
  });
};

test("twelve distinct kitchen, showcase and shelving drafts extend the catalogue to 56", () => {
  assert.equal(previous.length, 44);
  assert.equal(products.length, 12);
  assert.equal(
    products.filter((product) => product.category === "Cocina").length,
    6,
  );
  assert.equal(
    products.filter((product) => product.id.startsWith("vitrina-")).length,
    2,
  );
  assert.deepEqual(
    products.map((product) => product.order),
    Array.from({ length: 12 }, (_, i) => 45 + i),
  );
  const snapshot = JSON.stringify({ previous, products, defaultSettings });
  const ids = new Set(previous.map((product) => product.id));
  const forms = new Set(previous.map(formKey));
  for (const product of products) {
    assert.ok(!ids.has(product.id), product.id);
    assert.ok(
      !forms.has(formKey(product)),
      `${product.id}: repeated construction`,
    );
    ids.add(product.id);
    forms.add(formKey(product));
    assert.equal(product.active, false);
    assert.equal(product.version, 1);
    assert.deepEqual(product.pricing, { basis: "calculated" });
    validateProduct(product, defaultSettings);
    const result = buildFurniture(product, product.defaults);
    assert.ok(result.price > 0 && Number.isFinite(result.price));
    assert.ok(result.panels.every((panel) => panel.thickness === 18));
    assert.ok(
      publicGeometry(result.panels, result.fixtures).length >=
        result.panels.length,
    );
  }
  assert.equal(ids.size, 56);
  assert.equal(
    JSON.stringify({ previous, products, defaultSettings }),
    snapshot,
  );
});

test("all advertised dimension endpoints work with each draft's default distribution", () => {
  for (const product of products)
    for (const axis of ["width", "height", "depth"] as const)
      for (const endpoint of ["min", "max"] as const) {
        const config = {
          ...product.defaults,
          [axis]: product.limits[axis][endpoint],
        };
        const result = buildFurniture(product, config);
        assert.ok(result.price > 0, `${product.id} ${axis}.${endpoint}`);
      }
});

test("closed collection models support all three fronts with bounded real glass doors", () => {
  const closed = products.filter(
    (product) => product.defaults.doors !== "none",
  );
  assert.equal(closed.length, 9);
  assert.equal(
    products.filter((product) => product.defaults.front === "glass").length,
    2,
  );
  assert.equal(
    products.filter((product) => product.defaults.front === "aluminum-glass")
      .length,
    3,
  );
  for (const product of closed) {
    assert.deepEqual(product.frontOptions, [...frontKinds]);
    for (const front of frontKinds)
      for (const height of [
        product.limits.height.min,
        product.limits.height.max,
      ]) {
        const result = buildFurniture(product, {
          ...product.defaults,
          height,
          front,
          handle: "exterior",
        });
        const visualDoors = publicGeometry(
          result.panels,
          result.fixtures,
        ).filter((item) => item.door);
        assert.equal(visualDoors.length, product.defaults.modules);
        if (front !== "melamine") {
          assert.equal(
            result.panels.some((panel) => panel.door),
            false,
          );
          for (const fixture of result.fixtures ?? []) {
            assert.equal(fixture.kind, "front-door");
            if (fixture.kind !== "front-door") continue;
            assert.ok(fixture.size[1] <= 1500);
            assert.ok(fixture.glassArea > 0);
          }
        }
      }
  }
});

test("admin CSV preserves every new draft front, pricing base and construction parameter", () => {
  for (const delimiter of [";", ","] as const) {
    const imported = importCatalogCSV(
      exportCatalogCSV(products, delimiter),
      defaultSettings,
    );
    assert.deepEqual(imported.errors, []);
    assert.deepEqual(imported.products, products);
  }
});
