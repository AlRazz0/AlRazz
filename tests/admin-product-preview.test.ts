import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFurniture,
  defaultSettings,
  validateProduct,
} from "../lib/furniture.ts";
import {
  constructionTemplates,
  productTemplate,
} from "../lib/product-templates.ts";
import { publicGeometry } from "../lib/public-geometry.ts";
import { buildAdminPreview } from "../src/admin-product-preview.ts";

test("an unnamed draft previews the exact shared model without changing the draft", () => {
  for (const template of constructionTemplates) {
    const draft = {
      ...structuredClone(template),
      id: "",
      name: "",
      description: "",
      gallery: {
        enabled: false,
        scene: "dark" as const,
        caption: "Referencia privada",
      },
    };
    const before = structuredClone(draft);
    const expected = buildFurniture(
      template,
      template.defaults,
      defaultSettings,
    );
    const preview = buildAdminPreview(draft, defaultSettings);
    assert.deepEqual(
      preview.geometry,
      publicGeometry(expected.panels, expected.fixtures),
    );
    assert.equal(preview.result.price, expected.price);
    assert.deepEqual(draft, before);
    assert.throws(
      () => validateProduct(draft),
      "Previewing a draft must not make its unfinished metadata saveable",
    );
  }
});

test("dimension and construction changes update both panels and visible clothes rails", () => {
  const product = productTemplate("wardrobe");
  const initial = buildAdminPreview(product, defaultSettings);
  const edited = {
    ...product,
    construction: {
      kind: "wardrobe" as const,
      loftHeight: 450,
      hangingModules: 1,
    },
    defaults: { ...product.defaults, width: 1100, height: 2200 },
  };
  const next = buildAdminPreview(edited, defaultSettings);
  assert.notDeepEqual(initial.geometry, next.geometry);
  const rail = next.geometry.find((item) => item.shape === "cylinder");
  assert.ok(
    rail,
    "The private editor must render the same hanging hardware as the public model",
  );
  assert.notDeepEqual(
    rail,
    initial.geometry.find((item) => item.shape === "cylinder"),
  );
  const serverResult = buildFurniture(edited, edited.defaults, defaultSettings);
  assert.deepEqual(
    next.geometry,
    publicGeometry(serverResult.panels, serverResult.fixtures),
  );
  assert.equal(next.result.price, serverResult.price);
});

test("incomplete numbers and invalid construction never produce a plausible substitute model or price", () => {
  const product = productTemplate("desk-storage");
  for (const draft of [
    { ...product, defaults: { ...product.defaults, width: Number.NaN } },
    { ...product, basePrice: Number.NaN },
    {
      ...product,
      construction: { kind: "desk-storage" as const, storageWidth: Number.NaN },
    },
    {
      ...product,
      defaults: { ...product.defaults, width: 1070 },
      construction: { kind: "desk-storage" as const, storageWidth: 650 },
    },
  ]) {
    const before = structuredClone(draft);
    assert.throws(() => buildAdminPreview(draft, defaultSettings));
    assert.deepEqual(draft, before);
  }
});

test("previewing old models does not materialize optional catalog or tariff fields", () => {
  const product = productTemplate("cabinet");
  delete product.construction;
  delete product.gallery;
  const settings = structuredClone(defaultSettings);
  delete settings.clothesRailRate;
  delete settings.clothesRailSupport;
  const beforeProduct = structuredClone(product),
    beforeSettings = structuredClone(settings);
  buildAdminPreview(product, settings);
  assert.deepEqual(product, beforeProduct);
  assert.deepEqual(settings, beforeSettings);
});

test("admin preview applies edited selling tariffs, allowed glass fronts and their current extra costs", () => {
  const draft = productTemplate("kitchen-base");
  draft.frontOptions = ["melamine", "aluminum-glass"];
  draft.defaults = {
    ...draft.defaults,
    doors: "full",
    front: "aluminum-glass",
    handle: "exterior",
  };
  draft.pricing = { basis: "linear-meter", amount: 650 };
  const settings = structuredClone(defaultSettings);
  settings.frontRates = {
    glass: { basis: "unit", amount: 80 },
    aluminum: { basis: "unit", amount: 45 },
    hardware: 30,
  };
  const preview = buildAdminPreview(draft, settings);
  const expected = buildFurniture(draft, draft.defaults, settings);
  assert.equal(preview.result.price, expected.price);
  assert.deepEqual(
    preview.geometry,
    publicGeometry(expected.panels, expected.fixtures),
  );
  assert.ok(
    preview.geometry.some((panel) => panel.surface === "aluminum-glass"),
  );
  const lowerTariff = buildAdminPreview(
    { ...draft, pricing: { basis: "linear-meter", amount: 400 } },
    settings,
  );
  assert.ok(lowerTariff.result.price < preview.result.price);
  assert.throws(() =>
    buildAdminPreview({ ...draft, frontOptions: ["melamine"] }, settings),
  );
});
