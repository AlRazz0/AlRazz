import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  dimensionGeometry,
  dimensionLabelPosition,
  projectDimensions,
} from "../src/viewer-dimensions.ts";
import {
  createScaleReference,
  createStudio,
  disposeObjects,
  fitCamera,
  placeReference,
} from "../src/viewer-scene.ts";
import { seedProducts } from "../lib/furniture.ts";

test("dimension spans keep the closed furniture's true overall size on every camera side", () => {
  for (const direction of [
    new THREE.Vector3(1, 1, 1),
    new THREE.Vector3(-1, 1, -1),
  ]) {
    const dimensions = dimensionGeometry(1800, 805, 400, direction);
    assert.deepEqual(
      dimensions.map((d) => d.text),
      ["180 cm", "80.5 cm", "40 cm"],
    );
    for (const [index, value] of [1.8, 0.805, 0.4].entries())
      assert.ok(
        Math.abs(
          dimensions[index].start.distanceTo(dimensions[index].end) - value,
        ) < 1e-10,
      );
    assert.ok(dimensions[1].start.x * direction.x > 0);
    assert.ok(dimensions[0].start.z * direction.z > 0);
  }
});

test("front, side and top show the measurable axes and hide the axis viewed end-on", () => {
  const center = new THREE.Vector3(0, 0.4, 0);
  for (const [direction, expected] of [
    [new THREE.Vector3(0, 0, 1), ["width", "height"]],
    [new THREE.Vector3(1, 0, 0), ["height", "depth"]],
    [new THREE.Vector3(0, 1, 0.001).normalize(), ["width", "depth"]],
  ] as const) {
    const camera = new THREE.PerspectiveCamera(34, 1.5, 0.01, 100);
    camera.position.copy(center).addScaledVector(direction, 4);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    const projected = projectDimensions(
      dimensionGeometry(1800, 800, 400, direction),
      camera,
      900,
      600,
    );
    assert.deepEqual(
      projected.map((d) => d.axis),
      expected,
    );
    assert.ok(projected.every((d) => Number.isFinite(d.start.x + d.end.y)));
  }
});

test("annotations behind the camera or invalid measurements produce no labels", () => {
  const camera = new THREE.PerspectiveCamera(34, 1.5, 0.01, 100);
  camera.position.set(0, 0.4, 4);
  camera.lookAt(0, 0.4, 8);
  camera.updateMatrixWorld();
  const dimensions = dimensionGeometry(
    1800,
    800,
    400,
    new THREE.Vector3(0, 0, 1),
  );
  assert.equal(projectDimensions(dimensions, camera, 900, 600).length, 0);
  assert.deepEqual(dimensionGeometry(NaN, 800, 400, new THREE.Vector3()), []);
});

test("mobile ISO keeps all three dimensions with person and studio even when depth projects below 26px", () => {
  const direction = new THREE.Vector3(0.52, 0.27, 1).normalize();
  let shortDepths = 0;
  for (const {
    defaults: { width, height, depth },
  } of seedProducts) {
    const w = width / 1000,
      h = height / 1000,
      d = depth / 1000;
    const bounds = new THREE.Box3(
      new THREE.Vector3(-w / 2, 0, -d / 2),
      new THREE.Vector3(w / 2, h, d / 2),
    );
    const person = createScaleReference();
    const studio = createStudio(w, d);
    placeReference(person, direction, w, d);
    bounds.expandByObject(person).expandByObject(studio.decoration);
    const camera = new THREE.PerspectiveCamera(34, 360 / 326, 0.01, 100);
    const fit = fitCamera(camera, bounds, direction);
    camera.lookAt(fit.center);
    camera.updateMatrixWorld();
    const projected = projectDimensions(
      dimensionGeometry(width, height, depth, direction),
      camera,
      360,
      326,
    );
    assert.deepEqual(
      projected.map((dimension) => dimension.axis),
      ["width", "height", "depth"],
    );
    const depthLine = projected.find(
      (dimension) => dimension.axis === "depth",
    )!;
    if (
      Math.hypot(
        depthLine.end.x - depthLine.start.x,
        depthLine.end.y - depthLine.start.y,
      ) < 26
    )
      shortDepths++;
    const center = new THREE.Vector3(0, h / 2, 0).project(camera);
    const label = dimensionLabelPosition(
      depthLine.start,
      depthLine.end,
      52,
      { x: (center.x + 1) * 180, y: (1 - center.y) * 163 },
      { width: 360, height: 326 },
    );
    const midpoint = {
      x: (depthLine.start.x + depthLine.end.x) / 2,
      y: (depthLine.start.y + depthLine.end.y) / 2,
    };
    assert.ok(
      Math.abs(label.x - midpoint.x) > 26 ||
        Math.abs(label.y - midpoint.y) > 11,
      "Depth label must not cover the short dimension line",
    );
    assert.ok(
      label.x >= 34 && label.x <= 326 && label.y >= 15 && label.y <= 311,
    );
    disposeObjects(person);
    disposeObjects(studio.group);
  }
  assert.equal(
    shortDepths,
    4,
    "Fixture reproduces the mobile short-depth regression for every model",
  );
});
