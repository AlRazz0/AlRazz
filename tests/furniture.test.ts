import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFurniture,
  configSchema,
  cutCSV,
  defaultSettings,
  materialDisplayName,
  materialSchema,
  publicMaterials,
  quoteCSVCell,
  seedProducts,
  settingsSchema,
  THICKNESS,
  validateConfig,
  validateProduct,
} from "../lib/furniture.ts";
import type { Config, Panel, Product, Settings } from "../lib/furniture.ts";
import { commercialMaterials } from "../lib/material-presets.ts";
import { mergeCommercialMaterials } from "../lib/material-catalog.ts";
import { existsSync } from "node:fs";
import {
  catalogCSVTemplate,
  exportCatalogCSV,
  importCatalogCSV,
} from "../lib/catalog-csv.ts";

const approximate = (actual: number, expected: number) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-8,
    `${actual} differs from ${expected}`,
  );
const axis = { x: 0, y: 1, z: 2 } as const;
test("Facebook business contact accepts only the supported HTTPS origins", () => {
  for (const facebook of [
    "",
    "https://facebook.com/mi-taller",
    "https://www.facebook.com/profile.php?id=123456",
    "https://m.facebook.com/mi-taller",
  ]) {
    assert.equal(
      settingsSchema.parse({ ...defaultSettings, facebook }).facebook,
      facebook,
    );
  }
  for (const facebook of [
    "javascript:alert(1)",
    "data:text/html,example",
    "http://facebook.com/mi-taller",
    "//facebook.com/mi-taller",
    "https://facebook.com.ejemplo.test/mi-taller",
    "https://ejemplo.test/facebook.com",
    "https://facebook.com@ejemplo.test/",
    "https://usuario:clave@facebook.com/",
    "https://%75suario@www.facebook.com/",
    "https://www.facebook.com:8443/",
    "https://www.facebook.com%2Fejemplo.test/",
  ]) {
    assert.equal(
      settingsSchema.safeParse({ ...defaultSettings, facebook }).success,
      false,
      facebook,
    );
  }
});

test("reading older business settings never inserts a Facebook link", () => {
  const legacy = structuredClone(defaultSettings);
  delete legacy.facebook;
  const before = structuredClone(legacy);
  const parsed = settingsSchema.parse(legacy);
  assert.equal(Object.hasOwn(parsed, "facebook"), false);
  assert.deepEqual(legacy, before);
  assert.equal(settingsSchema.parse({ ...legacy, facebook: "" }).facebook, "");
});

test("older business settings preserve the primary contact and default the second contact", () => {
  const { whatsappSecondary: _secondary, ...legacy } = defaultSettings;
  const parsed = settingsSchema.parse({ ...legacy, whatsapp: "51900000001" });
  assert.equal(parsed.whatsapp, "51900000001");
  assert.equal(parsed.whatsappSecondary, "");
  assert.equal(
    settingsSchema.parse({ ...parsed, whatsappSecondary: "51900000002" })
      .whatsappSecondary,
    "51900000002",
  );
  assert.equal(
    settingsSchema.safeParse({
      ...parsed,
      whatsappSecondary: "+51 900 000 002",
    }).success,
    false,
  );
});

function verifyGeometry(product: Product, config: Config) {
  const result = buildFurniture(product, config);
  const expectedCount =
    5 +
    config.modules -
    1 +
    config.modules * config.shelves +
    (config.doors === "lower" ? config.modules : 0) +
    (config.doors !== "none" ? config.modules : 0);
  assert.equal(result.panels.length, expectedCount);
  assert.equal(
    new Set(result.panels.map((panel) => panel.id)).size,
    expectedCount,
  );
  for (const panel of result.panels) {
    assert.equal(panel.thickness, THICKNESS);
    assert.equal(panel.quantity, 1);
    assert.ok(Number.isInteger(panel.length) && panel.length > 0);
    assert.ok(Number.isInteger(panel.width) && panel.width > 0);
    assert.equal(panel.size[axis[panel.lengthAxis]], panel.length);
    assert.equal(panel.size[axis[panel.widthAxis]], panel.width);
    assert.equal(
      panel.size.find(
        (_, index) =>
          index !== axis[panel.lengthAxis] && index !== axis[panel.widthAxis],
      ),
      18,
    );
    for (let index = 0; index < 3; index++) {
      assert.ok(Number.isFinite(panel.position[index]));
      const low = [-config.width / 2, 0, -config.depth / 2][index];
      const high = [config.width / 2, config.height, config.depth / 2][index];
      assert.ok(
        panel.position[index] - panel.size[index] / 2 >= low - 1e-8,
        `${panel.id} starts outside axis ${index}`,
      );
      assert.ok(
        panel.position[index] + panel.size[index] / 2 <= high + 1e-8,
        `${panel.id} ends outside axis ${index}`,
      );
    }
  }
  for (let first = 0; first < result.panels.length; first++) {
    for (let second = first + 1; second < result.panels.length; second++) {
      const a = result.panels[first],
        b = result.panels[second];
      const overlap = a.size.map(
        (_, index) =>
          Math.min(
            a.position[index] + a.size[index] / 2,
            b.position[index] + b.size[index] / 2,
          ) -
          Math.max(
            a.position[index] - a.size[index] / 2,
            b.position[index] - b.size[index] / 2,
          ),
      );
      assert.ok(
        !overlap.every((value) => value > 1e-8),
        `${a.id} intersects ${b.id}`,
      );
    }
  }
  assert.ok(Number.isFinite(result.price) && result.price >= 0);
  return result;
}

test("seed products produce exact positive panels without collisions", () => {
  for (const product of seedProducts) {
    validateProduct(product, defaultSettings);
    verifyGeometry(product, product.defaults);
  }
});

test("boundary configurations respect the envelope, thickness and shared cut geometry", () => {
  let verified = 0;
  for (const product of seedProducts) {
    for (const width of [
      product.limits.width.min,
      product.defaults.width,
      product.limits.width.max,
    ]) {
      for (const height of [
        product.limits.height.min,
        product.limits.height.max,
      ]) {
        for (const depth of [
          product.limits.depth.min,
          product.limits.depth.max,
        ]) {
          for (const modules of [1, 2, 3, 4, 5, 6]) {
            for (const doors of ["none", "lower", "full"] as const) {
              for (const shelves of [0, 1, 3, 7]) {
                const config = {
                  ...product.defaults,
                  width,
                  height,
                  depth,
                  modules,
                  doors,
                  shelves,
                };
                try {
                  validateConfig(product, config);
                } catch {
                  continue;
                }
                verifyGeometry(product, config);
                verified++;
              }
            }
          }
        }
      }
    }
  }
  assert.ok(verified > 500, `Only ${verified} configurations exercised`);
});

test("whole-mm modules sum to outer width and differ by at most one mm", () => {
  const product = seedProducts[2],
    result = buildFurniture(product, product.defaults);
  const doors = result.panels.filter((panel) => panel.door);
  const bayWidths = doors.map((panel) => panel.width + 4);
  assert.deepEqual(bayWidths, [510, 509, 509]);
  assert.equal(
    bayWidths.reduce((sum, width) => sum + width, 0) + 4 * THICKNESS,
    1600,
  );
  const cut = cutCSV(result);
  for (const panel of result.panels)
    assert.ok(cut.includes(`"${panel.length}";"${panel.width}";"18"`));
});

test("front edge mapping bills only exposed faces; back has no edge tape", () => {
  const product = seedProducts[0];
  const config: Config = {
    ...product.defaults,
    width: 600,
    height: 900,
    modules: 1,
    shelves: 0,
    doors: "none",
  };
  const result = buildFurniture(product, config);
  approximate(result.edges, (2 * 900 + 2 * 564) / 1000);
  const back = result.panels.find((panel) => panel.id === "FONDO")!;
  assert.deepEqual(Object.values(back.edges), [
    "Ninguno",
    "Ninguno",
    "Ninguno",
    "Ninguno",
  ]);
  for (const panel of result.panels.filter((panel) => panel.id !== "FONDO")) {
    assert.equal(panel.widthAxis, "z");
    assert.deepEqual(panel.edges, {
      top: "Ninguno",
      bottom: "Ninguno",
      left: "Ninguno",
      right: "Grueso",
    });
  }
});

test("shelves preserve side, back and door clearances and at least 100 mm vertical openings", () => {
  for (const product of seedProducts) {
    const result = buildFurniture(product, product.defaults);
    const config = product.defaults;
    const shelves = result.panels
      .filter((panel) => panel.id.startsWith("REPISA_0_"))
      .sort((a, b) => a.position[1] - b.position[1]);
    const separator = result.panels.find((panel) => panel.id === "SEP_0");
    let bottom = separator ? separator.position[1] + 9 : 18;
    for (const shelf of shelves) {
      assert.ok(shelf.position[1] - 9 - bottom >= 100 - 1e-8);
      approximate(
        shelf.position[2] - shelf.size[2] / 2,
        -config.depth / 2 + 18 + 2,
      );
      approximate(
        shelf.position[2] + shelf.size[2] / 2,
        config.depth / 2 - 18 - 2,
      );
      bottom = shelf.position[1] + 9;
    }
    assert.ok(config.height - 18 - bottom >= 100 - 1e-8);
  }
});

test("rejects nonfinite, off-step, unsupported fields and physically invalid quantities", () => {
  const product = seedProducts[0];
  for (const value of [NaN, Infinity, -Infinity, 1805, 1800.5])
    assert.throws(() =>
      configSchema.parse({ ...product.defaults, width: value }),
    );
  assert.throws(() =>
    configSchema.parse({ ...product.defaults, thickness: 16 }),
  );
  assert.throws(() => configSchema.parse({ ...product.defaults, drawers: 2 }));
  for (const modules of [0, 7, 1.5])
    assert.throws(() => configSchema.parse({ ...product.defaults, modules }));
  assert.throws(
    () =>
      validateConfig(product, { ...product.defaults, width: 600, modules: 6 }),
    /180 mm/,
  );
  assert.throws(
    () =>
      validateConfig(product, { ...product.defaults, width: 1800, modules: 1 }),
    /750 mm/,
  );
  assert.throws(
    () =>
      validateConfig(product, { ...product.defaults, width: 1400, modules: 2 }),
    /600 mm/,
  );
  assert.throws(
    () =>
      validateConfig(product, { ...product.defaults, height: 900, shelves: 7 }),
    /100 mm/,
  );
  assert.throws(() =>
    validateProduct({
      ...product,
      limits: { ...product.limits, width: { min: 610, max: 600 } },
    }),
  );
});

test("materials are administrable, separately costed, labelled in CSV and required to be active", () => {
  const product = seedProducts[0];
  const settings = settingsSchema.parse({
    ...defaultSettings,
    materialRate: 100,
    materials: [
      ...defaultSettings.materials,
      {
        id: "roble-claro-2026",
        name: "Roble, selección especial",
        color: "#D4AB72",
        price: 155,
        active: true,
      },
    ],
  });
  const config = {
    ...product.defaults,
    finish: "roble-claro-2026",
    interior: defaultSettings.materials[0].id,
  };
  const result = buildFurniture(product, config, settings);
  const costs = result.panels.reduce(
    (sum, panel) =>
      sum +
      ((panel.length * panel.width) / 1e6) *
        (panel.material === config.finish
          ? 155
          : defaultSettings.materials[0].price),
    0,
  );
  approximate(result.breakdown.materials, costs);
  assert.equal(
    result.panels.find((panel) => panel.id === "FONDO")!.material,
    config.interior,
  );
  assert.ok(cutCSV(result).includes("Roble, selección especial"));
  assert.throws(
    () => buildFurniture(product, { ...config, finish: "missing" }, settings),
    /no está disponible/,
  );
  assert.throws(
    () =>
      buildFurniture(product, config, {
        ...settings,
        materials: settings.materials.map((material) => ({
          ...material,
          active: material.id !== config.finish,
        })),
      }),
    /no está disponible/,
  );
  assert.throws(
    () =>
      settingsSchema.parse({
        ...settings,
        materials: [...settings.materials, settings.materials[0]],
      }),
    /repetido/,
  );
  assert.throws(() =>
    settingsSchema.parse({
      ...settings,
      materials: [
        { id: "same", name: "Otro", color: "#112233", price: 0, active: true },
      ],
    }),
  );
  assert.throws(() => settingsSchema.parse({ ...settings, margin: 1 }));
});

test("legacy settings gain independent material arrays without sharing mutable defaults", () => {
  const { materials: _materials, ...legacy } = defaultSettings;
  const first = settingsSchema.parse(legacy),
    second = settingsSchema.parse(legacy);
  assert.equal(first.materials.length, 6);
  assert.deepEqual(
    first.materials.map((material) => material.id),
    ["roble", "arcilla", "blanco", "oliva", "azul", "grafito"],
  );
  assert.ok(
    first.materials.every(
      (material) =>
        material.brand === "" &&
        material.code === "" &&
        material.board === "standard",
    ),
  );
  first.materials[0].name = "Changed locally";
  assert.notEqual(second.materials[0].name, first.materials[0].name);
  assert.notEqual(defaultSettings.materials[0].name, first.materials[0].name);
});

test("legacy material metadata migrates without changing snapshots, costs or material IDs", () => {
  const material = {
    id: "custom-legacy",
    name: "Acabado anterior",
    color: "#aabbcc",
    price: 142,
    active: true,
  };
  const legacy = { ...defaultSettings, materials: [material] };
  const stored = JSON.stringify(legacy);
  const migrated = settingsSchema.parse(JSON.parse(stored));
  assert.deepEqual(migrated.materials[0], {
    ...material,
    brand: "",
    code: "",
    board: "standard",
  });
  const publicSnapshot = publicMaterials(JSON.parse(stored) as Settings);
  assert.deepEqual(publicSnapshot, [
    {
      id: material.id,
      name: material.name,
      color: material.color,
      active: true,
      brand: "",
      code: "",
      board: "standard",
    },
  ]);
  assert.ok(!("price" in publicSnapshot[0]));
  assert.equal(
    JSON.stringify(legacy),
    stored,
    "Projection must not rewrite stored snapshot data.",
  );
  assert.equal(materialDisplayName(migrated.materials[0]), material.name);
});

test("standard and RH variants retain distinct costs, identities and cut-list labels", () => {
  const settings = settingsSchema.parse(defaultSettings);
  const standard = settings.materials.find(
    (material) => material.id === "vesto-blanco",
  )!;
  const rh = settings.materials.find(
    (material) => material.id === "vesto-blanco-rh",
  )!;
  standard.price = 90;
  rh.price = 145;
  rh.code = "RH-18-B";
  const product = seedProducts[0];
  const standardResult = buildFurniture(
    product,
    { ...product.defaults, finish: standard.id },
    settings,
  );
  const rhResult = buildFurniture(
    product,
    { ...product.defaults, finish: rh.id },
    settings,
  );
  approximate(standardResult.breakdown.materials, standardResult.area * 90);
  approximate(rhResult.breakdown.materials, rhResult.area * 145);
  assert.ok(rhResult.price > standardResult.price);
  assert.ok(
    rhResult.panels.every(
      (panel) =>
        panel.thickness === 18 &&
        panel.material === rh.id &&
        panel.materialName === "Vesto · Blanco [RH-18-B] · RH",
    ),
  );
  assert.ok(cutCSV(rhResult).includes("Vesto · Blanco [RH-18-B] · RH"));
  assert.ok(
    standardResult.panels.every((panel) => !panel.materialName.includes("RH")),
  );
  assert.equal(standardResult.area, rhResult.area);
  const safe = publicMaterials(settings);
  assert.ok(safe.every((material) => !Object.hasOwn(material, "price")));
  assert.deepEqual(
    safe.find((material) => material.id === rh.id),
    {
      id: rh.id,
      brand: "Vesto",
      name: "Blanco",
      color: rh.color,
      code: "RH-18-B",
      board: "rh",
      active: true,
      ...(rh.swatch !== undefined ? { swatch: rh.swatch } : {}),
      ...(rh.sourceUrl !== undefined ? { sourceUrl: rh.sourceUrl } : {}),
      ...(rh.texture !== undefined ? { texture: rh.texture } : {}),
      ...(rh.renderTexture !== undefined
        ? { renderTexture: rh.renderTexture }
        : {}),
    },
  );
  rh.active = false;
  assert.ok(
    !publicMaterials(settings).some((material) => material.id === rh.id),
  );
  assert.throws(
    () =>
      buildFurniture(product, { ...product.defaults, finish: rh.id }, settings),
    /no está disponible/,
  );
  assert.doesNotThrow(() =>
    buildFurniture(
      product,
      { ...product.defaults, finish: standard.id },
      settings,
    ),
  );
});

test("commercial presets are independent editable materials with strictly validated metadata", () => {
  assert.ok(
    commercialMaterials.length > 23 && commercialMaterials.length <= 100,
  );
  assert.ok(
    defaultSettings.materials.filter((material) => material.brand === "Hispano")
      .length > 8,
  );
  assert.ok(
    defaultSettings.materials
      .slice(0, 8)
      .every((material) => material.brand === "Hispano"),
  );
  assert.equal(
    new Set(commercialMaterials.map((material) => material.id)).size,
    commercialMaterials.length,
  );
  assert.notEqual(defaultSettings.materials[0], commercialMaterials[0]);
  assert.ok(
    !commercialMaterials.some(
      (material) => material.brand === "Hispano" && material.board === "rh",
    ),
    "No verified Hispano finish/RH pairing is seeded.",
  );
  for (const material of commercialMaterials) {
    assert.doesNotThrow(() => materialSchema.parse(material));
    assert.ok(
      material.sourceUrl,
      "Each commercial reference links to its manufacturer.",
    );
    assert.ok(
      material.swatch,
      "Each commercial reference includes the manufacturer's sample.",
    );
    assert.ok(
      existsSync(new URL("../public" + material.swatch, import.meta.url)),
      "The sample must ship with the site.",
    );
  }
  for (const board of ["hydro", "waterproof", "RH", "other"])
    assert.throws(() =>
      materialSchema.parse({ ...commercialMaterials[0], board }),
    );
  assert.throws(() =>
    materialSchema.parse({ ...commercialMaterials[0], brand: "x".repeat(61) }),
  );
  assert.throws(() =>
    materialSchema.parse({ ...commercialMaterials[0], code: "x".repeat(61) }),
  );
  assert.throws(() =>
    materialSchema.parse({ ...commercialMaterials[0], thickness: 16 }),
  );
});

test("manufacturer metadata cannot load remote tracking images or point to untrusted sites", () => {
  const sample = commercialMaterials[0];
  for (const swatch of [
    "https://example.com/image.jpg",
    "//example.com/image.jpg",
    "/images/materials/../secret.png",
    "/images/materials/sample.svg",
  ])
    assert.equal(
      materialSchema.safeParse({ ...sample, swatch }).success,
      false,
    );
  for (const sourceUrl of [
    "javascript:alert(1)",
    "https://pelikano.com.evil.test/x",
    "https://secret@pelikano.com/x",
    "http://pelikano.com/x",
  ])
    assert.equal(
      materialSchema.safeParse({ ...sample, sourceUrl }).success,
      false,
    );
  const published = publicMaterials({
    ...defaultSettings,
    materials: [{ ...sample, active: true, price: 175 }],
  });
  assert.equal(published[0].swatch, sample.swatch);
  assert.equal(published[0].sourceUrl, sample.sourceUrl);
  assert.equal("price" in published[0], false);
});

test("catalog enrichment preserves workshop edits, explicit removals and hidden references", () => {
  const preset = {
    ...commercialMaterials[0],
    swatch: "/images/materials/sample.jpg",
    sourceUrl: "https://tableroshispanos.es/productos/blanco-100/",
    texture: "Unicolor",
  };
  const { swatch, sourceUrl, texture, ...legacy } = preset;
  const current = { ...legacy, active: false, price: 143, color: "#123456" };
  const frozen = JSON.stringify(current);
  const merged = mergeCommercialMaterials([current], [preset]);
  assert.deepEqual(merged[0], { ...current, swatch, sourceUrl, texture });
  assert.equal(JSON.stringify(current), frozen);
  assert.deepEqual(mergeCommercialMaterials(merged, [preset]), merged);
  const explicit = { ...current, swatch: "", sourceUrl: "", texture: "" };
  assert.deepEqual(mergeCommercialMaterials([explicit], [preset])[0], explicit);
  const renamed = { ...current, name: "Muestra propia del taller" };
  assert.deepEqual(mergeCommercialMaterials([renamed], [preset])[0], renamed);
  assert.equal(mergeCommercialMaterials([], [preset])[0].active, false);
  assert.equal(mergeCommercialMaterials([], [preset], true)[0].active, true);
});

test("price recomputes from panels and selected services; hinges follow door height, not cabinet height", () => {
  const product = seedProducts[0],
    config = { ...product.defaults, install: true, transport: true };
  const result = buildFurniture(product, config);
  const costs = result.breakdown;
  assert.equal(
    result.price,
    Math.ceil(
      ((costs.materials + costs.edges + costs.hardware + costs.labor) /
        (1 - defaultSettings.margin) +
        120 +
        80) /
        10,
    ) * 10,
  );
  assert.equal(
    result.accessories.find((accessory) =>
      accessory.name.startsWith("Bisagras"),
    )!.quantity,
    6,
  );
  const full = buildFurniture(product, { ...config, doors: "full" });
  assert.equal(
    full.accessories.find((accessory) => accessory.name.startsWith("Bisagras"))!
      .quantity,
    9,
  );
  assert.equal(
    result.accessories.find(
      (accessory) => accessory.name === "Soportes de repisa",
    )!.quantity,
    36,
  );
});

test("catalog CSV roundtrips commas/semicolons, quotes and newlines and always imports drafts", () => {
  const product = {
    ...seedProducts[0],
    description: 'Modelo con "dos" tonos; azul, arena.\nSegunda línea.',
  };
  for (const delimiter of [";", ","] as const) {
    const imported = importCatalogCSV(
      exportCatalogCSV([product, seedProducts[1]], delimiter),
    );
    assert.deepEqual(imported.errors, []);
    assert.deepEqual(imported.products, [
      { ...product, active: false },
      { ...seedProducts[1], active: false },
    ]);
  }
  assert.equal(importCatalogCSV(catalogCSVTemplate()).products.length, 1);
});

test("CSV handles minimal rows, defaults and multiline row errors without swallowing good rows", () => {
  const text =
    'Código,Nombre,Descripción\r\n"uno","Primero","Tiene, una ""cita""\r\ny dos líneas."\r\n"mal","Segundo","texto válido","extra"\r\n"dos","Tercero","Modelo listo"\r\n';
  const imported = importCatalogCSV(text);
  assert.deepEqual(
    imported.products.map((product) => product.id),
    ["uno", "dos"],
  );
  assert.equal(
    imported.products[0].description,
    'Tiene, una "cita"\ny dos líneas.',
  );
  assert.deepEqual(
    imported.errors.map((error) => error.row),
    [4],
  );
  assert.equal(
    imported.products[1].defaults.width,
    seedProducts[0].defaults.width,
  );
});

test("CSV rejects malformed quotes, invalid manufacturing rows, duplicate headers and duplicate IDs", () => {
  assert.ok(
    importCatalogCSV(
      'Código;Nombre\nuno;"Sin cerrar',
    ).errors[0].message.includes("comillas"),
  );
  assert.ok(
    importCatalogCSV('Código;Nombre\nuno;"Cerrado"texto').errors.length,
  );
  assert.ok(
    importCatalogCSV("Código;Nombre;Nombre\nuno;Modelo;Modelo").errors.length,
  );
  assert.ok(
    importCatalogCSV("Código;Nombre;Desconocido\nuno;Modelo;otro").errors
      .length,
  );
  assert.deepEqual(
    importCatalogCSV("Código;Nombre;Ancho mm\nuno;Modelo;1805").products,
    [],
  );
  const duplicate = importCatalogCSV(
    "Código;Nombre\nuno;Modelo uno\nuno;Modelo repetido",
  );
  assert.equal(duplicate.products.length, 1);
  assert.equal(duplicate.errors[0].row, 3);
  assert.equal(importCatalogCSV("").errors[0].row, 1);
  assert.ok(importCatalogCSV("Código;Nombre\n").errors.length);
});

test("CSV numbers accept quoted decimal comma and references can validate custom materials", () => {
  const imported = importCatalogCSV(
    'Código,Nombre,Precio base S/\nuno,Modelo,"180,50"',
  );
  assert.equal(imported.products[0].basePrice, 180.5);
  assert.ok(
    importCatalogCSV(
      "Código;Nombre;Color exterior\nuno;Modelo;nuevo",
      defaultSettings,
    ).errors[0].message.includes("no está disponible"),
  );
});

test("CSV omitted finishes and downloadable templates adapt to legacy-only catalogs", () => {
  const { materials: _materials, ...beforeMaterialCatalog } = defaultSettings;
  const legacy = settingsSchema.parse(beforeMaterialCatalog);
  legacy.materials[0].active = false;
  const original = JSON.stringify(legacy);
  const minimal = importCatalogCSV(
    "Código;Nombre;Categoría\nuno;Modelo uno;Estanterías\ndos;Modelo dos;Libreros\ntres;Modelo tres;Aparadores\ncuatro;Modelo cuatro;Muebles de TV",
    legacy,
  );
  assert.deepEqual(minimal.errors, []);
  assert.equal(minimal.products.length, 4);
  assert.ok(
    minimal.products.every((product) => product.defaults.finish === "arcilla"),
  );
  const blank = importCatalogCSV(
    "Código;Nombre;Color exterior\nuno;Modelo uno;",
    legacy,
  );
  assert.deepEqual(blank.errors, []);
  assert.equal(blank.products[0].defaults.finish, "arcilla");
  const template = importCatalogCSV(catalogCSVTemplate(legacy), legacy);
  assert.deepEqual(template.errors, []);
  assert.equal(template.products[0].defaults.finish, "arcilla");
  assert.equal(
    JSON.stringify(legacy),
    original,
    "Generating templates must not change the saved catalog.",
  );
  const currentTemplate = importCatalogCSV(
    catalogCSVTemplate(defaultSettings),
    defaultSettings,
  );
  assert.deepEqual(currentTemplate.errors, []);
  assert.equal(
    currentTemplate.products[0].defaults.finish,
    seedProducts[0].defaults.finish,
  );
});

test("CSV explicit unavailable finishes stay errors instead of silently substituting a color", () => {
  const settings = settingsSchema.parse({
    ...defaultSettings,
    materials: [
      { ...defaultSettings.materials[0], id: "custom-active", active: true },
      { ...defaultSettings.materials[1], id: "custom-hidden", active: false },
    ],
  });
  for (const finish of [
    "custom-hidden",
    "missing",
    seedProducts[0].defaults.finish,
  ]) {
    const imported = importCatalogCSV(
      `Código;Nombre;Color exterior\nuno;Modelo uno;${finish}`,
      settings,
    );
    assert.equal(imported.products.length, 0);
    assert.equal(imported.errors.length, 1);
    assert.match(imported.errors[0].message, /no está disponible/);
  }
  const explicit = importCatalogCSV(
    "Código;Nombre;Color exterior\nuno;Modelo uno;custom-active",
    settings,
  );
  assert.deepEqual(explicit.errors, []);
  assert.equal(explicit.products[0].defaults.finish, "custom-active");
  const template = importCatalogCSV(catalogCSVTemplate(settings), settings);
  assert.deepEqual(template.errors, []);
  assert.equal(template.products[0].defaults.finish, "custom-active");
});

test("catalog and cut exports neutralize spreadsheet formulas including leading whitespace", () => {
  for (const text of [
    "=1+2",
    "+SUM(A1)",
    "-1+2",
    "@SUM(A1)",
    " \t=1",
    "\r=1",
    "\n=1",
  ])
    assert.ok(quoteCSVCell(text).startsWith("\"'"));
  const product = {
    ...seedProducts[0],
    name: '=HYPERLINK("https://example.com")',
    description: "+SUM(1,2)",
  };
  const exported = exportCatalogCSV([product]);
  assert.ok(exported.includes("\"'=HYPERLINK("));
  assert.ok(exported.includes('"\'+SUM(1,2)"'));
  const result = buildFurniture(seedProducts[0], seedProducts[0].defaults);
  const modified: Panel = { ...result.panels[0], materialName: "@IMPORTXML()" };
  assert.ok(
    cutCSV({ ...result, panels: [modified] }).includes('"\'@IMPORTXML()"'),
  );
});
