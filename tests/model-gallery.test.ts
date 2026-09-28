import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { gallerySchema, resolveGallery } from "../lib/model-gallery.ts";
import { buildFurniture, defaultSettings, seedProducts } from "../lib/furniture.ts";
import { publicGeometry } from "../lib/public-geometry.ts";
import { createShowcaseModel } from "../src/showcase-render.ts";
import { disposeObjects } from "../src/viewer-scene.ts";

test("gallery defaults do not insert fields into historical product metadata", () => {
  assert.deepEqual(resolveGallery(), { enabled: true, scene: "warm", caption: "" });
  const metadata = { scene: "dark" as const, caption: "Acabado referencial" };
  const before = structuredClone(metadata);
  assert.equal(resolveGallery(metadata).enabled, true);
  assert.deepEqual(metadata, before);
  assert.equal(gallerySchema.safeParse({ scene: "other" }).success, false);
  assert.equal(gallerySchema.safeParse({ enabled: "false" }).success, false);
  assert.equal(gallerySchema.safeParse({ caption: "x".repeat(221) }).success, false);
  assert.equal(gallerySchema.safeParse({ image: "https://untrusted.example/image" }).success, false);
});

test("showcase uses quoted board dimensions, positions and doors without mutating geometry", () => {
  for (const product of seedProducts) {
    const result = buildFurniture(product, product.defaults);
    const geometry = publicGeometry(result.panels);
    const before = structuredClone(geometry);
    const model = createShowcaseModel(geometry, defaultSettings.materials, "push");
    assert.equal(model.group.children.length, geometry.length);
    assert.equal(model.doors.length, geometry.filter(p => p.door).length);
    for (let i = 0; i < geometry.length; i++) {
      const expected = geometry[i];
      const bounds = new THREE.Box3().setFromObject(model.group.children[i]);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      for (let axis = 0; axis < 3; axis++) {
        assert.ok(Math.abs(size.getComponent(axis) * 1000 - expected.size[axis]) < .001);
        assert.ok(Math.abs(center.getComponent(axis) * 1000 - expected.position[axis]) < .001);
      }
    }
    assert.deepEqual(geometry, before);
    disposeObjects(model.group);
  }
});
