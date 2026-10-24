import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { withDoorHinges } from "../lib/door-hinges.ts";
import type { VisualPanel } from "../lib/public-geometry.ts";
import { createShowcaseModel } from "../src/showcase-render.ts";
import { DOOR_OPEN_ANGLE, doorPreviewBounds, doorRotation } from "../src/door-preview.ts";
import { disposeObjects, fitCamera } from "../src/viewer-scene.ts";

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3(1.25, 0.1, -0.8);
const TOLERANCE = 1e-6;
type FrontSurface = VisualPanel["surface"];

function assertPoint(actual: THREE.Vector3, expected: THREE.Vector3, message: string) {
  assert.ok(actual.distanceTo(expected) < TOLERANCE,
    `${message}: ${actual.toArray()} versus ${expected.toArray()}`);
}

function pair(surface: FrontSurface, rotationY: number): VisualPanel[] {
  return [-202, 202].map((x) => {
    const position = new THREE.Vector3(x / 1000, 0.4, 0.3)
      .applyAxisAngle(Y_AXIS, rotationY).add(ORIGIN).multiplyScalar(1000);
    return {
      size: [400, 800, surface === "glass" ? 6 : surface === "aluminum-glass" ? 20 : 18],
      position: position.toArray() as [number, number, number],
      material: "sample",
      door: true,
      ...(surface ? { surface } : {}),
      ...(rotationY ? { rotationY } : {}),
    };
  });
}

function intoClosedFrame(point: THREE.Vector3, rotationY: number) {
  return point.clone().sub(ORIGIN).applyAxisAngle(Y_AXIS, -rotationY);
}

function fromClosedFrame(point: THREE.Vector3, rotationY: number) {
  return point.clone().applyAxisAngle(Y_AXIS, rotationY).add(ORIGIN);
}

/** Measure the actual front meshes, excluding the protruding handle and outline. */
function physicalFrontBounds(door: THREE.Group) {
  door.updateWorldMatrix(true, true);
  const result = new THREE.Box3();
  door.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.name === "front-handle") return;
    object.geometry.computeBoundingBox();
    result.union(object.geometry.boundingBox!.clone().applyMatrix4(object.matrixWorld));
  });
  return result;
}

function boxCorners(box: THREE.Box3) {
  return [box.min.x, box.max.x].flatMap((x) =>
    [box.min.y, box.max.y].flatMap((y) =>
      [box.min.z, box.max.z].map((z) => new THREE.Vector3(x, y, z))));
}

for (const surface of [undefined, "glass", "aluminum-glass"] as const) {
  for (const rotationY of [0, -Math.PI / 2]) {
    const label = `${surface ?? "melamine"}, local rotation ${rotationY}`;
    test(`paired fronts keep their closed dimensions, outside hinges and central handles: ${label}`, () => {
      // No hinge metadata: the same renderer must also support historical geometry.
      const geometry = pair(surface, rotationY);
      const original = structuredClone(geometry);
      const model = createShowcaseModel(geometry, [], "exterior");
      try {
        assert.equal(model.doors.length, 2);
        const [left, right] = model.doors;
        const centers = model.doors.map((door, index) => {
          const bounds = physicalFrontBounds(door);
          const center = bounds.getCenter(new THREE.Vector3());
          assertPoint(center, new THREE.Vector3(...geometry[index].position).multiplyScalar(0.001),
            "changing the hinge must not move the closed front");
          const expectedSize = rotationY === 0
            ? new THREE.Vector3(0.4, 0.8, geometry[index].size[2] / 1000)
            : new THREE.Vector3(geometry[index].size[2] / 1000, 0.8, 0.4);
          assertPoint(bounds.getSize(new THREE.Vector3()), expectedSize,
            "the supplied leaf and frame dimensions must remain unchanged");
          return intoClosedFrame(center, rotationY);
        });

        assertPoint(intoClosedFrame(left.getWorldPosition(new THREE.Vector3()), rotationY),
          new THREE.Vector3(-0.402, 0.4, 0.3), "the left hinge belongs at the outside left edge");
        assertPoint(intoClosedFrame(right.getWorldPosition(new THREE.Vector3()), rotationY),
          new THREE.Vector3(0.402, 0.4, 0.3), "the right hinge belongs at the outside right edge");

        const grips = model.doors.map((door) => {
          const grip = door.getObjectByName("front-handle");
          assert.ok(grip, "an exterior-handle front must have a visible handle");
          return intoClosedFrame(grip.getWorldPosition(new THREE.Vector3()), rotationY);
        });
        assert.ok(grips[0].x > centers[0].x && grips[0].x < 0,
          "the left handle must face the central seam");
        assert.ok(grips[1].x < centers[1].x && grips[1].x > 0,
          "the right handle must face the central seam");
        assert.ok(grips[1].x - grips[0].x < 0.15,
          "the two handles must be near each other, rather than at the outside edges");
        assert.ok(grips.every((grip) => grip.z > 0.3),
          "both handles belong on the outward-facing surface");
        assert.deepEqual(geometry, original);
      } finally {
        disposeObjects(model.group);
      }
    });

    test(`both leaves open forward while their free edges separate to opposite sides: ${label}`, () => {
      const geometry = pair(surface, rotationY);
      const original = structuredClone(geometry);
      const model = createShowcaseModel(geometry, [], "exterior");
      try {
        model.group.updateMatrixWorld(true);
        const closedPivots = model.doors.map((door) => door.getWorldPosition(new THREE.Vector3()));
        // Track physical points at the two meeting edges, halfway through each leaf.
        const closedEdges = [-0.002, 0.002].map((x) => new THREE.Vector3(x, 0.4, 0.3));
        const edgeInHinge = model.doors.map((door, index) =>
          door.worldToLocal(fromClosedFrame(closedEdges[index], rotationY)));

        const ninetyDegrees = Math.PI / 2 / Math.abs(DOOR_OPEN_ANGLE);
        model.doors.forEach((door) => { door.rotation.y = doorRotation(door, ninetyDegrees); });
        model.group.updateMatrixWorld(true);
        const openEdges = model.doors.map((door, index) => {
          assertPoint(door.getWorldPosition(new THREE.Vector3()), closedPivots[index],
            "the hinge axis must remain stationary throughout opening");
          return intoClosedFrame(door.localToWorld(edgeInHinge[index].clone()), rotationY);
        });
        assertPoint(openEdges[0], new THREE.Vector3(-0.402, 0.4, 0.7),
          "at ninety degrees the left free edge is forward of the outside left hinge");
        assertPoint(openEdges[1], new THREE.Vector3(0.402, 0.4, 0.7),
          "at ninety degrees the right free edge is forward of the outside right hinge");
        assert.ok(openEdges[0].x < closedEdges[0].x && openEdges[1].x > closedEdges[1].x,
          "the meeting edges must move away from each other");

        model.doors.forEach((door) => { door.rotation.y = doorRotation(door, 1); });
        model.group.updateMatrixWorld(true);
        const fullyOpenEdges = model.doors.map((door, index) =>
          intoClosedFrame(door.localToWorld(edgeInHinge[index].clone()), rotationY));
        assert.ok(fullyOpenEdges[0].x < -0.402 && fullyOpenEdges[1].x > 0.402,
          "beyond ninety degrees the leaves must continue outwards, on opposite sides");
        assert.ok(fullyOpenEdges.every((point) => point.z > 0.3),
          "neither leaf may open into the furniture interior");

        model.doors.forEach((door) => { door.rotation.y = doorRotation(door, 0); });
        model.group.updateMatrixWorld(true);
        model.doors.forEach((door, index) => {
          assertPoint(physicalFrontBounds(door).getCenter(new THREE.Vector3()),
            new THREE.Vector3(...geometry[index].position).multiplyScalar(0.001),
            "closing must return the original leaf center");
          assertPoint(door.localToWorld(edgeInHinge[index].clone()),
            fromClosedFrame(closedEdges[index], rotationY), "closing must restore the meeting edge");
        });
        assert.deepEqual(geometry, original);
      } finally {
        disposeObjects(model.group);
      }
    });
  }
}

test("paired opposite swings and their handles fit one camera envelope, including a rotated glass row", () => {
  for (const [surface, rotationY] of [[undefined, 0], ["aluminum-glass", -Math.PI / 2]] as const) {
    const geometry = pair(surface, rotationY);
    const original = structuredClone(geometry);
    const model = createShowcaseModel(geometry, [], "exterior");
    try {
      model.doors.forEach((door) => { door.rotation.y = doorRotation(door, 0.37); });
      model.group.updateMatrixWorld(true);
      const rotations = model.doors.map((door) => door.rotation.y);
      const positions = model.doors.map((door) =>
        door.getObjectByName("front-handle")!.getWorldPosition(new THREE.Vector3()));
      const envelope = doorPreviewBounds(model.group, model.doors);
      assert.deepEqual(model.doors.map((door) => door.rotation.y), rotations,
        "measuring the sweep must not change the current animation pose");
      model.doors.forEach((door, index) => assertPoint(
        door.getObjectByName("front-handle")!.getWorldPosition(new THREE.Vector3()), positions[index],
        "measuring the sweep must leave visible handles in place"));

      for (const aspect of [0.7, 1.6]) {
        const camera = new THREE.PerspectiveCamera(34, aspect, 0.01, 200);
        const direction = new THREE.Vector3(0.44, 0.2, 1).applyAxisAngle(Y_AXIS, rotationY);
        const fit = fitCamera(camera, envelope, direction);
        camera.lookAt(fit.center);
        camera.updateMatrixWorld();
        const cameraPosition = camera.position.toArray();
        const cameraOrientation = camera.quaternion.toArray();
        // Include poses between the envelope's own samples and both reversal directions.
        for (let step = 0; step <= 300; step++) {
          const amount = step <= 150 ? step / 150 : (300 - step) / 150;
          model.doors.forEach((door) => { door.rotation.y = doorRotation(door, amount); });
          const actual = new THREE.Box3().setFromObject(model.group);
          assert.ok(envelope.containsBox(actual), `opposite swing escapes the envelope at ${amount}`);
          for (const point of boxCorners(actual)) {
            const projected = point.project(camera);
            assert.ok(Math.abs(projected.x) <= 1 / 1.16 + TOLERANCE &&
              Math.abs(projected.y) <= 1 / 1.16 + TOLERANCE && projected.z >= -1 && projected.z <= 1,
            `a leaf or handle is clipped at aspect ${aspect}, amount ${amount}`);
          }
        }
        assert.deepEqual(camera.position.toArray(), cameraPosition);
        assert.deepEqual(camera.quaternion.toArray(), cameraOrientation);
      }
      assert.deepEqual(geometry, original);
    } finally {
      disposeObjects(model.group);
    }
  }
});

test("legacy row pairing follows physical order without mutating input or overriding known hinges", () => {
  for (const count of [3, 4]) {
    const geometry: VisualPanel[] = Array.from({ length: count }, (_, index): VisualPanel => ({
      size: [400, 800, 18], position: [index * 404, 400, 300], material: "sample", door: true,
    })).reverse();
    const original = structuredClone(geometry);
    const assigned = withDoorHinges(geometry);
    assert.deepEqual([...assigned].sort((a, b) => a.position[0] - b.position[0]).map((panel) => panel.hinge),
      count === 3 ? ["left", "right", "left"] : ["left", "right", "left", "right"]);
    assert.deepEqual(geometry, original);
  }
  const known = pair(undefined, 0).map((panel): VisualPanel => ({ ...panel, hinge: "right" }));
  const before = structuredClone(known);
  assert.deepEqual(withDoorHinges(known).map((panel) => panel.hinge), ["right", "right"],
    "known independent kitchen hinges must not be reassigned when modules are combined");
  assert.deepEqual(known, before);
});
