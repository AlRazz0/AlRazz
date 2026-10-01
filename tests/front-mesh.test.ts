import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createTransparentFront,
  createPlaceholder,
} from "../src/front-mesh.ts";
import { createShowcaseModel } from "../src/showcase-render.ts";
import { disposeObjects } from "../src/viewer-scene.ts";
import { doorPreviewBounds, DOOR_OPEN_ANGLE } from "../src/door-preview.ts";
import type { VisualPanel } from "../lib/public-geometry.ts";

test("glass and aluminum doors use a six-mm pane and exactly four frame members", () => {
  for (const surface of ["glass", "aluminum-glass"] as const) {
    const panel: VisualPanel = {
      size: [500, 800, surface === "glass" ? 6 : 20],
      position: [100, 420, 300],
      material: "glass",
      door: true,
      surface,
    };
    const before = structuredClone(panel);
    const hinge = createTransparentFront(panel, "exterior");
    try {
      const pane = hinge.getObjectByName("glass-pane") as THREE.Mesh<
        THREE.BoxGeometry,
        THREE.MeshPhysicalMaterial
      >;
      assert.equal(pane.geometry.parameters.depth, 0.006);
      assert.equal(
        pane.geometry.parameters.width,
        surface === "glass" ? 0.5 : 0.46,
      );
      assert.ok(pane.material.transparent && pane.material.opacity < 0.5);
      let frames = 0;
      hinge.traverse((object) => {
        if (object.name === "aluminum-frame") frames++;
      });
      assert.equal(frames, surface === "glass" ? 0 : 4);
      const paneCenter = pane.getWorldPosition(new THREE.Vector3());
      assert.ok(
        paneCenter.distanceTo(new THREE.Vector3(0.1, 0.42, 0.3)) < 1e-9,
      );
      assert.deepEqual(panel, before);
    } finally {
      disposeObjects(hinge);
    }
  }
});

test("rotated kitchen doors preserve their closed center and stay inside the complete animation bounds", () => {
  for (const surface of [undefined, "glass", "aluminum-glass"] as const) {
    const panel: VisualPanel = {
      size: [500, 800, surface === "glass" ? 6 : surface ? 20 : 18],
      position: [800, 500, -300],
      material: "blanco",
      door: true,
      surface,
      rotationY: -Math.PI / 2,
    };
    const model = createShowcaseModel([panel], [], "push");
    try {
      const closed = new THREE.Box3().setFromObject(model.group);
      assert.ok(
        closed
          .getCenter(new THREE.Vector3())
          .distanceTo(new THREE.Vector3(0.8, 0.5, -0.3)) < 1e-6,
      );
      assert.equal(model.doors[0].rotation.y, -Math.PI / 2);
      const sweep = doorPreviewBounds(model.group, model.doors);
      for (let step = 0; step <= 60; step++) {
        model.doors[0].rotation.y =
          -Math.PI / 2 + (DOOR_OPEN_ANGLE * step) / 60;
        const actual = new THREE.Box3().setFromObject(model.group);
        assert.ok(sweep.containsBox(actual));
      }
    } finally {
      disposeObjects(model.group);
    }
  }
});

test("reserved appliance spaces render as translucent outlines without furniture finishes", () => {
  const panel: VisualPanel = {
    size: [600, 1800, 600],
    position: [0, 900, 0],
    material: "reserved",
    surface: "placeholder",
    rotationY: -Math.PI / 2,
  };
  const mesh = createPlaceholder(panel);
  try {
    assert.ok(mesh.material.transparent);
    assert.equal(mesh.material.opacity, 0.12);
    assert.equal(mesh.rotation.y, -Math.PI / 2);
    assert.equal(mesh.children.length, 1);
    assert.ok(mesh.children[0] instanceof THREE.LineSegments);
  } finally {
    disposeObjects(mesh);
  }
});

test("individual kitchen door handles override the viewer fallback without altering other modules", () => {
  const doors: VisualPanel[] = ["push", "exterior", "push"].map(
    (handle, index) => ({
      size: [500, 800, 18],
      position: [index * 600, 400, 300],
      material: "blanco",
      door: true,
      handle: handle as "push" | "exterior",
    }),
  );
  const model = createShowcaseModel(doors, [], "exterior");
  try {
    assert.deepEqual(
      model.doors.map((door) => Boolean(door.getObjectByName("front-handle"))),
      [false, true, false],
    );
  } finally {
    disposeObjects(model.group);
  }
});
