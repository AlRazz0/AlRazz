import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultSettings, productSchema, type Product } from "../lib/furniture.ts";
import { constructionTemplates, productTemplate } from "../lib/product-templates.ts";
import { buildAdminPreview } from "../src/admin-product-preview.ts";
import {
  changeDraftConstruction,
  createCatalogDraft,
  duplicateCatalogDraft,
  getEditorIssue,
  uniqueProductId,
} from "../src/admin-catalog-draft.ts";

test("suggested identifiers normalize accented names and remain valid for empty or non-Latin names", () => {
  assert.equal(uniqueProductId("  Rópero Ñandú / Ébano 18  ", []), "ropero-nandu-ebano-18");
  assert.equal(uniqueProductId("Ｃｏｃｉｎａ", []), "cocina");
  assert.equal(uniqueProductId("Rópero", ["ropero", "ropero-2"]), "ropero-3");
  for (const name of ["", "   ", "🪑", "柜子", "a", "-", "\u0301"]) {
    const suggestion = uniqueProductId(name, ["mueble"]);
    assert.equal(suggestion, "mueble-2");
    assert.match(suggestion, /^[a-z0-9][a-z0-9-]{1,59}$/);
  }
});

test("long-name collisions reserve room for the entire numeric suffix", () => {
  const name = "mueble".repeat(30);
  const generated: string[] = [];
  for (let index = 0; index < 115; index++) {
    const suggestion = uniqueProductId(name, generated);
    assert.match(suggestion, /^[a-z0-9][a-z0-9-]{1,59}$/);
    assert.equal(generated.includes(suggestion), false);
    generated.push(suggestion);
  }
  assert.equal(generated[114].endsWith("-115"), true);
  assert.equal(generated[114].length, 60);
  assert.equal(uniqueProductId(`${"a".repeat(59)} --- extra`, []), "a".repeat(59));
});

test("each starting template becomes a named, inactive and independently editable draft", () => {
  const settingsBefore = structuredClone(defaultSettings);
  for (const template of constructionTemplates) {
    const before = structuredClone(template);
    const existing = [{ ...template, order: 23 }];
    const draft = createCatalogDraft(template, existing, defaultSettings);
    assert.equal(draft.name, template.name);
    assert.equal(draft.active, false);
    assert.equal(draft.version, 1);
    assert.equal(draft.order, 24);
    assert.equal(getEditorIssue(draft, defaultSettings), null);
    productSchema.parse(draft);
    draft.defaults.width = 300;
    draft.limits.width.min = 100;
    assert.deepEqual(template, before);
    assert.equal(existing[0].defaults.width, before.defaults.width);
  }
  assert.deepEqual(defaultSettings, settingsBefore);
});

test("new drafts repair unavailable finishes only when an active replacement exists", () => {
  const template = productTemplate("cabinet");
  template.defaults.finish = "acabado-anterior";
  template.defaults.interior = "interior-anterior";
  const settings = structuredClone(defaultSettings);
  settings.materials = [{ ...settings.materials[0], id: "nuevo-acabado", active: true }];
  const draft = createCatalogDraft(template, [], settings);
  assert.equal(draft.defaults.finish, "nuevo-acabado");
  assert.equal(draft.defaults.interior, "same");
  assert.equal(getEditorIssue(draft, settings), null);

  settings.materials[0].active = false;
  const unavailable = createCatalogDraft(template, [], settings);
  assert.equal(unavailable.defaults.finish, template.defaults.finish);
  assert.equal(unavailable.defaults.interior, template.defaults.interior);
  assert.equal(getEditorIssue(unavailable, settings)?.section, "finishes");
});

test("duplication preserves edited commercial choices and legacy fields without sharing objects", () => {
  const original = productTemplate("kitchen-base");
  original.id = "a".repeat(60);
  original.name = "M".repeat(70);
  original.version = 14;
  original.active = true;
  original.order = 999;
  original.basePrice = 321;
  original.pricing = { basis: "linear-meter", amount: 812.5 };
  original.frontOptions = ["glass", "aluminum-glass"];
  original.defaults = { ...original.defaults, front: "glass", handle: "exterior", finish: "acabado-antiguo" };
  original.gallery = { enabled: false, scene: "dark", caption: "Conservar esta leyenda" };
  const before = structuredClone(original);
  const existing = [original];
  const first = duplicateCatalogDraft(original, existing, defaultSettings);
  const second = duplicateCatalogDraft(original, [...existing, first], defaultSettings);
  assert.notEqual(first.id, original.id);
  assert.notEqual(second.id, first.id);
  assert.match(first.id, /-copia$/);
  assert.match(second.id, /-2$/);
  assert.ok(first.id.length <= 60 && second.id.length <= 60);
  assert.equal(first.name.length, 70);
  assert.ok(first.name.endsWith(" · copia"));
  assert.equal(first.active, false);
  assert.equal(first.version, 1);
  assert.equal(first.order, 999);
  assert.deepEqual(
    { ...first, id: original.id, name: original.name, active: original.active, version: original.version, order: original.order },
    original,
  );
  assert.equal(getEditorIssue(first, defaultSettings)?.section, "finishes");
  first.defaults.finish = "nuevo";
  first.frontOptions!.push("melamine");
  first.gallery!.caption = "Otro texto";
  assert.deepEqual(original, before);

  const legacy = productTemplate("cabinet");
  delete legacy.construction;
  const copy = duplicateCatalogDraft(legacy, [], defaultSettings);
  for (const field of ["construction", "gallery", "frontOptions", "pricing"])
    assert.equal(Object.hasOwn(copy, field), Object.hasOwn(legacy, field));
});

test("construction changes reset geometry while preserving edited product and price data", () => {
  const original = productTemplate("cabinet");
  original.name = "Modelo de mi taller";
  original.pricing = { basis: "unit", amount: 945 };
  original.gallery = { caption: "Modelo propio", scene: "light" };
  original.defaults.interior = "same";
  original.defaults.install = true;
  original.defaults.transport = true;
  const before = structuredClone(original);
  const changed = changeDraftConstruction(original, "desk-storage");
  const template = productTemplate("desk-storage");
  for (const field of ["id", "name", "category", "active", "version", "order", "weeks", "description", "basePrice", "pricing", "gallery"] as const)
    assert.deepEqual(changed[field], original[field]);
  assert.deepEqual(changed.construction, template.construction);
  assert.deepEqual(changed.limits, template.limits);
  for (const field of ["width", "height", "depth", "modules", "shelves", "doors"] as const)
    assert.equal(changed.defaults[field], template.defaults[field]);
  for (const field of ["finish", "interior", "install", "transport", "handle"] as const)
    assert.equal(changed.defaults[field], original.defaults[field]);
  assert.equal(getEditorIssue(changed, defaultSettings), null);
  changed.limits.width.min = 100;
  assert.deepEqual(original, before);
  assert.equal(productTemplate("desk-storage").limits.width.min, template.limits.width.min);
});

test("switching from an open model selects an allowed glass front and its required handle", () => {
  const original = productTemplate("cabinet");
  original.frontOptions = ["aluminum-glass"];
  original.defaults.doors = "none";
  original.defaults.front = "melamine";
  original.defaults.handle = "push";
  const changed = changeDraftConstruction(original, "kitchen-base");
  assert.equal(changed.defaults.front, "aluminum-glass");
  assert.equal(changed.defaults.handle, "exterior");
  assert.deepEqual(changed.frontOptions, ["aluminum-glass"]);
  assert.equal(getEditorIssue(changed, defaultSettings), null);
  assert.ok(buildAdminPreview(changed, defaultSettings).geometry.some((panel) => panel.surface === "aluminum-glass"));

  for (const kind of ["desk", "open-shelf"] as const) {
    const open = changeDraftConstruction(changed, kind);
    assert.equal(open.defaults.doors, "none");
    assert.equal(open.defaults.front, "melamine");
    assert.deepEqual(open.frontOptions, ["melamine"]);
    assert.equal(getEditorIssue(open, defaultSettings), null);
  }
});

test("an oversized glass door stays visible as a manufacturing issue after a construction change", () => {
  const kitchen = productTemplate("kitchen-base");
  kitchen.frontOptions = ["glass", "melamine"];
  kitchen.defaults.front = "glass";
  kitchen.defaults.handle = "exterior";
  const wardrobe = changeDraftConstruction(kitchen, "wardrobe");
  assert.equal(wardrobe.defaults.height, 2100);
  assert.equal(wardrobe.defaults.front, "glass");
  const issue = getEditorIssue(wardrobe, defaultSettings);
  assert.equal(issue?.section, "dimensions");
  assert.match(issue!.message, /1500 mm/);
  assert.throws(() => buildAdminPreview(wardrobe, defaultSettings), /1500 mm/);
});

test("save guidance rejects unfinished metadata even when the 3D preview can render", () => {
  for (const patch of [{ name: "" }, { id: "" }, { id: "No válido" }, { description: "" }]) {
    const draft = { ...productTemplate("cabinet"), ...patch };
    assert.ok(buildAdminPreview(draft, defaultSettings).geometry.length);
    const before = structuredClone(draft);
    const issue = getEditorIssue(draft, defaultSettings);
    assert.equal(issue?.section, "general");
    assert.ok(issue?.message);
    assert.doesNotMatch(issue!.message, /Invalid|Required|Expected/);
    assert.deepEqual(draft, before);
  }
});

test("guidance directs schema, material, geometry and pricing errors to their editable sections", () => {
  const base = productTemplate("kitchen-base");
  const cases: { draft: Product; section: string; contains?: RegExp }[] = [
    { draft: { ...base, defaults: { ...base.defaults, width: Number.NaN } }, section: "dimensions", contains: /numérico/ },
    { draft: { ...base, limits: { ...base.limits, width: { min: 900, max: 400 } } }, section: "dimensions" },
    { draft: { ...base, defaults: { ...base.defaults, width: 1000 } }, section: "dimensions", contains: /división/ },
    { draft: { ...base, defaults: { ...base.defaults, finish: "no-existe" } }, section: "finishes", contains: /material/ },
    { draft: { ...base, defaults: { ...base.defaults, front: "glass" } }, section: "finishes", contains: /habilitado/ },
    { draft: { ...base, frontOptions: ["glass", "glass"] }, section: "finishes" },
    { draft: { ...base, gallery: { caption: "a".repeat(221) } }, section: "gallery" },
    { draft: { ...base, basePrice: -1 }, section: "publication" },
    { draft: { ...base, pricing: { basis: "linear-meter", amount: Number.NaN } }, section: "publication", contains: /numérico/ },
    { draft: { ...base, order: 1000 }, section: "publication" },
    { draft: { ...base, weeks: 0 }, section: "general" },
  ];
  for (const { draft, section, contains } of cases) {
    const issue = getEditorIssue(draft, defaultSettings);
    assert.equal(issue?.section, section, issue?.message);
    if (contains) assert.match(issue!.message, contains);
  }
});
