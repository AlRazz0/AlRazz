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
import { buildKitchen, type KitchenPlan } from "../lib/kitchen.ts";
import { publicGeometry } from "../lib/public-geometry.ts";
import { publicProduct } from "../lib/public-product.ts";
import { productTemplate } from "../lib/product-templates.ts";
import { getKitchenTemplates } from "../src/kitchen-templates.ts";
import { getEmptyKitchenSlot, getKitchenReplacementSlot, getKitchenSlots } from "../src/kitchen-slots.ts";
import {
  fitKitchenSlotProduct,
  insertKitchenModule,
  kitchenConfigIssue,
} from "../src/kitchen-placement.ts";
import { hasKitchenFurniture, removeKitchenItem } from "../src/kitchen-planner-state.ts";
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

function publicFixture(product: Product): PublicProduct {
  const built = buildFurniture(product, product.defaults);
  return { ...publicProduct(product, built.price), preview: { price: built.price, geometry: publicGeometry(built.panels, built.fixtures) } };
}

function singleModule(product: Product): KitchenPlan {
  return {
    layout: "straight", walls: { a: 3600, b: 3000 }, roomHeight: 2700,
    wallElevation: 1500, install: false, transport: false,
    items: [{ id: "editable", kind: "furniture", wall: "a", row: "base", productId: product.id, config: structuredClone(product.defaults) }],
  };
}

test("replacement keeps identity and exact chosen dimensions, and rejects a stale module", () => {
  const base = { ...productTemplate("kitchen-base"), active: true };
  const alternative = { ...base, id: "alternative-base", name: "Base alternativa" };
  const plan = singleModule(base);
  const original = structuredClone(plan);
  const slot = getKitchenReplacementSlot(plan, "editable")!;
  const selected = publicFixture(alternative);
  const config = { ...alternative.defaults, width: 500, height: 810, depth: 570, doors: "none" as const };
  assert.equal(kitchenConfigIssue(selected, config, slot), "");
  const next = insertKitchenModule(plan, slot, selected, config, () => "remainder");
  assert.equal(next.selected, "editable");
  assert.equal(next.plan.items[0].kind, "furniture");
  if (next.plan.items[0].kind === "furniture") {
    assert.equal(next.plan.items[0].productId, alternative.id);
    assert.deepEqual(next.plan.items[0].config, config);
  }
  assert.ok(next.plan.items[1].kind === "space");
  assert.equal(next.plan.items[1].width, 100);
  assert.doesNotThrow(() => buildKitchen(next.plan, [base, alternative], defaultSettings));
  assert.deepEqual(plan, original);

  const changed = structuredClone(plan);
  if (changed.items[0].kind === "furniture") changed.items[0].config.depth -= 10;
  assert.throws(() => insertKitchenModule(changed, slot, selected, config, () => "unused"), /espacio cambió/i);
  const fiftyMillimeterGap = insertKitchenModule(plan, slot, selected, { ...config, width: 550 }, () => "gap-50");
  assert.equal(fiftyMillimeterGap.plan.items[1].kind, "space");
  if (fiftyMillimeterGap.plan.items[1].kind === "space") assert.equal(fiftyMillimeterGap.plan.items[1].width, 50);
  assert.doesNotThrow(() => buildKitchen(fiftyMillimeterGap.plan, [base, alternative], defaultSettings));
  assert.throws(() => insertKitchenModule(plan, slot, selected, { ...config, width: 510, height: 811 }, () => "unused"), /pasos de 10/i);
  assert.throws(() => insertKitchenModule(plan, slot, selected, { ...config, width: 700 }, () => "unused"), /ancho/i);
});

test("the last module can be removed and rebuilt without relaxing quote validation", () => {
  const base = { ...productTemplate("kitchen-base"), active: true };
  const plan = singleModule(base);
  const blank = removeKitchenItem(plan, "editable");
  assert.equal(blank.items.length, 0);
  assert.equal(hasKitchenFurniture(blank), false);
  assert.equal(plan.items.length, 1);
  assert.equal(removeKitchenItem(blank, "missing"), blank);
  assert.throws(() => buildKitchen(blank, [base], defaultSettings));
  const slot = getEmptyKitchenSlot(blank)!;
  const selected = publicFixture(base);
  const config = fitKitchenSlotProduct(selected, slot)!;
  const rebuilt = insertKitchenModule(blank, slot, selected, config, () => "rebuilt");
  assert.equal(hasKitchenFurniture(rebuilt.plan), true);
  assert.equal(getEmptyKitchenSlot(rebuilt.plan), undefined);
  assert.doesNotThrow(() => buildKitchen(rebuilt.plan, [base], defaultSettings));
});

test("public options survive insertion and exact dimensions reach server pricing", () => {
  const base: Product = {
    ...productTemplate("kitchen-base"), active: true,
    extras: [{ id: "strip", name: "Perfil", active: true, maxQuantity: 4, pricing: { basis: "linear-meter", dimension: "width", amount: 100 } }],
  };
  const blank = { ...singleModule(base), items: [] };
  const slot = getEmptyKitchenSlot(blank)!;
  const selected = publicFixture(base);
  assert.equal("amount" in selected.extras![0].pricing, false);
  const config = { ...fitKitchenSlotProduct(selected, slot)!, width: 700, modules: 2, extras: [{ id: "strip", quantity: 2 }] };
  assert.equal(kitchenConfigIssue(selected, config, slot), "");
  const added = insertKitchenModule(blank, slot, selected, config, () => "option-base");
  const quote = buildKitchen(added.plan, [base], defaultSettings).result;
  const without = structuredClone(added.plan);
  if (without.items[0].kind === "furniture") delete without.items[0].config.extras;
  assert.equal(quote.price - buildKitchen(without, [base], defaultSettings).result.price, 140);
  assert.equal(kitchenConfigIssue(selected, { ...config, extras: [{ id: "other-product-option", quantity: 1 }] }, slot).includes("no está disponible"), true);
  assert.equal(kitchenConfigIssue(selected, { ...config, extras: [{ id: "strip", quantity: 5 }] }, slot).includes("máximo"), true);
});

test("a long alignment reservation is split into schema-valid spaces", () => {
  const base = { ...productTemplate("kitchen-base"), active: true };
  const selected = publicFixture(base);
  const blank = { ...singleModule(base), items: [] };
  const slot = { ...getEmptyKitchenSlot(blank)!, widthAvailable: 1000, leadingSpace: 2050 };
  let index = 0;
  const added = insertKitchenModule(blank, slot, selected, base.defaults, () => `long-${index++}`);
  assert.deepEqual(added.plan.items.flatMap(item => item.kind === "space" ? [item.width] : []), [2000, 50]);
  assert.doesNotThrow(() => buildKitchen(added.plan, [base], defaultSettings));
  assert.throws(() => insertKitchenModule(blank, { ...slot, leadingSpace: Infinity }, selected, base.defaults, () => "unused"), /margen/i);
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
    /no está disponible|espacio cambió/,
  );
});

test("small trailing spaces preserve exact furniture size, neighbours, engine pricing and old snapshots", () => {
  const base: Product = { ...productTemplate("kitchen-base"), active: true };
  const plan = singleModule(base);
  const original = structuredClone(plan);
  const neighbour = { ...structuredClone(plan.items[0]), id: "right" };
  plan.items.push(neighbour);
  const baseline = buildKitchen(plan, [base], defaultSettings);
  const baselineBefore = structuredClone(baseline);
  const selected = publicFixture(base);
  const slot = getKitchenReplacementSlot(plan, "editable")!;
  for (const remainder of [10, 50, 90]) {
    const config = { ...base.defaults, width: 600 - remainder };
    const inserted = insertKitchenModule(plan, slot, selected, config, () => `gap-${remainder}`);
    const quoted = buildKitchen(inserted.plan, [base], defaultSettings);
    const air = quoted.result.modules.find(item => item.id === `gap-${remainder}`)!;
    assert.equal(air.kind, "space");
    assert.equal(air.size[0], remainder);
    assert.equal(air.price, 0);
    assert.equal(inserted.plan.items[0].kind, "furniture");
    if (inserted.plan.items[0].kind === "furniture") assert.deepEqual(inserted.plan.items[0].config, config);
    assert.deepEqual(quoted.result.modules.find(item => item.id === "right")!.position, baseline.result.modules.find(item => item.id === "right")!.position);
    const generated = buildFurniture(base, config, defaultSettings);
    const oldNeighbour = buildFurniture(base, base.defaults, defaultSettings);
    assert.equal(quoted.result.price, generated.price + oldNeighbour.price);
    assert.equal(quoted.result.geometry.length, generated.panels.length + (generated.fixtures?.length ?? 0) + oldNeighbour.panels.length + (oldNeighbour.fixtures?.length ?? 0));
  }
  assert.deepEqual(baseline, baselineBefore, "an earlier quote remains an unchanged snapshot");
  assert.deepEqual(plan.items[0], original.items[0], "insertion never mutates the source furniture");
});

test("a proposal keeps the model's width even when it leaves only 50 mm", () => {
  const template: Product = { ...productTemplate("kitchen-base"), active: true };
  const candidate = { ...template, id: "base-550", defaults: { ...template.defaults, width: 550 } };
  const source = singleModule(template);
  const sourceBefore = structuredClone(source);
  const slot = getKitchenReplacementSlot(source, "editable")!;
  const fitted = fitKitchenSlotProduct(publicFixture(candidate), slot)!;
  assert.ok(fitted);
  assert.equal(fitted.width, 550, "do not stretch to 600 or shrink to 500 to avoid a small gap");
  const inserted = insertKitchenModule(source, slot, publicFixture(candidate), fitted, () => "fitted-gap");
  assert.equal(inserted.plan.items[1].kind, "space");
  if (inserted.plan.items[1].kind === "space") assert.equal(inserted.plan.items[1].width, 50);
  assert.doesNotThrow(() => buildKitchen(inserted.plan, [template, candidate], defaultSettings));
  assert.deepEqual(source, sourceBefore);
});

test("current UI slots reject changed walls, room height, neighbours and stale empty plans before allocating IDs", () => {
  const base: Product = { ...productTemplate("kitchen-base"), active: true };
  const source = singleModule(base);
  source.items.push({ ...structuredClone(source.items[0]), id: "neighbour" });
  const selected = publicFixture(base);
  const result = buildKitchen(source, [base], defaultSettings).result;
  const replacement = getKitchenReplacementSlot(source, "editable")!;
  const append = getKitchenSlots(source, result).find(slot => slot.row === "base" && !slot.replaceId)!;
  const mutations: ((plan: KitchenPlan) => void)[] = [
    plan => { plan.walls.a -= 10; },
    plan => { plan.roomHeight = 2600; },
    plan => { plan.wallElevation -= 10; },
    plan => { if (plan.items[1].kind === "furniture") plan.items[1].config.depth -= 10; },
  ];
  for (const mutate of mutations) for (const slot of [replacement, append]) {
    const changed = structuredClone(source);
    mutate(changed);
    const before = structuredClone(changed);
    assert.throws(() => insertKitchenModule(changed, slot, selected, base.defaults, () => { assert.fail("stale slots cannot allocate an ID"); }), /espacio cambió/i);
    assert.deepEqual(changed, before);
  }
  const blank = { ...source, items: [] };
  const first = getEmptyKitchenSlot(blank)!;
  assert.throws(() => insertKitchenModule({ ...blank, walls: { ...blank.walls, a: 3000 } }, first, selected, base.defaults, () => "unused"), /espacio cambió/i);
});

test("a partial placeholder replacement validates the whole reservation before allocating IDs", () => {
  const base: Product = { ...productTemplate("kitchen-base"), active: true };
  const source = singleModule(base);
  source.items.unshift({ id: "free", kind: "space", wall: "a", row: "base", width: 600, height: 900, depth: 600 });
  const before = structuredClone(source);
  const selected = publicFixture(base);
  const hole = getKitchenSlots(source, buildKitchen(source, [base], defaultSettings).result).find(slot => slot.replaceId === "free")!;
  assert.equal(hole.replaceWidth, 600);
  const config = { ...base.defaults, width: 400 };
  const noId = () => { assert.fail("an invalid partial reservation cannot allocate IDs"); };
  assert.throws(() => insertKitchenModule(source, { ...hole, leadingSpace: 200, widthAvailable: 500 }, selected, config, noId), /tramo disponible/i);
  assert.throws(() => insertKitchenModule(source, { ...hole, replaceWidth: 500 }, selected, config, noId), /espacio cambió/i);
  assert.throws(() => insertKitchenModule(source, { ...hole, leadingSpace: -10 }, selected, config, noId), /margen/i);
  assert.deepEqual(source, before);
});
