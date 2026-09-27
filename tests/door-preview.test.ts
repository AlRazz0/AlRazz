import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { DOOR_OPEN_ANGLE, doorPreviewBounds } from "../src/door-preview.ts";
import { getViewDirection } from "../src/camera-motion.ts";
import { disposeObjects, fitCamera } from "../src/viewer-scene.ts";

function cabinet(width: number, height: number, depth: number, count: number) {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth));
  body.position.y = height / 2;
  root.add(body);
  const doors: THREE.Group[] = [];
  const doorWidth = width / count - 0.004;
  for (let index = 0; index < count; index++) {
    const hinge = new THREE.Group();
    hinge.position.set(
      -width / 2 + (index * width) / count,
      height / 2,
      depth / 2 + 0.02,
    );
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(doorWidth, height - 0.004, 0.018),
    );
    leaf.position.x = doorWidth / 2;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.12, 0.03));
    handle.position.set(doorWidth - 0.04, 0, 0.023);
    hinge.add(leaf, handle);
    root.add(hinge);
    doors.push(hinge);
  }
  return { root, doors };
}

function corners(bounds: THREE.Box3) {
  const points: THREE.Vector3[] = [];
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z])
        points.push(new THREE.Vector3(x, y, z));
  return points;
}

test("a fixed card camera contains doors and handles throughout their entire swing", () => {
  for (const [width, height, depth, count] of [
    [0.42, 0.65, 0.35, 1],
    [0.8, 2.1, 0.4, 2],
    [2.8, 0.65, 0.4, 4],
    [1.1, 1.4, 0.6, 1],
  ]) {
    const { root, doors } = cabinet(width, height, depth, count);
    try {
      const sweep = doorPreviewBounds(root, doors);
      for (const aspect of [0.7, 1.6, 2.3]) {
        const camera = new THREE.PerspectiveCamera(34, aspect, 0.01, 200);
        const fit = fitCamera(camera, sweep, getViewDirection("iso"));
        camera.lookAt(fit.center);
        camera.updateMatrixWorld();
        // Fit exactly once. All intermediate poses must retain the same camera.
        const position = camera.position.toArray();
        const orientation = camera.quaternion.toArray();
        for (let step = 0; step <= 300; step++) {
          doors.forEach((door) => {
            door.rotation.y = (DOOR_OPEN_ANGLE * step) / 300;
          });
          const actual = new THREE.Box3().setFromObject(root);
          for (const point of corners(actual)) {
            assert.ok(
              sweep.containsPoint(point),
              `Swing escapes its bounds at ${step}/300`,
            );
            const projected = point.project(camera);
            assert.ok(
              Math.abs(projected.x) <= 1 / 1.16 + 1e-7 &&
                Math.abs(projected.y) <= 1 / 1.16 + 1e-7 &&
                projected.z >= -1 &&
                projected.z <= 1,
              `Door clipped at aspect ${aspect}, swing ${step}/300: ${projected.toArray()}`,
            );
          }
        }
        assert.deepEqual(camera.position.toArray(), position);
        assert.deepEqual(camera.quaternion.toArray(), orientation);
      }
    } finally {
      disposeObjects(root);
    }
  }
});

test("reframing during a reversed hover preserves the current door pose and stable bounds", () => {
  const { root, doors } = cabinet(1.8, 0.9, 0.4, 3);
  try {
    const closedBounds = doorPreviewBounds(root, doors);
    doors.forEach((door, index) => {
      door.rotation.y = (DOOR_OPEN_ANGLE * (index + 1)) / 4;
    });
    root.updateMatrixWorld(true);
    const rotations = doors.map((door) => door.rotation.y);
    const positions = doors.map((door) =>
      door.children[0].getWorldPosition(new THREE.Vector3()),
    );
    const bounds = doorPreviewBounds(root, doors);
    assert.ok(bounds.equals(closedBounds));
    assert.deepEqual(
      doors.map((door) => door.rotation.y),
      rotations,
    );
    doors.forEach((door, index) => {
      assert.ok(
        door.children[0]
          .getWorldPosition(new THREE.Vector3())
          .distanceTo(positions[index]) < 1e-10,
      );
    });
  } finally {
    disposeObjects(root);
  }
});

test("open furniture retains its ordinary card bounds", () => {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.75, 0.6)));
  try {
    assert.ok(
      doorPreviewBounds(root, []).equals(new THREE.Box3().setFromObject(root)),
    );
  } finally {
    disposeObjects(root);
  }
});
