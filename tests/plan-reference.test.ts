import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultSettings, buildFurniture } from "../lib/furniture.ts";
import { productTemplate } from "../lib/product-templates.ts";
import { createPlanDraft, MAX_PLAN_BYTES, parsePlanReference, planExample, referenceImageType, reviewPlanDimensions } from "../src/plan-reference.ts";

test("a SketchUp interchange document preserves numeric envelopes and accepts BOM", () => {
  const input = { ...planExample, source: "sketchup", components: [
    { name: "Librero del estudio", width: 1199.75, height: 1798.4, depth: 399.8 },
    { name: "Alacena", width: 800, height: 700, depth: 350, thickness: 18 },
  ] };
  const parsed = parsePlanReference("\uFEFF" + JSON.stringify(input));
  assert.equal(parsed.source, "sketchup");
  assert.equal(parsed.components.length, 2);
  assert.equal(parsed.components[0].width, 1199.75);
  assert.equal(parsed.components[1].thickness, 18);
  assert.deepEqual(reviewPlanDimensions(parsed.components[0]), { width: 1200, height: 1800, depth: 400 });
  assert.equal(parsed.components[0].width, 1199.75, "the original measurement remains available for the review notice");
});

test("interchange rejects executable values, foreign fields, unit ambiguity and incompatible thickness", () => {
  const invalid = [
    { ...planExample, units: "cm" },
    { ...planExample, thickness: 16 },
    { ...planExample, eval: "globalThis.pwned=true" },
    { ...planExample, components: [{ ...planExample.components[0], width: "1200+100" }] },
    { ...planExample, components: [{ ...planExample.components[0], width: null }] },
    { ...planExample, components: [{ ...planExample.components[0], thickness: 15 }] },
    { ...planExample, components: [{ ...planExample.components[0], price: 1 }] },
    { ...planExample, components: [{ ...planExample.components[0], geometry: [] }] },
    { ...planExample, components: [{ ...planExample.components[0], width: -1200 }] },
    { ...planExample, components: [] },
  ];
  for (const document of invalid) assert.throws(() => parsePlanReference(JSON.stringify(document)), /formato de medidas/);
  assert.throws(() => parsePlanReference('{"format":"alrazz-plan-v1","units":"mm","source":"manual","components":[],"__proto__":{"polluted":true}}'));
  assert.throws(() => parsePlanReference('(()=>({width:1200}))()'), /JSON/);
  assert.throws(() => parsePlanReference('{"width": Infinity}'), /JSON/);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("file and component limits are enforced before creating a draft", () => {
  assert.throws(() => parsePlanReference(" ".repeat(MAX_PLAN_BYTES + 1)), /supera 1 MB/);
  assert.throws(() => parsePlanReference("é".repeat(MAX_PLAN_BYTES / 2 + 1)), /supera 1 MB/);
  assert.throws(() => parsePlanReference(JSON.stringify({ ...planExample, components: Array.from({ length: 101 }, () => planExample.components[0]) })), /formato/);
  assert.throws(() => reviewPlanDimensions({ width: 9000, height: 1800, depth: 400 }), /muebles independientes/);
  assert.throws(() => reviewPlanDimensions({ width: NaN, height: 1800, depth: 400 }), /muebles independientes/);
});

test("plan creation uses the shared engine, keeps existing records and starts hidden without a public price", () => {
  const products = [productTemplate("cabinet")];
  products[0].id = "estante-del-estudio";
  const before = structuredClone({ products, settings: defaultSettings });
  const draft = createPlanDraft({ name: "Estante del estudio", kind: "cabinet", width: 1200, height: 1800, depth: 400, modules: 3, shelves: 3 }, products, defaultSettings);
  assert.equal(draft.id, "estante-del-estudio-2");
  assert.equal(draft.active, false);
  assert.equal(draft.showPrice, false);
  assert.equal(draft.defaults.width, 1200);
  assert.equal(draft.defaults.height, 1800);
  const result = buildFurniture(draft, draft.defaults, defaultSettings);
  assert.ok(result.panels.length > 0);
  assert.ok(result.panels.every(panel => panel.thickness === 18));
  assert.deepEqual({ products, settings: defaultSettings }, before);
});

test("drafts cannot bypass unsupported spans, construction constraints or explicit measure review", () => {
  const input = { name: "Modelo de prueba", kind: "cabinet" as const, width: 1200, height: 1800, depth: 400, modules: 3, shelves: 3 };
  assert.throws(() => createPlanDraft({ ...input, width: 1201 }, [], defaultSettings), /pasos de 10/);
  assert.throws(() => createPlanDraft({ ...input, width: 2000, modules: 1 }, [], defaultSettings), /750 mm/);
  assert.throws(() => createPlanDraft({ ...input, kind: "desk", modules: 1, shelves: 0 }, [], defaultSettings), /700 a 850 mm/);
  const unavailable = structuredClone(defaultSettings);
  unavailable.materials = unavailable.materials.map(material => ({ ...material, active: false }));
  assert.throws(() => createPlanDraft(input, [], unavailable));
});

test("reference images require raster signatures, never SVG or executable markup", () => {
  assert.equal(referenceImageType(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])), "image/png");
  assert.equal(referenceImageType(Uint8Array.from([255, 216, 255, 224])), "image/jpeg");
  assert.equal(referenceImageType(new TextEncoder().encode("RIFF0000WEBP")), "image/webp");
  for (const value of ["<svg onload='alert(1)'>", "<html>", "%PDF-1.7", "PK00"]) assert.equal(referenceImageType(new TextEncoder().encode(value)), null);
  assert.equal(referenceImageType(new Uint8Array()), null);
});
