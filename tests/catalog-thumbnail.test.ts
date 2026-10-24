import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildFurniture, defaultSettings, publicMaterials, seedProducts } from "../lib/furniture.ts";
import { publicGeometry, type VisualPanel } from "../lib/public-geometry.ts";
import { buildCatalogThumbnail } from "../src/catalog-thumbnail.ts";

const board = (values: Partial<VisualPanel> = {}): VisualPanel => ({
  size: [600, 900, 18], position: [0, 450, 0], material: "sample", ...values,
});
const materials = [{ id: "sample", color: "#ba9161" }];

test("catalog projections preserve every supplied panel across existing constructions without mutating snapshots", () => {
  const silhouettes = new Set<string>();
  for (const product of seedProducts) {
    const built = buildFurniture(product, product.defaults, defaultSettings);
    const geometry = publicGeometry(built.panels, built.fixtures);
    const before = structuredClone(geometry);
    const preview = buildCatalogThumbnail(geometry, publicMaterials(defaultSettings), product.defaults.handle);
    assert.ok(preview, product.id);
    assert.deepEqual(geometry, before, "rendering must not change a design snapshot");
    assert.deepEqual([...new Set(preview.faces.map((face) => face.source))].sort((a, b) => a - b), geometry.map((_, i) => i));
    assert.equal(new Set(preview.faces.map((face) => face.key)).size, preview.faces.length);
    for (const face of preview.faces) for (const point of face.points) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), product.id);
      assert.ok(point.x >= 27.99 && point.x <= preview.width - 27.99, product.id);
      assert.ok(point.y >= 23.99 && point.y <= preview.height - 35.99, product.id);
    }
    silhouettes.add(JSON.stringify(preview.faces.map((face) => face.points)));
  }
  assert.equal(silhouettes.size, seedProducts.length, "distinct furniture must not collapse to a generic cabinet icon");
});

test("closed fronts occlude high shelves even when a shelf center is closer to the camera", () => {
  const shelf = board({ size: [580, 18, 400], position: [0, 1600, 0] });
  const door = board({ size: [600, 1800, 18], position: [0, 900, 220], door: true });
  const preview = buildCatalogThumbnail([shelf, door], materials)!;
  const doorFace = preview.faces.findIndex((face) => face.key === "1-front");
  assert.ok(doorFace >= 0);
  for (const name of ["0-front", "0-top"])
    assert.ok(preview.faces.findIndex((face) => face.key === name) < doorFace,
      `${name} must be painted behind the closed front`);
  assert.deepEqual(preview, buildCatalogThumbnail([shelf, door], materials), "ordering must remain deterministic");
});

test("rotated fronts and offset assemblies use actual positions rather than a generic module grid", () => {
  const geometry = [board({ size: [900, 350, 18], rotationY: Math.PI / 2, door: true }),
    board({ size: [18, 1200, 450], position: [800, 600, -200] })];
  const before = structuredClone(geometry);
  const preview = buildCatalogThumbnail(geometry, materials)!;
  const translated = geometry.map((panel) => ({ ...panel,
    position: panel.position.map((n, axis) => n + [5000, -2000, 3000][axis]) as [number, number, number],
  }));
  const shifted = buildCatalogThumbnail(translated, materials)!;
  assert.deepEqual(geometry, before);
  for (const face of preview.faces) {
    const counterpart = shifted.faces.find((other) => face.key === other.key)!;
    face.points.forEach((point, i) => {
      assert.ok(Math.abs(point.x - counterpart.points[i].x) < 1e-8);
      assert.ok(Math.abs(point.y - counterpart.points[i].y) < 1e-8);
    });
  }
  assert.ok(preview.faces.some((face) => face.key === "0-front"));
  assert.ok(!preview.faces.some((face) => face.key === "0-right"), "rotation must change which side is visible");
});

test("material colors follow supplied IDs while transparent fronts and metal retain their surface semantics", () => {
  const geometry = [board({ material: "red" }),
    board({ material: "green", position: [700, 450, 0] }),
    board({ material: "red", surface: "glass", door: true, position: [1400, 450, 0] }),
    board({ surface: "aluminum-glass", door: true, position: [2100, 450, 0] }),
    board({ material: "metal", shape: "cylinder", size: [500, 25, 25], position: [0, 1000, 0] })];
  const preview = buildCatalogThumbnail(geometry, [{ id: "red", color: "#ff0000" }, { id: "green", color: "#00ff00" }])!;
  for (const face of preview.faces) {
    assert.match(face.color, /^#[0-9a-f]{6}$/);
    if (face.source === 0) assert.match(face.color, /^#[0-9a-f]{2}0000$/);
    if (face.source === 1) assert.match(face.color, /^#00[0-9a-f]{2}00$/);
    if (face.source === 2 || face.source === 3) assert.ok(face.door && face.opacity < .5);
    if (face.source === 4) assert.equal(face.surface, "metal");
  }
  assert.ok(preview.faces.some((face) => face.surface === "glass"));
  assert.ok(preview.faces.some((face) => face.surface === "aluminum-glass"));
  assert.ok(preview.faces.some((face) => face.key.startsWith("4-rail-")), "a supplied rail must keep its cylinder silhouette");
});

test("handle details respect each door's setting without adding handles to structural panels", () => {
  const geometry = [board(), board({ door: true, position: [700, 450, 0] }),
    board({ door: true, handle: "push", position: [1400, 450, 0] })];
  const preview = buildCatalogThumbnail(geometry, materials, "exterior")!;
  const handles = preview.faces.filter((face) => face.handle);
  assert.equal(handles.length, 1);
  assert.equal(handles[0].source, 1);
  assert.ok(handles[0].handle!.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

test("invalid geometry is omitted safely and malformed material colors cannot become SVG paint URLs", () => {
  const invalid = [board({ size: [NaN, 900, 18] }), board({ position: [Infinity, 0, 0] }),
    board({ size: [-18, 900, 18] }), board({ rotationY: NaN }), board({ position: [1e308, 0, 0] })];
  assert.equal(buildCatalogThumbnail([], materials), null);
  assert.equal(buildCatalogThumbnail(invalid, materials), null);
  const mixed = buildCatalogThumbnail([...invalid, board()], [{ id: "sample", color: "url(https://example.test/tracker)" }])!;
  assert.ok(mixed.faces.length > 0);
  assert.ok(mixed.faces.every((face) => face.source === invalid.length && /^#[0-9a-f]{6}$/.test(face.color)));
});

test("catalog thumbnails have no viewer, runtime engine or Three dependency and render no nested controls", async () => {
  const files = ["../src/CardPreview.tsx", "../src/CatalogThumbnail.tsx", "../src/catalog-thumbnail.ts"];
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    const runtimeImports = source.split("\n").filter((line) => /^import (?!type\b)/.test(line)).join("\n");
    assert.doesNotMatch(runtimeImports, /Viewer|three|lib\/furniture/);
    assert.doesNotMatch(source, /<(?:button|a|canvas|foreignObject)\b|dangerouslySetInnerHTML/);
  }
});
