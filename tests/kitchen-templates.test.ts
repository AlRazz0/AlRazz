import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildFurniture,
  defaultSettings,
  productSchema,
  seedProducts,
  type Product,
} from "../lib/furniture.ts";
import { buildKitchen, kitchenPlanSchema } from "../lib/kitchen.ts";
import { publicGeometry } from "../lib/public-geometry.ts";
import { getKitchenTemplates } from "../src/kitchen-templates.ts";
import type { PublicProduct } from "../src/types.ts";

const products: Product[] = [
  ...seedProducts,
  ...[
    "coleccion-el-capo",
    "coleccion-taller",
    "coleccion-taller-ampliada",
    "coleccion-cocinas-roperos",
    "coleccion-cocinas-vitrinas",
  ].flatMap(
    (file) =>
      JSON.parse(
        readFileSync(
          new URL(`../catalog/${file}.json`, import.meta.url),
          "utf8",
        ),
      ).products,
  ),
].map((input) => ({ ...productSchema.parse(input), active: true }));
function publicProduct(product: Product): PublicProduct {
  const { basePrice: _basePrice, pricing, ...visible } = product;
  const result = buildFurniture(product, product.defaults);
  return {
    ...visible,
    ...(pricing ? { pricing: { basis: pricing.basis } } : {}),
    publicPrice: result.price,
    preview: {
      price: result.price,
      geometry: publicGeometry(result.panels, result.fixtures),
    },
  };
}

test("six kitchen starter sets create distinct valid full arrangements from the published 56-model catalog", () => {
  const catalog = products.map(publicProduct);
  const original = structuredClone(catalog);
  const templates = getKitchenTemplates(catalog);
  assert.equal(templates.length, 6);
  assert.equal(new Set(templates.map((template) => template.id)).size, 6);
  assert.equal(
    templates.filter((template) => template.plan.layout === "straight").length,
    3,
  );
  assert.equal(
    templates.filter((template) => template.plan.layout === "l").length,
    3,
  );
  const shapes = new Set<string>();
  for (const template of templates) {
    kitchenPlanSchema.parse(template.plan);
    assert.ok(template.plan.items.length <= 16);
    for (const kind of ["fridge", "cooker", "sink-gap", "space", "furniture"])
      assert.ok(
        template.plan.items.some((item) => item.kind === kind),
        `${template.id}: ${kind}`,
      );
    assert.ok(
      template.plan.items.some(
        (item) => item.kind === "furniture" && item.row === "wall",
      ),
    );
    assert.ok(
      template.plan.items.some(
        (item) => item.kind === "space" && item.row === "base",
      ),
    );
    const snapshot = buildKitchen(template.plan, products, defaultSettings);
    assert.ok(snapshot.result.price > 0);
    assert.equal(snapshot.result.servicesPrice, 0);
    assert.equal(
      snapshot.result.price,
      snapshot.modules.reduce((sum, module) => sum + module.result.price, 0),
    );
    for (const module of snapshot.modules) {
      assert.ok(
        products.some(
          (product) =>
            product.id === module.product.id &&
            product.category === "Cocina" &&
            product.active,
        ),
      );
      assert.deepEqual(module.config, {
        ...module.product.defaults,
        install: false,
        transport: false,
      });
    }
    shapes.add(
      JSON.stringify({
        walls: template.plan.walls,
        layout: template.plan.layout,
        items: template.plan.items.map(({ id: _id, ...item }) => item),
      }),
    );
  }
  assert.equal(shapes.size, 6);
  assert.deepEqual(catalog, original);
});

test("starter sets adapt to a limited catalog without reviving hidden products or importing seeds", () => {
  const base = products.find(
    (product) => product.construction?.kind === "kitchen-base",
  )!;
  const upper = products.find(
    (product) => product.id === "alacena-cristal-60",
  )!;
  const tall = products.find(
    (product) => product.id === "despensa-compacta-60",
  )!;
  for (const only of [base, upper, tall]) {
    const limited = [
      publicProduct(only),
      ...products
        .filter((product) => product.id !== only.id)
        .map((product) => ({ ...publicProduct(product), active: false })),
    ];
    const templates = getKitchenTemplates(limited);
    assert.ok(templates.length > 0);
    for (const template of templates) {
      assert.ok(
        template.plan.items
          .filter((item) => item.kind === "furniture")
          .every((item) => item.productId === only.id),
      );
      assert.ok(
        buildKitchen(template.plan, [only], defaultSettings).result.price > 0,
      );
    }
  }
  assert.deepEqual(getKitchenTemplates([]), []);
  assert.deepEqual(
    getKitchenTemplates(
      products.map((product) => ({ ...publicProduct(product), active: false })),
    ),
    [],
  );
  assert.deepEqual(
    getKitchenTemplates(
      products
        .filter((product) => product.category !== "Cocina")
        .map(publicProduct),
    ),
    [],
  );
});

test("template calls and model configurations are independent copies", () => {
  const catalog = products.map(publicProduct);
  const first = getKitchenTemplates(catalog);
  const expected = structuredClone(first);
  const second = getKitchenTemplates(catalog);
  first[0].plan.walls.a = 6000;
  const edited = first[0].plan.items.find((item) => item.kind === "furniture")!;
  if (edited.kind === "furniture") edited.config.width = 1230;
  assert.deepEqual(second, expected);
  assert.deepEqual(getKitchenTemplates(catalog), expected);
});
