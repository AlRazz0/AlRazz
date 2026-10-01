import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  buildFurniture,
  configSchema,
  cutCSV,
  defaultSettings,
  frontKinds,
  getFrontRates,
  productSchema,
  seedProducts,
  settingsSchema,
  validateConfig,
  validateProduct,
} from "../lib/furniture.ts";
import type { FrontDoor, Product, Settings } from "../lib/furniture.ts";
import { productTemplate } from "../lib/product-templates.ts";
import { publicGeometry } from "../lib/public-geometry.ts";
import { exportCatalogCSV, importCatalogCSV } from "../lib/catalog-csv.ts";

const approx = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const round = (amount: number) => Math.ceil(amount / 10) * 10;
function model(): Product {
  return {
    ...structuredClone(seedProducts[2]),
    frontOptions: [...frontKinds],
    defaults: {
      ...seedProducts[2].defaults,
      width: 1200,
      modules: 2,
      handle: "exterior",
    },
  };
}
test("44 existing model results retain their exact legacy geometry, costs and optional omissions", () => {
  const products = [
    ...seedProducts,
    ...[
      "coleccion-el-capo",
      "coleccion-taller",
      "coleccion-taller-ampliada",
      "coleccion-cocinas-roperos",
    ].flatMap(
      (file) =>
        JSON.parse(
          readFileSync(
            new URL(`../catalog/${file}.json`, import.meta.url),
            "utf8",
          ),
        ).products as Product[],
    ),
  ];
  assert.equal(products.length, 44);
  const digest = createHash("sha256")
    .update(
      JSON.stringify(
        products.map((product) => buildFurniture(product, product.defaults)),
      ),
    )
    .digest("hex");
  assert.equal(
    digest,
    "3c77531194a81a6a9f3a13a5d17b0b79fe1c351aaafe07f586d17efbed6f356c",
  );
  const product = productSchema.parse(seedProducts[2]);
  assert.ok(
    !Object.hasOwn(product, "frontOptions") &&
      !Object.hasOwn(product, "pricing"),
  );
  assert.ok(!Object.hasOwn(configSchema.parse(product.defaults), "front"));
  assert.ok(
    !Object.hasOwn(settingsSchema.parse(defaultSettings), "frontRates"),
  );
  assert.deepEqual(
    buildFurniture(
      { ...product, pricing: { basis: "calculated" } },
      product.defaults,
    ),
    buildFurniture(product, product.defaults),
  );
});

test("glass and aluminum fronts replace melamine doors with actual separate fittings", () => {
  const product = model();
  const original = structuredClone(product);
  const melamine = buildFurniture(product, product.defaults);
  for (const front of ["glass", "aluminum-glass"] as const) {
    const result = buildFurniture(product, { ...product.defaults, front });
    const fittings = result.fixtures!.filter(
      (fixture): fixture is FrontDoor => fixture.kind === "front-door",
    );
    assert.equal(fittings.length, 2);
    assert.equal(result.doors, 2);
    assert.deepEqual(
      result.panels,
      melamine.panels.filter((panel) => !panel.door),
    );
    assert.ok(result.panels.every((panel) => panel.thickness === 18));
    assert.ok(!cutCSV(result).includes("PUERTA_"));
    approx(
      result.area,
      melamine.area -
        melamine.panels
          .filter((panel) => panel.door)
          .reduce((sum, panel) => sum + (panel.length * panel.width) / 1e6, 0),
    );
    for (const fixture of fittings) {
      const inset = front === "glass" ? 0 : 40;
      assert.equal(fixture.glassThickness, 6);
      assert.equal(fixture.glassWidth, fixture.size[0] - inset);
      assert.equal(fixture.glassHeight, fixture.size[1] - inset);
      assert.equal(fixture.size[2], front === "glass" ? 6 : 20);
      assert.equal(
        fixture.position[2] + fixture.size[2] / 2,
        product.defaults.depth / 2,
      );
      approx(
        fixture.glassArea,
        (fixture.glassWidth * fixture.glassHeight) / 1e6,
      );
      approx(
        fixture.frameMeters,
        front === "glass"
          ? 0
          : (2 * (fixture.size[0] + fixture.size[1])) / 1000,
      );
    }
    const geometry = publicGeometry(result.panels, result.fixtures).filter(
      (panel) => panel.door,
    );
    assert.equal(geometry.length, 2);
    for (const panel of geometry) {
      assert.deepEqual(Object.keys(panel).sort(), [
        "door",
        "material",
        "position",
        "size",
        "surface",
      ]);
      assert.equal(panel.surface, front);
    }
  }
  assert.deepEqual(product, original);
});

test("glass area, aluminum perimeter and per-door hardware are billed independently", () => {
  const product = model();
  const settings: Settings = {
    ...defaultSettings,
    frontRates: {
      glass: { basis: "square-meter", amount: 200 },
      aluminum: { basis: "linear-meter", amount: 50 },
      hardware: 75,
    },
  };
  const config = {
    ...product.defaults,
    front: "aluminum-glass" as const,
    install: true,
    transport: true,
  };
  const result = buildFurniture(product, config, settings);
  const fronts = result.fixtures!.filter(
    (fixture): fixture is FrontDoor => fixture.kind === "front-door",
  );
  const expected = fronts.reduce(
    (sum, front) => sum + front.glassArea * 200 + front.frameMeters * 50 + 75,
    0,
  );
  approx(result.breakdown.fronts!, expected);
  assert.equal(result.breakdown.hardware, 0);
  approx(
    result.accessories
      .filter((accessory) => accessory.cost !== undefined)
      .reduce((sum, accessory) => sum + accessory.cost!, 0),
    expected,
  );
  assert.equal(
    result.price,
    round(
      (product.basePrice +
        result.breakdown.materials +
        result.breakdown.edges +
        expected) /
        (1 - settings.margin) +
        settings.installation +
        settings.delivery,
    ),
  );
  const perUnit: Settings = {
    ...settings,
    frontRates: {
      glass: { basis: "unit", amount: 77 },
      aluminum: { basis: "unit", amount: 99 },
      hardware: 13,
    },
  };
  assert.equal(
    buildFurniture(product, config, perUnit).breakdown.fronts,
    2 * (77 + 99 + 13),
  );
  assert.deepEqual(getFrontRates({}), {
    glass: { basis: "square-meter", amount: 180 },
    aluminum: { basis: "linear-meter", amount: 45 },
    hardware: 65,
  });
});

test("selling tariffs replace calculated base once, retaining additions and optional services", () => {
  const product = model();
  for (const basis of ["unit", "linear-meter"] as const) {
    const priced = { ...product, pricing: { basis, amount: 900 } };
    for (const width of [1200, 1100]) {
      const config = { ...product.defaults, width };
      const sale = buildFurniture(priced, config);
      const base = 900 * (basis === "unit" ? 1 : width / 1000);
      assert.equal(sale.price, round(base));
      assert.equal(sale.breakdown.sellingBase!.amount, base);
      const extra = buildFurniture(priced, {
        ...config,
        front: "glass",
        install: true,
        transport: true,
      });
      assert.equal(
        extra.price,
        round(
          base +
            extra.breakdown.fronts! / (1 - defaultSettings.margin) +
            defaultSettings.installation +
            defaultSettings.delivery,
        ),
      );
    }
  }
});

test("front validation prevents incompatible layouts, unsupported handles and oversized glass", () => {
  const product = model();
  assert.throws(
    () =>
      validateConfig(seedProducts[2], { ...product.defaults, front: "glass" }),
    /no está habilitado/,
  );
  for (const handle of ["push", "embutido"] as const)
    assert.throws(
      () =>
        validateConfig(product, {
          ...product.defaults,
          front: "glass",
          handle,
        }),
      /jalador exterior/,
    );
  assert.throws(
    () =>
      validateConfig(product, {
        ...product.defaults,
        front: "glass",
        doors: "none",
      }),
    /Selecciona puertas/,
  );
  assert.equal(
    validateConfig(
      { ...product, frontOptions: ["glass"] },
      { ...product.defaults, doors: "none", front: "melamine" },
    ),
    true,
  );
  for (const kind of ["desk", "open-shelf"] as const) {
    const open = productTemplate(kind);
    assert.throws(
      () => validateProduct({ ...open, frontOptions: [...frontKinds] }),
      /construcción abierta/,
    );
  }
  const tall = {
    ...product,
    limits: { ...product.limits, height: { min: 800, max: 2000 } },
  };
  assert.equal(
    validateConfig(tall, { ...product.defaults, front: "glass", height: 1540 }),
    true,
  );
  assert.throws(
    () =>
      validateConfig(tall, {
        ...product.defaults,
        front: "glass",
        height: 1550,
      }),
    /1500 mm/,
  );
  assert.equal(
    productSchema.safeParse({ ...product, frontOptions: ["glass", "glass"] })
      .success,
    false,
  );
  assert.equal(
    productSchema.safeParse({
      ...product,
      pricing: { basis: "calculated", amount: 10 },
    }).success,
    false,
  );
  assert.equal(
    productSchema.safeParse({
      ...product,
      pricing: { basis: "unit", amount: -1 },
    }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({
      ...defaultSettings,
      frontRates: { glass: { basis: "linear-meter", amount: 12 } },
    }).success,
    false,
  );
});

test("CSV preserves optional front and sale fields and rejects malformed rates or front choices", () => {
  for (const pricing of [
    undefined,
    { basis: "calculated" as const },
    { basis: "unit" as const, amount: 1200 },
    { basis: "linear-meter" as const, amount: 850 },
  ]) {
    const product: Product = {
      ...model(),
      active: false,
      ...(pricing ? { pricing } : {}),
      defaults: { ...model().defaults, front: "aluminum-glass" },
    };
    const imported = importCatalogCSV(
      exportCatalogCSV([product]),
      defaultSettings,
    );
    assert.deepEqual(imported.errors, []);
    assert.deepEqual(imported.products, [product]);
  }
  const legacy = { ...seedProducts[2], active: false };
  assert.deepEqual(
    importCatalogCSV(exportCatalogCSV([legacy]), defaultSettings).products,
    [legacy],
  );
  for (const line of [
    "x1;Modelo;glass|glass;unit;900",
    "x1;Modelo;glass|unknown;unit;900",
    "x1;Modelo;melamine;;900",
    "x1;Modelo;melamine;unit;",
    "x1;Modelo;melamine;unit;=1+2",
    "x1;Modelo;melamine;unit;-20",
    "x1;Modelo;melamine;calculated;900",
  ]) {
    const imported = importCatalogCSV(
      "Código;Nombre;Frentes permitidos;Base de cobro;Tarifa de venta S/\n" +
        line,
      defaultSettings,
    );
    assert.equal(imported.products.length, 0, line);
    assert.equal(imported.errors.length, 1, line);
  }
});
