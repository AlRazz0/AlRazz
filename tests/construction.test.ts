import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFurniture,
  createFurnitureBuilder,
  defaultSettings,
  getConstruction,
  getConstructionOptions,
  productCategories,
  productSchema,
  seedProducts,
  validateConfig,
  validateProduct,
} from "../lib/furniture.ts";
import type { Config, Construction, Panel, Product } from "../lib/furniture.ts";

function product(construction: Construction): Product {
  const desk =
    construction.kind === "desk" || construction.kind === "desk-storage";
  return {
    ...seedProducts[0],
    id: "construction-test",
    name: "Modelo de prueba",
    category: desk ? "Escritorios" : "Estanterías",
    construction,
    limits: {
      width: { min: 200, max: 3000 },
      height: { min: 200, max: 2400 },
      depth: { min: 100, max: 1000 },
    },
    defaults: {
      ...seedProducts[0].defaults,
      width: 1200,
      height: desk ? 750 : 1800,
      depth: desk ? 600 : 400,
      modules: desk ? 1 : 2,
      shelves: construction.kind === "desk" ? 0 : 2,
      doors: "none",
    },
  };
}

function intersects(
  a: Pick<Panel, "size" | "position">,
  b: Pick<Panel, "size" | "position">,
) {
  return a.size.every(
    (_, axis) =>
      Math.min(
        a.position[axis] + a.size[axis] / 2,
        b.position[axis] + b.size[axis] / 2,
      ) -
        Math.max(
          a.position[axis] - a.size[axis] / 2,
          b.position[axis] - b.size[axis] / 2,
        ) >
      1e-8,
  );
}

function verifyGeometry(model: Product, config = model.defaults) {
  const result = buildFurniture(model, config);
  const axis = { x: 0, y: 1, z: 2 };
  assert.equal(
    new Set(result.panels.map((panel) => panel.id)).size,
    result.panels.length,
  );
  for (const panel of result.panels) {
    assert.equal(panel.thickness, 18);
    assert.ok(Number.isInteger(panel.length) && panel.length > 0);
    assert.ok(Number.isInteger(panel.width) && panel.width > 0);
    assert.equal(panel.size[axis[panel.lengthAxis]], panel.length);
    assert.equal(panel.size[axis[panel.widthAxis]], panel.width);
    assert.equal(
      panel.size.find(
        (_, i) => i !== axis[panel.lengthAxis] && i !== axis[panel.widthAxis],
      ),
      18,
    );
    for (let i = 0; i < 3; i++) {
      assert.ok(
        panel.position[i] - panel.size[i] / 2 >=
          [-config.width / 2, 0, -config.depth / 2][i] - 1e-8,
      );
      assert.ok(
        panel.position[i] + panel.size[i] / 2 <=
          [config.width / 2, config.height, config.depth / 2][i] + 1e-8,
      );
    }
  }
  for (let i = 0; i < result.panels.length; i++)
    for (let j = i + 1; j < result.panels.length; j++)
      assert.equal(
        intersects(result.panels[i], result.panels[j]),
        false,
        `${result.panels[i].id} collides with ${result.panels[j].id}`,
      );
  assert.ok(Number.isFinite(result.price) && result.price > 0);
  return result;
}

function verifyKnee(model: Product, config: Config, panels: Panel[]) {
  const construction = getConstruction(model);
  let left = -config.width / 2 + 18,
    right = config.width / 2 - 18;
  if (construction.kind === "desk-storage") {
    if (construction.storageSide === "left")
      left = -config.width / 2 + construction.storageWidth;
    else right = config.width / 2 - construction.storageWidth;
  }
  assert.ok(right - left >= 600);
  // The rear apron is excluded; the entire remaining depth stays open to 620 mm high.
  const knee: Pick<Panel, "size" | "position"> = {
    size: [right - left, 620, config.depth - 18],
    position: [(left + right) / 2, 310, 9],
  };
  for (const panel of panels)
    assert.equal(
      intersects(knee, panel),
      false,
      `${panel.id} blocks the working opening`,
    );
}

test("omitted construction remains omitted and cabinet results match the historical contract", () => {
  for (const original of seedProducts) {
    const snapshot = structuredClone(original);
    assert.equal(
      Object.hasOwn(productSchema.parse(original), "construction"),
      false,
    );
    assert.deepEqual(getConstruction(original), { kind: "cabinet" });
    assert.deepEqual(
      buildFurniture(original, original.defaults),
      buildFurniture(
        { ...original, construction: { kind: "cabinet" } },
        original.defaults,
      ),
    );
    assert.deepEqual(original, snapshot);
  }
  const partial = { construction: { kind: "desk-storage" } as const };
  assert.deepEqual(getConstruction(partial), {
    kind: "desk-storage",
    storageSide: "left",
    storageWidth: 450,
  });
  assert.deepEqual(partial, { construction: { kind: "desk-storage" } });
  assert.ok(
    ["Escritorios", "Veladores", "Zapateras", "Auxiliares", "Cocina"].every(
      (category) => (productCategories as readonly string[]).includes(category),
    ),
  );
});

test("open shelves remove the back and use the newly available rear depth without collisions", () => {
  const open = product({ kind: "open-shelf" });
  for (const config of [
    open.defaults,
    {
      ...open.defaults,
      width: 600,
      height: 400,
      depth: 250,
      modules: 1,
      shelves: 1,
    },
    {
      ...open.defaults,
      width: 2400,
      height: 2200,
      depth: 600,
      modules: 4,
      shelves: 6,
    },
  ]) {
    const result = verifyGeometry(open, config);
    const closed = buildFurniture(
      { ...open, construction: { kind: "cabinet" } },
      config,
    );
    assert.equal(
      result.panels.some((panel) => panel.id === "FONDO"),
      false,
    );
    assert.equal(result.panels.length, closed.panels.length - 1);
    for (const panel of result.panels) {
      assert.equal(panel.widthAxis, "z");
      assert.equal(panel.edges.left, "Grueso");
      assert.equal(panel.edges.right, "Grueso");
      assert.equal(panel.edges.top, "Ninguno");
      assert.equal(panel.edges.bottom, "Ninguno");
    }
    assert.equal(result.edges, closed.edges * 2);
    assert.equal(
      result.edges,
      result.panels.reduce((total, panel) => total + 2 * panel.length, 0) /
        1000,
    );
    assert.equal(
      result.breakdown.edges,
      result.edges * defaultSettings.edgeRate,
    );
    for (const shelf of result.panels.filter((panel) =>
      panel.id.startsWith("REPISA_"),
    )) {
      assert.equal(shelf.size[2], config.depth - 22);
      assert.equal(
        shelf.position[2] - shelf.size[2] / 2,
        -config.depth / 2 + 2,
      );
      assert.equal(
        shelf.position[2] + shelf.size[2] / 2,
        config.depth / 2 - 20,
      );
    }
  }
  assert.throws(
    () => validateConfig(open, { ...open.defaults, doors: "full" }),
    /compatible/,
  );
});

test("simple desk has a real top, side supports and 180 mm apron with an empty working opening", () => {
  const desk = product({ kind: "desk" });
  assert.deepEqual(getConstructionOptions(desk), {
    modules: [1],
    shelves: [0],
    doors: ["none"],
  });
  for (const width of [640, 1200])
    for (const height of [700, 850])
      for (const depth of [450, 750]) {
        const config = { ...desk.defaults, width, height, depth };
        const result = verifyGeometry(desk, config);
        assert.deepEqual(
          result.panels.map((panel) => panel.id),
          ["TAPA", "LAT_IZQ", "LAT_DER", "FALDON"],
        );
        assert.equal(
          result.panels.find((panel) => panel.id === "FALDON")!.size[1],
          180,
        );
        assert.equal(
          result.panels.find((panel) => panel.id === "TAPA")!.size[0],
          width,
        );
        verifyKnee(desk, config, result.panels);
      }
  for (const changes of [
    { width: 630 },
    { width: 1210 },
    { height: 690 },
    { height: 860 },
    { depth: 440 },
    { depth: 760 },
    { modules: 2 },
    { shelves: 1 },
    { doors: "full" as const },
  ])
    assert.throws(() => validateConfig(desk, { ...desk.defaults, ...changes }));
});

test("left and right storage desks preserve the knee opening and validate shelves and doors separately", () => {
  let configurations = 0;
  for (const storageSide of ["left", "right"] as const)
    for (const storageWidth of [250, 450, 600, 650]) {
      const desk = product({ kind: "desk-storage", storageSide, storageWidth });
      const widths = [
        Math.ceil((storageWidth + 18 + 600) / 10) * 10,
        Math.min(1600, Math.floor((storageWidth + 18 + 1000) / 10) * 10),
      ];
      for (const width of widths)
        for (const height of [700, 850])
          for (const depth of [450, 750])
            for (const doors of ["none", "full"] as const) {
              if (storageWidth > 636 && doors === "full") continue;
              const config = { ...desk.defaults, width, height, depth, doors };
              const result = verifyGeometry(desk, config);
              assert.equal(
                result.panels.length,
                7 + config.shelves + (doors === "full" ? 1 : 0),
              );
              verifyKnee(desk, config, result.panels);
              assert.equal(
                result.accessories.find(
                  (item) => item.name === "Soportes de repisa",
                )!.quantity,
                config.shelves * 4,
              );
              configurations++;
            }
    }
  assert.equal(configurations, 112);
  const desk = product({ kind: "desk-storage", storageWidth: 450 });
  for (const changes of [
    { width: 1060 },
    { width: 1470 },
    { width: 1610 },
    { shelves: 7 },
    { doors: "lower" as const },
    { modules: 2 },
  ])
    assert.throws(() => validateConfig(desk, { ...desk.defaults, ...changes }));
  const broad = product({ kind: "desk-storage", storageWidth: 650 });
  assert.throws(
    () =>
      validateConfig(broad, { ...broad.defaults, width: 1400, doors: "full" }),
    /600 mm/,
  );
});

test("every new construction bills its actual panels, edges and door hardware through the shared totals", () => {
  for (const construction of [
    { kind: "open-shelf" },
    { kind: "desk" },
    { kind: "desk-storage", storageSide: "right" },
  ] as const) {
    const model = product(construction);
    const config = {
      ...model.defaults,
      doors:
        construction.kind === "desk-storage"
          ? ("full" as const)
          : ("none" as const),
      interior: "hispano-gris-suave",
      install: true,
      transport: true,
    };
    const settings = {
      ...defaultSettings,
      materials: defaultSettings.materials.map((material) => ({
        ...material,
        price: material.id === config.interior ? 150 : 100,
      })),
    };
    validateProduct(model, settings);
    const result = buildFurniture(model, config, settings);
    const materials = result.panels.reduce(
      (sum, panel) =>
        sum +
        (((panel.length * panel.width) / 1e6) *
          (panel.material === config.interior ? 150 : 100) *
          settings.materialRate) /
          100,
      0,
    );
    assert.ok(Math.abs(result.breakdown.materials - materials) < 1e-8);
    assert.equal(
      result.breakdown.hardware,
      result.panels.filter((panel) => panel.door).length *
        settings.doorHardware,
    );
    assert.equal(
      result.price,
      Math.ceil(
        ((model.basePrice +
          materials +
          result.edges * settings.edgeRate +
          result.breakdown.hardware) /
          (1 - settings.margin) +
          settings.installation +
          settings.delivery) /
          10,
      ) * 10,
    );
  }
  for (const construction of [
    { kind: "desk", storageWidth: 450 },
    { kind: "desk-storage", storageWidth: 255 },
    { kind: "desk-storage", storageSide: "center" },
    { kind: "drawer" },
  ])
    assert.throws(() =>
      productSchema.parse({ ...seedProducts[0], construction }),
    );
});

test("batch builders preserve results and isolate the validated settings snapshot", () => {
  const settings = structuredClone(defaultSettings);
  const builder = createFurnitureBuilder(settings);
  for (const construction of [
    { kind: "cabinet" },
    { kind: "open-shelf" },
    { kind: "desk" },
    { kind: "desk-storage", storageSide: "right" },
  ] as const) {
    const model = product(construction);
    assert.deepEqual(
      builder(model, model.defaults),
      buildFurniture(model, model.defaults, settings),
    );
  }
  const model = product({ kind: "desk-storage" });
  const expected = builder(model, model.defaults);
  settings.edgeRate += 30;
  settings.margin = 0.6;
  settings.materials.find(
    (material) => material.id === model.defaults.finish,
  )!.price += 200;
  assert.deepEqual(builder(model, model.defaults), expected);
  assert.notEqual(
    buildFurniture(model, model.defaults, settings).price,
    expected.price,
  );
  settings.materials.find(
    (material) => material.id === model.defaults.finish,
  )!.active = false;
  assert.deepEqual(builder(model, model.defaults), expected);
  assert.throws(
    () => buildFurniture(model, model.defaults, settings),
    /disponible/,
  );
  assert.throws(() => builder(model, { ...model.defaults, width: 600 }));
  assert.throws(
    () => builder(model, { ...model.defaults, finish: "missing-material" }),
    /disponible/,
  );
  assert.throws(() =>
    createFurnitureBuilder({ ...defaultSettings, edgeRate: -1 }),
  );
  const result = builder(model, model.defaults);
  result.panels[0].size[0] = 1;
  assert.deepEqual(builder(model, model.defaults), expected);
});
