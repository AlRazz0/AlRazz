import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createShowroomScene } from "../src/showroom-scene.ts";
import { productTemplate } from "../lib/product-templates.ts";
import { buildFurniture, defaultSettings, publicMaterials } from "../lib/furniture.ts";
import { publicProduct, publicFurnitureResult } from "../lib/public-product.ts";

const finishes = publicMaterials(defaultSettings).map(material => ({ ...material, renderTexture: false }));
function fixture() {
  const source = productTemplate("wardrobe");
  const result = buildFurniture(source, source.defaults, defaultSettings);
  return { ...publicProduct(source, result.price), preview: publicFurnitureResult(result, source) };
}

test("presentation floor meets the actual furniture; dressing never changes its engine envelope", async () => {
  const product = fixture(), original = structuredClone(product);
  const environment = new THREE.Texture();
  const studio = createShowroomScene(product, finishes, environment, () => {});
  try {
    await studio.ready;
    const physicalMinimum = Math.min(...product.preview.geometry.map(panel => (panel.position[1] - panel.size[1] / 2) / 1000));
    assert.ok(Math.abs(studio.bounds.min.y - physicalMinimum) < 1e-6, "no hidden unit outline extends below the feet");
    const floor = studio.scene.children.find(object => object instanceof THREE.Mesh && object.geometry instanceof THREE.PlaneGeometry && object.rotation.x === -Math.PI / 2) as THREE.Mesh;
    assert.ok(floor);
    assert.ok(Math.abs(floor.position.y - (physicalMinimum - .002)) < 1e-6);
    assert.deepEqual(product, original);
  } finally { studio.dispose(); environment.dispose(); }
});

test("guided whole views frame both closed and opposing open doors without editing configuration", () => {
  const product = fixture(), environment = new THREE.Texture();
  const studio = createShowroomScene(product, finishes, environment, () => {});
  try {
    assert.equal(studio.hasDoors, true);
    studio.camera.aspect = .8; studio.camera.updateProjectionMatrix();
    for (const opened of [0, 1, 0]) {
      studio.doors(opened);
      for (const pose of ["presence", "front", "side"] as const) {
        studio.fit(pose);
        const bounds = studio.currentBounds();
        for (const x of [bounds.min.x,bounds.max.x]) for (const y of [bounds.min.y,bounds.max.y]) for (const z of [bounds.min.z,bounds.max.z]) {
          const projected = new THREE.Vector3(x,y,z).project(studio.camera);
          assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1, `${pose} clips furniture with doors=${opened}`);
        }
      }
      const pivots = studio.group.children.filter(child => child.userData.hinge);
      if (opened) assert.ok(pivots.some(pivot => pivot.rotation.y > 0) && pivots.some(pivot => pivot.rotation.y < 0), "paired doors open away from one another");
    }
    assert.equal(studio.openAmount, 0);
  } finally { studio.dispose(); environment.dispose(); }
});
