import assert from "node:assert/strict";
import test from "node:test";
import { COLLECTION_PAGE_SIZE, filterShowroomProducts, normalizeShowroomText, resolveConfiguratorStart, resolveShowroomCategory, resolveShowroomFinish, showroomCategories, showroomPage, showroomProductHref } from "../lib/showroom.ts";
import { productTemplate } from "../lib/product-templates.ts";

const catalogue = [
  { id: "qa-a", name: "Alacena de prueba", category: "Cocina", description: "Puertas y repisas sintéticas", active: true },
  { id: "qa-b", name: "Módulo de prueba", category: "Cocina", description: "Espacio inferior", active: true },
  { id: "qa-c", name: "Librero sintético", category: "Oficina", description: "Repisas abiertas", active: true },
  { id: "qa-hidden", name: "Alacena oculta", category: "Archivo", description: "Nunca publicada", active: false },
];

test("category links resolve exactly after accent, whitespace and case normalization", () => {
  const original = structuredClone(catalogue), categories = showroomCategories(catalogue);
  assert.deepEqual(categories, ["Cocina", "Oficina"]);
  assert.equal(resolveShowroomCategory("  CÓCINA  ", categories), "Cocina");
  for (const request of ["coc", "cocina grande", "Archivo", "", "sala"]) assert.equal(resolveShowroomCategory(request, categories), undefined);
  assert.equal(normalizeShowroomText("  Módulo \n  ABIERTO  "), "modulo abierto");
  assert.deepEqual(catalogue, original);
});

test("search spans public name, category and description while retaining API order and excluding hidden models", () => {
  assert.deepEqual(filterShowroomProducts(catalogue, "", "REPiSAS").map(product => product.id), ["qa-a", "qa-c"]);
  assert.deepEqual(filterShowroomProducts(catalogue, "CÓCINA", "repisas puertas").map(product => product.id), ["qa-a"]);
  assert.deepEqual(filterShowroomProducts(catalogue, "Oficina", "cocina"), []);
  assert.deepEqual(filterShowroomProducts(catalogue, "Archivo", ""), []);
  assert.deepEqual(filterShowroomProducts(catalogue, "", ""), catalogue.slice(0, 3));
});

test("only an active finish can be carried into the model page and query values remain encoded", () => {
  const materials = [{ id: "qa-active", active: true }, { id: "qa-hidden", active: false }];
  const active = resolveShowroomFinish("qa-active", materials);
  assert.equal(active?.id, "qa-active");
  assert.equal(resolveShowroomFinish("qa-hidden", materials), undefined);
  assert.equal(resolveShowroomFinish("QA-ACTIVE", materials), undefined);
  const href = showroomProductHref("qa-a", active?.id);
  assert.equal(href, "/mueble?producto=qa-a&acabado=qa-active");
  assert.equal(showroomProductHref("qa-a", resolveShowroomFinish("qa-hidden", materials)?.id), "/mueble?producto=qa-a");
  const escaped = new URL(showroomProductHref("qa&producto=other", "qa finish"), "https://example.test");
  assert.equal(escaped.pathname, "/mueble"); assert.equal(escaped.searchParams.get("producto"), "qa&producto=other"); assert.equal(escaped.searchParams.get("acabado"), "qa finish");
});

test("progressive presentation initially mounts twelve models and retains exact counts through the last page", () => {
  const products = Array.from({ length: 256 }, (_, index) => ({ id: `synthetic-${index}` }));
  const original = structuredClone(products);
  const first = showroomPage(products), next = showroomPage(products, COLLECTION_PAGE_SIZE * 2), last = showroomPage(products, 264);
  assert.equal(first.items.length, 12); assert.equal(first.remaining, 244);
  assert.equal(next.items.length, 24); assert.equal(next.remaining, 232);
  assert.equal(next.items[12].id, "synthetic-12");
  assert.equal(last.items.length, 256); assert.equal(last.remaining, 0);
  assert.deepEqual(showroomPage([], 12), { items: [], remaining: 0 });
  assert.equal(showroomPage(products, NaN).items.length, 12);
  assert.deepEqual(products, original);
});

test("a direct configurator URL never silently opens a different or hidden model", () => {
  const template = productTemplate("cabinet");
  const hidden = { ...template, id: "qa-hidden", active: false };
  const first = { ...template, id: "qa-first", active: true };
  const second = { ...template, id: "qa-second", active: true };
  const products = [hidden, first, second];
  assert.equal(resolveConfiguratorStart(products, null, null, [])?.product.id, "qa-first", "only an absent product query selects the first published model");
  assert.equal(resolveConfiguratorStart(products, "qa-second", null, [])?.product.id, "qa-second");
  for (const id of ["", "qa-hidden", "missing", "QA-FIRST", "qa-first "])
    assert.equal(resolveConfiguratorStart(products, id, null, []), undefined, id);
  assert.equal(resolveConfiguratorStart([], null, null, []), undefined);
  assert.equal(resolveConfiguratorStart([hidden], null, null, []), undefined);
});

test("initial configuration applies only active finishes and invalidates the default preview when the finish changes", () => {
  const product = { ...productTemplate("cabinet"), id: "qa-first", active: true };
  const original = structuredClone(product);
  const materials = [{ id: product.defaults.finish, active: true }, { id: "qa-other", active: true }, { id: "qa-inactive", active: false }];
  const chosen = resolveConfiguratorStart([product], product.id, "qa-other", materials)!;
  assert.equal(chosen.config.finish, "qa-other"); assert.equal(chosen.usesCataloguePreview, false);
  assert.notStrictEqual(chosen.config, product.defaults);
  for (const finish of [null, product.defaults.finish, "qa-inactive", "missing"]) {
    const result = resolveConfiguratorStart([product], product.id, finish, materials)!;
    assert.equal(result.config.finish, product.defaults.finish); assert.equal(result.usesCataloguePreview, true);
  }
  chosen.config.width = 990;
  assert.deepEqual(product, original, "resolving a URL never changes the catalogue defaults");
});
