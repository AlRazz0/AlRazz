import test from "node:test";
import assert from "node:assert/strict";
import { exportCatalogCSV, importCatalogCSV } from "../lib/catalog-csv.ts";
import { constructionTemplates, productTemplate } from "../lib/product-templates.ts";
import { buildFurniture, defaultSettings, seedProducts } from "../lib/furniture.ts";

test("construction templates roundtrip through CSV without changing geometry or legacy omissions", () => {
  const examples = [
    ...seedProducts.map((p) => ({ ...p, active: false })),
    ...constructionTemplates,
    { ...productTemplate("desk-storage"), id: "right-pedestal", construction: { kind: "desk-storage" as const, storageSide: "right" as const, storageWidth: 500 } },
    { ...productTemplate("desk-storage"), id: "implicit-pedestal", construction: { kind: "desk-storage" as const } },
  ];
  for (const separator of [";", ","] as const) {
    const imported = importCatalogCSV(exportCatalogCSV(examples, separator), defaultSettings);
    assert.deepEqual(imported.errors, []);
    assert.deepEqual(imported.products, examples);
    for (const [index, product] of imported.products.entries())
      assert.deepEqual(buildFurniture(product, product.defaults), buildFurniture(examples[index], examples[index].defaults));
  }
});

test("a minimal typed CSV uses a viable starting point and accepts new categories", () => {
  for (const kind of ["desk", "desk-storage", "open-shelf"] as const) {
    const input = `Código;Nombre;Categoría;Tipo constructivo\nmodelo-${kind};Modelo ${kind};${kind === "open-shelf" ? "Zapateras" : "Escritorios"};${kind}`;
    const parsed = importCatalogCSV(input, defaultSettings);
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.products[0].construction?.kind, kind);
    assert.equal(parsed.products[0].active, false);
    assert.ok(buildFurniture(parsed.products[0], parsed.products[0].defaults).panels.length > 0);
  }
});

test("invalid construction and misplaced pedestal options cannot silently fall back to a cabinet", () => {
  const header = "Código;Nombre;Tipo constructivo;Lado del módulo lateral;Ancho del módulo lateral mm\n";
  for (const row of [
    "bad-type;Modelo inválido;arbitrary;;",
    "bad-side;Modelo inválido;desk-storage;middle;450",
    "bad-size;Modelo inválido;desk-storage;left;455",
    "bad-extra;Modelo inválido;cabinet;left;450",
    "bad-empty;Modelo inválido;;left;450",
    "bad-number;Modelo inválido;desk-storage;left;=100+350",
  ]) {
    const parsed = importCatalogCSV(header + row, defaultSettings);
    assert.equal(parsed.products.length, 0);
    assert.equal(parsed.errors.length, 1);
    assert.equal(parsed.errors[0].row, 2);
  }
});

test("editor templates do not mutate seed products or other starting points", () => {
  const original = structuredClone(seedProducts);
  const first = productTemplate("desk-storage");
  first.defaults.width = 1070;
  first.limits.width.max = 1100;
  assert.equal(productTemplate("desk-storage").defaults.width, 1400);
  assert.equal(productTemplate("desk-storage").limits.width.max, 1460);
  assert.deepEqual(seedProducts, original);
});
