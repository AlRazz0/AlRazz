import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { placementBounds, projectPlacementSlots } from "../src/viewer-placement.ts";
import type { PlacementSlot } from "../src/kitchen-slots.ts";

const slot = (id: string, position: [number, number, number]): PlacementSlot => ({ id, position, label: `Añadir ${id}` });
function camera(width = 800, height = 600) {
  const result = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  result.position.set(0, 0, 5);
  result.lookAt(0, 0, 0);
  result.updateMatrixWorld();
  result.updateProjectionMatrix();
  return result;
}
test("placement buttons project millimetres to CSS pixels and follow camera movement and resizing", () => {
  const slots = [slot("center", [0, 0, 0]), slot("right", [1000, 0, 0])];
  const view = camera();
  const initial = projectPlacementSlots(slots, view, 800, 600);
  assert.equal(initial[0].anchorX, 400);
  assert.equal(initial[0].anchorY, 300);
  assert.ok(initial[1].anchorX > initial[0].anchorX);
  const portrait = projectPlacementSlots(slots, camera(360, 780), 360, 780);
  assert.equal(portrait[0].x, 180);
  assert.equal(portrait[0].y, 390);
  view.position.set(5, 0, 0);
  view.lookAt(0, 0, 0);
  view.updateMatrixWorld();
  const rotated = projectPlacementSlots(slots, view, 800, 600);
  assert.ok(Math.abs(rotated[1].anchorX - 400) < 0.001);
  assert.ok(Math.hypot(rotated[1].x - rotated[0].x, rotated[1].y - rotated[0].y) >= 48);
});
test("behind-camera, outside-viewport and invalid markers are hidden without breaking visible controls", () => {
  const points = [slot("visible", [0, 0, 0]), slot("behind", [0, 0, 6000]), slot("outside", [50000, 0, 0]), slot("bad", [NaN, 0, 0])];
  assert.deepEqual(projectPlacementSlots(points, camera(), 800, 600).map(point => point.id), ["visible"]);
  assert.deepEqual(projectPlacementSlots(points, camera(), 0, 600), []);
});
test("dense nearby markers retain separate 46px targets and stable repeat positions", () => {
  const points = [slot("one", [0, 0, 0]), slot("two", [5, 0, 0]), slot("three", [-5, 0, 0])];
  const view = camera(360, 600);
  const result = projectPlacementSlots(points, view, 360, 600);
  assert.equal(result.length, 3);
  for (let index = 0; index < result.length; index++) for (let other = index + 1; other < result.length; other++) assert.ok(Math.hypot(result[index].x - result[other].x, result[index].y - result[other].y) >= 48);
  assert.deepEqual(projectPlacementSlots(points, view, 360, 600), result);
});
test("placement framing bounds include outside slots independently from actual furniture bounds", () => {
  const furniture = new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(0.3, 0.9, 0.3));
  const unchanged = furniture.clone();
  const points = [slot("outside", [1800, 400, 650])];
  const extras = placementBounds(points);
  assert.ok(extras.containsPoint(new THREE.Vector3(1.8, 0.4, 0.65)));
  assert.ok(furniture.clone().union(extras).max.x > furniture.max.x);
  assert.ok(furniture.equals(unchanged));
  assert.ok(placementBounds([]).isEmpty());
});
