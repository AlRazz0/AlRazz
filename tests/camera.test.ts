import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  animationProgress,
  createCameraMotion,
  getResizeDirection,
  getViewDirection,
} from "../src/camera-motion.ts";
import { fitCamera } from "../src/viewer-scene.ts";

test("animation timing never extrapolates when a frame timestamp precedes its start", () => {
  assert.deepEqual(
    [-800, 0, 320, 640, 960].map((elapsed) =>
      animationProgress(2000 + elapsed, 2000, 640),
    ),
    [0, 0, 0.5, 1, 1],
  );
  assert.equal(animationProgress(2000, 2000, 0), 1);
});

test("initial framing uses the requested isometric direction", () => {
  const direction = getViewDirection("iso");
  const bounds = new THREE.Box3(
    new THREE.Vector3(-0.6, 0, -0.3),
    new THREE.Vector3(0.6, 0.75, 0.3),
  );
  const camera = new THREE.PerspectiveCamera(34, 1.5, 0.01, 200);
  const fit = fitCamera(camera, bounds, direction);
  assert.ok(
    camera.position.clone().sub(fit.center).normalize().distanceTo(direction) <
      1e-10,
  );
  assert.ok(
    Math.abs(THREE.MathUtils.radToDeg(Math.asin(direction.y)) - 13.4712726043) <
      1e-8,
  );
});

test("resize finishes the requested view instead of freezing an intermediate initial pose", () => {
  const camera = new THREE.PerspectiveCamera(34, 1.5, 0.01, 200);
  const bounds = new THREE.Box3(
    new THREE.Vector3(-0.6, 0, -0.3),
    new THREE.Vector3(0.6, 0.75, 0.3),
  );
  const iso = getViewDirection("iso");
  const destination = fitCamera(camera, bounds, iso);
  const finalPosition = camera.position.clone();
  // Reproduce the former preliminary framing and an early RAF before ResizeObserver.
  const initial = fitCamera(
    camera,
    bounds,
    new THREE.Vector3(4, 3, 6).normalize(),
  );
  const target = initial.center.clone();
  const sample = createCameraMotion(
    camera,
    target,
    finalPosition,
    destination.center,
  );
  const apply = (progress: number) => {
    const pose = sample(progress, bounds);
    target.copy(pose.target);
    camera.position.copy(pose.position);
  };
  apply(1 - Math.pow(1 - -800 / 640, 3));
  assert.ok(camera.position.clone().sub(target).normalize().y > 0.999);
  let finished = false;
  const direction = getResizeDirection(camera, target, () => {
    finished = true;
    apply(1);
  });
  const fit = fitCamera(camera, bounds, direction);
  assert.equal(finished, true);
  assert.ok(direction.distanceTo(iso) < 1e-10);
  assert.ok(
    camera.position.clone().sub(fit.center).normalize().distanceTo(iso) < 1e-10,
  );
});

test("resize after a manual orbit preserves the current camera direction", () => {
  const camera = new THREE.PerspectiveCamera(34, 1.5, 0.01, 200);
  const target = new THREE.Vector3(0.2, 0.4, -0.1);
  const direction = new THREE.Vector3(-0.8, 0.7, 1).normalize();
  camera.position.copy(target).addScaledVector(direction, 4);
  const originalPosition = camera.position.clone();
  assert.ok(getResizeDirection(camera, target).distanceTo(direction) < 1e-10);
  assert.deepEqual(camera.position.toArray(), originalPosition.toArray());
});

const views = [
  new THREE.Vector3(0, 0.001, 1),
  new THREE.Vector3(1, 0.001, 0.001),
  new THREE.Vector3(0, 1, 0.001),
  new THREE.Vector3(0.52, 0.27, 1),
].map((direction) => {
  const orbit = new THREE.Spherical().setFromVector3(direction.normalize());
  orbit.phi = Math.min(orbit.phi, Math.PI * 0.49);
  return new THREE.Vector3().setFromSpherical(orbit);
});

function assertVisible(camera: THREE.PerspectiveCamera, bounds: THREE.Box3) {
  camera.updateMatrixWorld();
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const projected = new THREE.Vector3(x, y, z).project(camera);
        assert.ok(
          Math.abs(projected.x) <= 1 / 1.16 + 1e-7 &&
            Math.abs(projected.y) <= 1 / 1.16 + 1e-7 &&
            projected.z >= -1 &&
            projected.z <= 1,
          `A corner left the padded viewport: ${projected.toArray()}`,
        );
      }
    }
  }
}

test("every animated view keeps wide and tall furniture inside portrait and landscape frames", () => {
  for (const [width, height, depth] of [
    [3, 0.4, 0.3],
    [0.6, 2.4, 0.3],
    [3, 2.4, 0.6],
  ]) {
    const bounds = new THREE.Box3(
      new THREE.Vector3(-width / 2, 0, -depth / 2),
      new THREE.Vector3(width / 2, height, depth / 2),
    );
    for (const aspect of [0.65, 1.5]) {
      for (const startDirection of views) {
        for (const endDirection of views) {
          const camera = new THREE.PerspectiveCamera(34, aspect, 0.01, 200);
          const end = fitCamera(camera, bounds, endDirection);
          const finalPosition = camera.position.clone();
          const start = fitCamera(camera, bounds, startDirection);
          const sample = createCameraMotion(
            camera,
            start.center,
            finalPosition,
            end.center,
          );
          for (let step = 0; step <= 100; step++) {
            const pose = sample(step / 100, bounds);
            camera.position.copy(pose.position);
            camera.lookAt(pose.target);
            assertVisible(camera, bounds);
          }
        }
      }
    }
  }
});

test("moving targets and a moving scale reference stay in view throughout a transition", () => {
  const furniture = new THREE.Box3(
    new THREE.Vector3(-1.5, 0, -0.15),
    new THREE.Vector3(1.5, 0.4, 0.15),
  );
  const camera = new THREE.PerspectiveCamera(34, 0.65, 0.01, 200);
  const destination = fitCamera(camera, furniture, views[2]);
  const finalPosition = camera.position.clone();
  const startTarget = new THREE.Vector3(-0.3, 0.8, 0.1);
  camera.position.copy(startTarget).addScaledVector(views[1], 12);
  const sample = createCameraMotion(
    camera,
    startTarget,
    finalPosition,
    destination.center,
  );
  for (let step = 0; step <= 100; step++) {
    let currentBounds = furniture.clone();
    const pose = sample(step / 100, (direction) => {
      const right = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
      const referenceCenter = right.multiplyScalar(
        (Math.abs(right.x) * 3 + Math.abs(right.z) * 0.3) / 2 + 0.58,
      );
      const reference = new THREE.Box3().setFromCenterAndSize(
        referenceCenter.add(new THREE.Vector3(0, 0.85, 0)),
        new THREE.Vector3(0.55, 1.7, 0.2),
      );
      currentBounds = furniture.clone().union(reference);
      return currentBounds;
    });
    camera.position.copy(pose.position);
    camera.lookAt(pose.target);
    assertVisible(camera, currentBounds);
  }
});

test("camera fitting is continuous and preserves already fitted endpoints", () => {
  const bounds = new THREE.Box3(
    new THREE.Vector3(-1.5, 0, -0.15),
    new THREE.Vector3(1.5, 0.4, 0.15),
  );
  const camera = new THREE.PerspectiveCamera(34, 1.5, 0.01, 200);
  const end = fitCamera(camera, bounds, views[2]);
  const finalPosition = camera.position.clone();
  const start = fitCamera(camera, bounds, views[1]);
  const startPosition = camera.position.clone();
  const sample = createCameraMotion(
    camera,
    start.center,
    finalPosition,
    end.center,
  );
  assert.ok(sample(0, bounds).position.distanceTo(startPosition) < 1e-8);
  assert.ok(sample(1, bounds).position.distanceTo(finalPosition) < 1e-8);
  let previous = sample(0, bounds);
  for (let step = 1; step <= 1000; step++) {
    const current = sample(step / 1000, bounds);
    assert.ok(
      current.position.distanceTo(previous.position) < 0.03,
      "Camera snapped between adjacent animation samples",
    );
    previous = current;
  }
});
