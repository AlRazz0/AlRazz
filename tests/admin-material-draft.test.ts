import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultSettings, materialSchema } from "../lib/furniture.ts";
import { applyMaterialDraft, newMaterialDraft } from "../src/admin-material-draft.ts";

test("new finishes receive unique identifiers even after other finishes are removed", () => {
  const existing = [
    { ...defaultSettings.materials[0], id: "acabado-roble-claro" },
    { ...defaultSettings.materials[0], id: "acabado-roble-claro-3" },
  ];
  const draft = { ...newMaterialDraft(), name: "Róble claro" };
  const result = applyMaterialDraft(existing, draft, null);
  assert.equal(result.material.id, "acabado-roble-claro-2");
  assert.equal(result.materials[0], result.material);
  assert.equal(result.material.active, false);
  assert.equal(existing.length, 2);
  assert.equal(draft.id, "acabado-nuevo");
  materialSchema.parse(result.material);
});

test("editing a finish preserves its permanent identifier and unrelated finishes", () => {
  const existing = structuredClone(defaultSettings.materials);
  const before = structuredClone(existing);
  const target = existing[0];
  const result = applyMaterialDraft(existing, { ...target, id: "changed-id", name: "Roble RH", price: 125, board: "rh" }, target.id);
  assert.equal(result.material.id, target.id);
  assert.equal(result.material.name, "Roble RH");
  assert.equal(result.material.price, 125);
  assert.deepEqual(result.materials.slice(1), existing.slice(1));
  assert.deepEqual(existing, before);
});

test("an invalid finish or stale edit cannot replace the catalog", () => {
  const materials = structuredClone(defaultSettings.materials);
  assert.throws(() => applyMaterialDraft(materials, newMaterialDraft(), null));
  assert.throws(() => applyMaterialDraft(materials, { ...materials[0], price: Number.NaN }, materials[0].id));
  assert.throws(() => applyMaterialDraft(materials, { ...materials[0], sourceUrl: "https://unofficial.example.test" }, null));
  assert.throws(() => applyMaterialDraft(materials, materials[0], "missing-finish"), /cambió/);
  const full = Array.from({ length: 100 }, (_, index) => ({ ...materials[0], id: `finish-${index}` }));
  assert.throws(() => applyMaterialDraft(full, { ...newMaterialDraft(), name: "Roble" }, null), /100/);
  assert.equal(applyMaterialDraft(full, { ...full[0], name: "Roble" }, full[0].id).materials.length, 100);
});

test("standard and RH variants can share a commercial name without sharing identity or price", () => {
  const standard = { ...newMaterialDraft(), name: "Roble natural", active: true, price: 100 };
  const first = applyMaterialDraft([], standard, null);
  const second = applyMaterialDraft(first.materials, { ...standard, board: "rh", price: 130 }, null);
  assert.notEqual(second.material.id, first.material.id);
  assert.equal(second.material.board, "rh");
  assert.equal(second.material.price, 130);
  assert.equal(second.materials.find(material => material.id === first.material.id)?.price, 100);
});
