import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFurniture,
  clothesRailRates,
  cutCSV,
  defaultSettings,
  getConstruction,
  getConstructionOptions,
  productSchema,
  seedProducts,
  settingsSchema,
  validateConfig,
} from "../lib/furniture.ts";
import type { Config, Panel, Product, Result } from "../lib/furniture.ts";
import { productTemplate } from "../lib/product-templates.ts";
import { exportCatalogCSV, importCatalogCSV } from "../lib/catalog-csv.ts";
import { publicGeometry } from "../lib/public-geometry.ts";

type Box = Pick<Panel, "size" | "position">;
function intersects(a: Box, b: Box) {
  return a.size.every(
    (size, axis) =>
      Math.min(
        a.position[axis] + size / 2,
        b.position[axis] + b.size[axis] / 2,
      ) -
        Math.max(
          a.position[axis] - size / 2,
          b.position[axis] - b.size[axis] / 2,
        ) >
      1e-8,
  );
}
function verify(result: Result, config: Config) {
  const boxes: Box[] = [
    ...result.panels,
    ...(result.fixtures || []).map((f) => ({
      size:
        f.kind === "clothes-rail"
          ? ([f.length, f.diameter, f.diameter] as [number, number, number])
          : f.size,
      position: f.position,
    })),
  ];
  assert.equal(
    new Set(result.panels.map((p) => p.id)).size,
    result.panels.length,
  );
  for (const panel of result.panels) {
    assert.equal(panel.thickness, 18);
    assert.ok(Number.isInteger(panel.length) && panel.length > 0);
    assert.ok(Number.isInteger(panel.width) && panel.width > 0);
    const axes = { x: 0, y: 1, z: 2 };
    assert.equal(panel.size[axes[panel.lengthAxis]], panel.length);
    assert.equal(panel.size[axes[panel.widthAxis]], panel.width);
  }
  for (const box of boxes)
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(
        box.position[axis] - box.size[axis] / 2 >=
          [-config.width / 2, 0, -config.depth / 2][axis] - 1e-8,
      );
      assert.ok(
        box.position[axis] + box.size[axis] / 2 <=
          [config.width / 2, config.height, config.depth / 2][axis] + 1e-8,
      );
    }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      assert.equal(
        intersects(boxes[i], boxes[j]),
        false,
        `Intersecting parts ${i}/${j}`,
      );
}

test("wardrobes reserve a real loft, hanging opening and shelves in the remaining columns", () => {
  const base = productTemplate("wardrobe");
  let count = 0;
  for (const [width, modules] of [
    [800, 2],
    [1200, 2],
    [1200, 3],
    [1800, 3],
    [1600, 4],
  ])
    for (const height of [1600, 2100, 2600])
      for (const depth of [500, 700])
        for (const loftHeight of [200, 350, 600])
          for (const hangingModules of [1, modules])
            for (const doors of ["none", "full"] as const) {
              const model: Product = {
                ...base,
                construction: { kind: "wardrobe", loftHeight, hangingModules },
              };
              const config = {
                ...base.defaults,
                width,
                height,
                depth,
                modules,
                doors,
                shelves: hangingModules === modules ? 0 : 3,
              };
              if (height - 54 - loftHeight - 92.5 < 900) {
                assert.throws(() => buildFurniture(model, config), /900 mm/);
                continue;
              }
              const result = buildFurniture(model, config);
              verify(result, config);
              assert.equal(result.fixtures?.length, hangingModules);
              assert.equal(
                result.panels.filter((p) => p.id.startsWith("MALETERO_"))
                  .length,
                modules,
              );
              assert.equal(
                result.panels.filter((p) => p.id.startsWith("REPISA_")).length,
                (modules - hangingModules) * config.shelves,
              );
              for (const loft of result.panels.filter((p) =>
                p.id.startsWith("MALETERO_"),
              ))
                assert.equal(
                  config.height - 18 - loft.position[1] - 9,
                  loftHeight,
                );
              for (let column = 0; column < hangingModules; column++) {
                assert.ok(
                  !result.panels.some((p) =>
                    p.id.startsWith(`REPISA_${column}_`),
                  ),
                );
                assert.ok(
                  result.fixtures![column].position[1] - 12.5 - 18 >= 900,
                );
              }
              count++;
            }
  assert.equal(count, 320);
});

test("kitchen plinth supports the elevated carcass and leaves the front toe space empty", () => {
  const base = productTemplate("kitchen-base");
  let count = 0;
  for (const [width, modules] of [
    [600, 1],
    [1200, 2],
    [1800, 3],
  ])
    for (const height of [700, 850, 1000])
      for (const depth of [450, 750])
        for (const plinthHeight of [60, 100, 180])
          for (const plinthSetback of [30, 150])
            for (const doors of ["none", "full"] as const)
              for (const shelves of [0, 2]) {
                const model: Product = {
                  ...base,
                  construction: {
                    kind: "kitchen-base",
                    plinthHeight,
                    plinthSetback,
                  },
                };
                const config = {
                  ...base.defaults,
                  width,
                  modules,
                  height,
                  depth,
                  doors,
                  shelves,
                };
                const result = buildFurniture(model, config);
                verify(result, config);
                const toe: Box = {
                  size: [width, plinthHeight, plinthSetback],
                  position: [
                    0,
                    plinthHeight / 2,
                    depth / 2 - plinthSetback / 2,
                  ],
                };
                assert.ok(result.panels.every((p) => !intersects(toe, p)));
                const plinth = result.panels.filter((p) =>
                  p.id.startsWith("ZOCALO_"),
                );
                assert.equal(plinth.length, 4 + modules - 1);
                assert.ok(
                  plinth.every(
                    (p) => p.position[1] + p.size[1] / 2 === plinthHeight,
                  ),
                );
                assert.equal(
                  result.panels.find((p) => p.id === "LAT_IZQ")!.position[1] -
                    result.panels.find((p) => p.id === "LAT_IZQ")!.size[1] / 2,
                  plinthHeight,
                );
                for (let index = 1; index < modules; index++)
                  assert.equal(
                    result.panels.find((p) => p.id === `DIV_${index}`)!
                      .position[0],
                    result.panels.find((p) => p.id === `ZOCALO_APOYO_${index}`)!
                      .position[0],
                  );
                assert.equal(Object.hasOwn(result, "fixtures"), false);
                count++;
              }
  assert.equal(count, 432);
});

test("rail length and supports are billed as hardware and never enter melamine cuts", () => {
  const model = productTemplate("wardrobe");
  const settings = {
    ...defaultSettings,
    clothesRailRate: 90,
    clothesRailSupport: 13,
  };
  const result = buildFurniture(model, model.defaults, settings);
  const meters = result.fixtures!.reduce(
    (sum, f) => sum + (f.kind === "clothes-rail" ? f.length / 1000 : 0),
    0,
  );
  const fittings = meters * 90 + result.fixtures!.length * 2 * 13;
  assert.equal(
    result.breakdown.hardware,
    result.doors * settings.doorHardware + fittings,
  );
  assert.equal(
    result.accessories
      .filter((a) => a.unit)
      .reduce((sum, a) => sum + a.cost!, 0),
    fittings,
  );
  assert.equal(
    result.area,
    result.panels.reduce((sum, p) => sum + (p.length * p.width) / 1e6, 0),
  );
  assert.ok(!cutCSV(result).includes("BARRA_"));
  assert.ok(!result.panels.some((p) => p.name.includes("Barra")));
  const geometry = publicGeometry(result.panels, result.fixtures);
  assert.equal(geometry.length, result.panels.length + result.fixtures!.length);
  for (const item of geometry.filter((p) => p.shape === "cylinder")) {
    assert.deepEqual(Object.keys(item).sort(), [
      "material",
      "position",
      "shape",
      "size",
    ]);
    assert.equal(item.material, "metal");
    assert.deepEqual(item.size.slice(1), [25, 25]);
  }
  assert.equal(
    result.price,
    Math.ceil(
      (model.basePrice +
        result.breakdown.materials +
        result.breakdown.edges +
        result.breakdown.hardware) /
        (1 - settings.margin) /
        10,
    ) * 10,
  );
  const oldSettings = settingsSchema.parse(defaultSettings);
  assert.equal(Object.hasOwn(oldSettings, "clothesRailRate"), false);
  assert.equal(Object.hasOwn(oldSettings, "clothesRailSupport"), false);
  assert.deepEqual(clothesRailRates(oldSettings), {
    perMeter: 35,
    perSupport: 8,
  });
  for (const old of seedProducts)
    assert.deepEqual(
      buildFurniture(old, old.defaults, settings),
      buildFurniture(old, old.defaults, defaultSettings),
    );
});

test("new construction constraints reject impossible hanging, plinth and cabinet options", () => {
  const wardrobe = productTemplate("wardrobe"),
    kitchen = productTemplate("kitchen-base");
  assert.deepEqual(getConstruction({ construction: { kind: "wardrobe" } }), {
    kind: "wardrobe",
    loftHeight: 350,
    hangingModules: 1,
  });
  assert.deepEqual(
    getConstruction({ construction: { kind: "kitchen-base" } }),
    { kind: "kitchen-base", plinthHeight: 100, plinthSetback: 70 },
  );
  const allHang: Product = {
    ...wardrobe,
    construction: { kind: "wardrobe", hangingModules: 2 },
  };
  assert.deepEqual(
    getConstructionOptions(allHang, { modules: 2 }).shelves,
    [0],
  );
  assert.equal(getConstructionOptions(allHang).modules[0], 2);
  assert.throws(() => validateConfig(allHang, allHang.defaults), /compatible/);
  for (const change of [
    { depth: 490 },
    { depth: 710 },
    { height: 1590 },
    { height: 2610 },
    { width: 800, modules: 3 },
    { doors: "lower" as const },
  ])
    assert.throws(() =>
      validateConfig(wardrobe, { ...wardrobe.defaults, ...change }),
    );
  for (const change of [
    { depth: 440 },
    { depth: 760 },
    { height: 690 },
    { height: 1010 },
    { doors: "lower" as const },
  ])
    assert.throws(() =>
      validateConfig(kitchen, { ...kitchen.defaults, ...change }),
    );
  for (const construction of [
    { kind: "wardrobe", loftHeight: 355 },
    { kind: "wardrobe", hangingModules: 0 },
    { kind: "kitchen-base", plinthHeight: 190 },
    { kind: "kitchen-base", plinthSetback: 20 },
    { kind: "cabinet", loftHeight: 350 },
  ])
    assert.throws(() => productSchema.parse({ ...wardrobe, construction }));
});

test("typed catalog CSV keeps construction and gallery fields without adding legacy fields", () => {
  const products: Product[] = [
    { ...seedProducts[0], active: false },
    {
      ...productTemplate("wardrobe"),
      gallery: {
        enabled: true,
        scene: "light",
        caption: "Espacio para colgar y guardar.",
      },
    },
    {
      ...productTemplate("kitchen-base"),
      gallery: { enabled: false, scene: "dark" },
    },
    {
      ...productTemplate("wardrobe"),
      id: "wardrobe-implicit",
      construction: { kind: "wardrobe" },
    },
  ];
  for (const separator of [";", ","] as const) {
    const imported = importCatalogCSV(
      exportCatalogCSV(products, separator),
      defaultSettings,
    );
    assert.deepEqual(imported.errors, []);
    assert.deepEqual(imported.products, products);
  }
  for (const [column, value] of [
    ["loftHeight", "350"],
    ["hangingModules", "1"],
    ["plinthHeight", "100"],
    ["plinthSetback", "70"],
  ]) {
    const imported = importCatalogCSV(
      `id;name;construction;${column}\ninvalid-model;Modelo inválido;cabinet;${value}`,
    );
    assert.equal(imported.products.length, 0);
    assert.equal(imported.errors.length, 1);
  }
  const invalidScene = importCatalogCSV(
    "id;name;galleryScene\ninvalid-scene;Escena inválida;remote-url",
  );
  assert.equal(invalidScene.products.length, 0);
  assert.equal(invalidScene.errors.length, 1);
});
