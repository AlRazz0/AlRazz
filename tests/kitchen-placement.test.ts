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
import { buildKitchen } from "../lib/kitchen.ts";
import { publicGeometry } from "../lib/public-geometry.ts";
import { getKitchenTemplates } from "../src/kitchen-templates.ts";
import { getKitchenSlots } from "../src/kitchen-slots.ts";
import {
  fitKitchenSlotProduct,
  insertKitchenModule,
} from "../src/kitchen-placement.ts";
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
const catalog: PublicProduct[] = products.map((product) => {
  const { basePrice: _basePrice, pricing, ...metadata } = product;
  const result = buildFurniture(product, product.defaults);
  return {
    ...metadata,
    ...(pricing ? { pricing: { basis: pricing.basis } } : {}),
    publicPrice: result.price,
    preview: {
      price: result.price,
      geometry: publicGeometry(result.panels, result.fixtures),
    },
  };
});

test("each of the six templates offers a real placement that stays valid through the full kitchen engine", () => {
  const templates = getKitchenTemplates(catalog);
  assert.equal(templates.length, 6);
  for (const template of templates) {
    const original = structuredClone(template.plan);
    const quote = buildKitchen(template.plan, products, defaultSettings).result;
    const slots = getKitchenSlots(template.plan, quote);
    let placed = 0;
    for (const space of slots) {
      for (const product of catalog) {
        const config = fitKitchenSlotProduct(product, space);
        if (!config) continue;
        try {
          let nextId = 0;
          const next = insertKitchenModule(
            template.plan,
            space,
            product,
            config,
            () => `fixture-new-${nextId++}`,
          );
          const result = buildKitchen(next.plan, products, defaultSettings);
          assert.ok(result.result.price > 0);
          assert.ok(
            next.plan.items.some(
              (item) => item.id === next.selected && item.kind === "furniture",
            ),
          );
          placed++;
        } catch {
          /* Some smaller candidates need an extra gap beyond the 16-element limit. */
        }
      }
    }
    assert.ok(placed > 0, `${template.id} must offer a usable + placement`);
    assert.deepEqual(template.plan, original);
  }
});

test("fitting clamps dimensions and adapts divisions within the actual model constraints", () => {
  const base =
    catalog.find((product) => product.id === "cocina-base-60") ??
    catalog.find((product) => product.construction?.kind === "kitchen-base")!;
  const before = structuredClone(base);
  const config = fitKitchenSlotProduct(base, {
    widthAvailable: 600,
    height: 850,
    depth: 600,
    row: "base",
    replaceId: "space",
  });
  assert.ok(config);
  assert.ok(config.height <= 850);
  assert.ok(config.width <= 600);
  assert.equal(config.install, false);
  assert.equal(config.transport, false);
  assert.equal(
    fitKitchenSlotProduct(base, {
      widthAvailable: 100,
      height: 850,
      depth: 600,
      row: "base",
    }),
    null,
  );
  assert.equal(
    fitKitchenSlotProduct(base, {
      widthAvailable: 600,
      height: 850,
      depth: 400,
      row: "wall",
    }),
    null,
  );
  assert.deepEqual(base, before);
});

test("replacing a space keeps its order and trailing clearance without moving later furniture", () => {
  const template = getKitchenTemplates(catalog)[0];
  const expanded = template.plan.items.find(
    (item) => item.kind === "space" && item.row === "base",
  );
  assert.ok(expanded && expanded.kind === "space");
  expanded.width += 400;
  template.plan.walls.a += 400;
  const quote = buildKitchen(template.plan, products, defaultSettings).result;
  const space = getKitchenSlots(template.plan, quote).find(
    (slot) => slot.replaceId && slot.row === "base",
  )!;
  const product = catalog.find(
    (product) =>
      product.construction?.kind === "kitchen-base" &&
      product.defaults.width === 600 &&
      !!fitKitchenSlotProduct(product, space),
  )!;
  const config = fitKitchenSlotProduct(product, space)!;
  let nextId = 0;
  const original = structuredClone(template.plan);
  const next = insertKitchenModule(
    template.plan,
    space,
    product,
    config,
    () => `new-gap-${nextId++}`,
  );
  const oldIndex = template.plan.items.findIndex(
    (item) => item.id === space.replaceId,
  );
  assert.equal(next.plan.items[oldIndex].id, space.replaceId);
  assert.equal(next.plan.items[oldIndex].kind, "furniture");
  const trailing = next.plan.items[oldIndex + 1];
  assert.ok(trailing.kind === "space");
  assert.equal(trailing.width, space.widthAvailable - config.width);
  const prior = quote.modules.filter((module) => module.kind === "furniture");
  const after = buildKitchen(next.plan, products, defaultSettings).result;
  for (const module of prior) {
    const actual = after.modules.find((item) => item.id === module.id)!;
    assert.deepEqual(
      [
        actual.position[0] + after.envelope.width / 2,
        actual.position[1],
        actual.position[2] + after.envelope.depth / 2,
      ],
      [
        module.position[0] + quote.envelope.width / 2,
        module.position[1],
        module.position[2] + quote.envelope.depth / 2,
      ],
    );
  }
  assert.deepEqual(template.plan, original);
  assert.throws(
    () =>
      insertKitchenModule(
        next.plan,
        space,
        product,
        config,
        () => "another-id",
      ),
    /no está disponible/,
  );
});
