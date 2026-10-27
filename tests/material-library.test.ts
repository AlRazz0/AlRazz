import assert from "node:assert/strict";
import test from "node:test";
import type { PublicMaterial } from "../lib/furniture.ts";
import { filterMaterialLibrary, materialCollectionHref, materialLibraryOptions, materialPresentationSamples } from "../lib/material-library.ts";

const sample = (id: string, changes: Partial<PublicMaterial> = {}): PublicMaterial => ({ id, name: `Acabado sintético ${id}`, color: "#bba889", active: true, brand: "Marca de prueba", code: "", board: "standard", ...changes });
const materials = [sample("qa-a", { name: "Roble de prueba", brand: "Marca A", code: "A-10", texture: "Veta vertical" }), sample("qa-b", { name: "Gris sintético", brand: "Marca B", board: "rh" }), sample("qa-c", { brand: "", board: "rh" }), sample("qa-hidden", { active: false, brand: "Marca oculta" })];

test("library filters are derived only from active brands and board kinds, including an unnamed brand", () => {
  const before = structuredClone(materials), options = materialLibraryOptions(materials);
  assert.deepEqual(options.brands, ["", "Marca A", "Marca B"]);
  assert.deepEqual(options.boards, ["rh", "standard"]);
  assert.deepEqual(materials, before);
});

test("finish search combines name, code and real texture while exact brand and board filters stay independent", () => {
  assert.deepEqual(filterMaterialLibrary(materials, { search: "RÓBLE  a-10 vertical" }).map(material => material.id), ["qa-a"]);
  assert.deepEqual(filterMaterialLibrary(materials, { search: "", brand: "marca a" }).map(material => material.id), ["qa-a"]);
  assert.deepEqual(filterMaterialLibrary(materials, { search: "", brand: "Marca" }), []);
  assert.deepEqual(filterMaterialLibrary(materials, { search: "", brand: "" }).map(material => material.id), ["qa-c"]);
  assert.deepEqual(filterMaterialLibrary(materials, { search: "", board: "rh" }).map(material => material.id), ["qa-b", "qa-c"]);
  assert.deepEqual(filterMaterialLibrary(materials, { search: "gris", board: "standard" }), []);
  assert.equal(filterMaterialLibrary(materials, { search: "" }).length, 3);
});

test("selected sample stays in front for small catalogues and for a finish outside the initial shortlist", () => {
  for (const count of [1, 2, 3, 12]) {
    const all = Array.from({ length: count }, (_, index) => sample(`qa-${index}`));
    const before = structuredClone(all), result = materialPresentationSamples(all, all.at(-1)!.id, 4);
    assert.equal(result[0].id, all.at(-1)!.id);
    assert.equal(result.length, Math.min(count, 4));
    assert.equal(new Set(result.map(material => material.id)).size, result.length);
    assert.deepEqual(all, before);
  }
  assert.equal(materialPresentationSamples(materials, "qa-hidden", 4)[0].id, "qa-a");
  assert.deepEqual(materialPresentationSamples([], "missing", 4), []);
  assert.deepEqual(materialPresentationSamples(materials, "qa-a", 0), []);
});

test("collection continuation carries only an active finish id and never a price or private material data", () => {
  assert.equal(materialCollectionHref(materials[0]), "/coleccion?acabado=qa-a");
  assert.equal(materialCollectionHref(materials[3]), undefined);
  const url = new URL(materialCollectionHref(sample("qa&otro=valor"))!, "https://example.test");
  assert.equal(url.pathname, "/coleccion");
  assert.deepEqual([...url.searchParams.keys()], ["acabado"]);
  assert.equal(url.searchParams.get("acabado"), "qa&otro=valor");
});
