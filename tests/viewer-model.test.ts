import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import type { VisualPanel } from "../lib/public-geometry.ts";
import type { PublicMaterial } from "../src/types.ts";
import { createViewerModel, preserveViewerCamera } from "../src/viewer-model.ts";
import { doorRotation } from "../src/door-preview.ts";

const materials: PublicMaterial[] = [{ id: "sample", name: "Acabado de prueba", color: "#b99469", active: true, brand: "", code: "", board: "standard" }];
const board = (values: Partial<VisualPanel> = {}): VisualPanel => ({
  size: [600, 900, 18], position: [0, 450, 300], material: "sample", ...values,
});
function meshBounds(mesh: THREE.Mesh) {
  mesh.updateWorldMatrix(true, false);
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
}
function assertSize(mesh: THREE.Mesh, size: [number, number, number], message: string) {
  assert.ok(meshBounds(mesh).getSize(new THREE.Vector3()).distanceTo(new THREE.Vector3(...size)) < 1e-6, message);
}

test("rapid measure changes retain meshes, board geometry and finish materials while keeping 18 mm thickness", () => {
  const group = new THREE.Group();
  const model = createViewerModel(group, () => {});
  const input = [board({ size: [18, 900, 400], position: [-300, 450, 0] }), board({ door: true, hinge: "left" })];
  const original = structuredClone(input);
  model.update(input, materials, "exterior");
  const side = group.children[0] as THREE.Mesh;
  const hinge = group.children[1];
  const leaf = hinge.children[0] as THREE.Mesh;
  const geometry = side.geometry, material = side.material;
  const grip = hinge.getObjectByName("front-handle") as THREE.Mesh;
  try {
    assert.equal(leaf.geometry, geometry, "ordinary boards share their unit geometry");
    for (let step = 1; step <= 100; step++) {
      const height = 900 + step * 10;
      const result = model.update([
        board({ size: [18, height, 400], position: [-300, height / 2, 0] }),
        board({ size: [600 + step * 10, height, 18], position: [0, height / 2, 300], door: true, hinge: "left" }),
      ], materials, "exterior", 0.3);
      assert.equal(group.children[0], side);
      assert.equal(group.children[1], hinge);
      assert.equal(side.geometry, geometry);
      assert.equal(side.material, material);
      assert.equal(leaf.material, material);
      assert.equal(result.doors[0], hinge);
      assert.ok(Math.abs(hinge.rotation.y - doorRotation(hinge as THREE.Group, 0.3)) < 1e-12);
      assertSize(side, [0.018, height / 1000, 0.4], "side boards retain the exact engine thickness");
      assert.ok(grip.getWorldScale(new THREE.Vector3()).distanceTo(new THREE.Vector3(1, 1, 1)) < 1e-9,
        "the handle must not stretch with its parent board");
    }
    const same = model.update([
      board({ size: [18, 1900, 400], position: [-300, 950, 0] }),
      board({ size: [1600, 1900, 18], position: [0, 950, 300], door: true, hinge: "left" }),
    ], structuredClone(materials), "exterior", 0.3);
    assert.equal(same.changed, false, "equivalent API/local arrays do not rebuild the visible model");
    assert.equal(same.boundsChanged, false);
    assert.deepEqual(input, original);
  } finally { model.dispose(); }
});

for (const surface of ["glass", "aluminum-glass"] as const) {
  test(`resizing ${surface} retains panes and frame materials without scaling glass, profiles or handles`, () => {
    const group = new THREE.Group();
    const model = createViewerModel(group, () => {});
    const leaves = (width: number, height: number): VisualPanel[] => [-1, 1].map((side) => board({
      size: [width, height, surface === "glass" ? 6 : 20],
      position: [side * (width / 2 + 2), height / 2, 300],
      door: true, surface,
    }));
    const first = model.update(leaves(400, 800), materials, "exterior");
    const hinges = [...first.doors];
    const panes = hinges.map((hinge) => hinge.getObjectByName("glass-pane") as THREE.Mesh);
    const paneGeometry = panes.map((pane) => pane.geometry);
    const paneMaterials = panes.map((pane) => pane.material);
    const frames: THREE.Mesh[] = [];
    group.traverse((object) => { if (object.name === "aluminum-frame") frames.push(object as THREE.Mesh); });
    const frameMaterials = frames.map((frame) => frame.material);
    try {
      for (let step = 1; step <= 20; step++) {
        const width = 400 + step * 10, height = 800 + step * 20;
        const input = leaves(width, height), before = structuredClone(input);
        const updated = model.update(input, materials, "exterior");
        updated.doors.forEach((hinge, index) => {
          assert.equal(hinge, hinges[index]);
          assert.equal(panes[index].geometry, paneGeometry[index]);
          assert.equal(panes[index].material, paneMaterials[index]);
          assertSize(panes[index], [(width - (surface === "glass" ? 0 : 40)) / 1000,
            (height - (surface === "glass" ? 0 : 40)) / 1000, 0.006], "glass remains a six-mm pane");
          assertSize(hinge.getObjectByName("front-handle") as THREE.Mesh, [0.009, 0.09, 0.025],
            "the hardware keeps its physical size");
        });
        frames.forEach((frame, index) => {
          assert.equal(frame.material, frameMaterials[index]);
          const size = meshBounds(frame).getSize(new THREE.Vector3());
          assert.ok(Math.abs(size.z - 0.02) < 1e-6);
          assert.ok(Math.abs(Math.min(size.x, size.y) - 0.02) < 1e-6, "frame profiles remain twenty mm wide");
        });
        assert.deepEqual(input, before);
      }
      hinges.forEach((hinge) => { hinge.rotation.y = doorRotation(hinge, 1); });
      group.updateMatrixWorld(true);
      const centers = panes.map((pane) => pane.getWorldPosition(new THREE.Vector3()));
      assert.ok(centers[0].x < -0.602 && centers[1].x > 0.602,
        "opposing doors continue opening beyond their outer hinges after resizing");
      assert.ok(centers.every((point) => point.z > 0.3), "both doors still open forwards");
    } finally { model.dispose(); }
  });
}

test("rods and reserved outlines resize without becoming melamine or losing their local rotation", () => {
  const group = new THREE.Group();
  const model = createViewerModel(group, () => {});
  const parts = (width: number): VisualPanel[] => [
    board({ size: [width, 25, 25], shape: "cylinder", material: "metal", rotationY: -Math.PI / 2 }),
    board({ size: [width, 1800, 600], surface: "placeholder", rotationY: -Math.PI / 2 }),
  ];
  model.update(parts(600), materials);
  const original = [...group.children] as THREE.Mesh[];
  try {
    model.update(parts(1200), materials);
    assert.deepEqual(group.children, original);
    assertSize(original[0], [0.025, 0.025, 1.2], "a rotated rod keeps its cylinder axis and diameter");
    assertSize(original[1], [0.6, 1.8, 1.2], "reserved spaces retain their supplied envelope");
    assert.ok((original[1].material as THREE.MeshStandardMaterial).transparent);
  } finally { model.dispose(); }
});

test("resized kitchen fronts retain their rotated closed centers and opposing local outward swing", () => {
  const axis = new THREE.Vector3(0, 1, 0), origin = new THREE.Vector3(1.2, 0, -0.8);
  const rotation = -Math.PI / 2;
  for (const surface of [undefined, "glass", "aluminum-glass"] as const) {
    const group = new THREE.Group(), model = createViewerModel(group, () => {});
    const leaves = (width: number): VisualPanel[] => [-1, 1].map((side) => {
      const position = new THREE.Vector3(side * (width / 2 + 2) / 1000, 0.6, 0.3)
        .applyAxisAngle(axis, rotation).add(origin).multiplyScalar(1000);
      return board({ size: [width, 1200, surface === "glass" ? 6 : surface ? 20 : 18],
        position: position.toArray() as [number, number, number], door: true, surface, rotationY: rotation });
    });
    model.update(leaves(400), materials, "exterior");
    const first = [...group.children];
    const input = leaves(600), before = structuredClone(input);
    try {
      const updated = model.update(input, materials, "exterior");
      assert.deepEqual(group.children, first);
      const fronts = updated.doors.map((hinge) => (hinge.getObjectByName("glass-pane") ?? hinge.children[0]) as THREE.Mesh);
      fronts.forEach((front, index) => assert.ok(front.getWorldPosition(new THREE.Vector3())
        .distanceTo(new THREE.Vector3(...input[index].position).multiplyScalar(0.001)) < 1e-9));
      updated.doors.forEach((hinge) => { hinge.rotation.y = doorRotation(hinge, 1); });
      group.updateMatrixWorld(true);
      const centers = fronts.map((front) => front.getWorldPosition(new THREE.Vector3()).sub(origin).applyAxisAngle(axis, -rotation));
      assert.ok(centers[0].x < -0.602 && centers[1].x > 0.602);
      assert.ok(centers.every((center) => center.z > 0.3));
      assert.deepEqual(input, before);
    } finally { model.dispose(); }
  }
});

test("color updates reuse a finish material and geometry; removing panels does not dispose shared live resources", () => {
  const group = new THREE.Group();
  const model = createViewerModel(group, () => {});
  model.update([board(), board({ position: [700, 450, 300] })], materials);
  const first = group.children[0] as THREE.Mesh;
  const material = first.material as THREE.MeshStandardMaterial;
  const geometry = first.geometry;
  let materialDisposals = 0, geometryDisposals = 0;
  material.addEventListener("dispose", () => materialDisposals++);
  geometry.addEventListener("dispose", () => geometryDisposals++);
  model.update([board()], [{ ...materials[0], color: "#779988" }]);
  assert.equal(first.material, material);
  assert.equal(material.color.getHexString(), "779988");
  assert.equal(materialDisposals, 0);
  assert.equal(geometryDisposals, 0);
  model.dispose(); model.dispose();
  assert.equal(materialDisposals, 1);
  assert.equal(geometryDisposals, 1);
  assert.equal(group.children.length, 0);
});

test("one texture load survives rapid geometry updates and late old finishes cannot overwrite the active finish", async () => {
  const group = new THREE.Group();
  const pending = new Map<string, (texture: THREE.Texture) => void>();
  let requests = 0;
  const model = createViewerModel(group, () => {}, 4, (path) => {
    requests++;
    return new Promise<THREE.Texture>((resolve) => pending.set(path, resolve));
  });
  const finish = (name: string): PublicMaterial[] => [{ ...materials[0], swatch: `/images/materials/${name}.webp` }];
  for (let step = 0; step < 50; step++) model.update([board({ size: [600 + step * 10, 900, 18] })], finish("first"));
  assert.equal(requests, 1);
  const mesh = group.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  const old = mesh.material;
  model.update([board()], finish("second"));
  const current = mesh.material;
  assert.notEqual(current, old);
  const oldTexture = new THREE.Texture(), currentTexture = new THREE.Texture();
  let oldDisposals = 0, currentDisposals = 0;
  oldTexture.addEventListener("dispose", () => oldDisposals++);
  currentTexture.addEventListener("dispose", () => currentDisposals++);
  pending.get("/images/materials/first.webp")!(oldTexture);
  await Promise.resolve();
  assert.equal(current.map, null, "the previous finish cannot be applied to the active material");
  pending.get("/images/materials/second.webp")!(currentTexture);
  await Promise.resolve();
  assert.equal(current.map, currentTexture);
  assert.equal(mesh.material, current);
  model.dispose(); model.dispose();
  assert.equal(oldDisposals, 1);
  assert.equal(currentDisposals, 1);
});

test("replaced transparent assemblies release their owned resources once while surviving boards retain theirs", () => {
  const group = new THREE.Group();
  const model = createViewerModel(group, () => {});
  model.update([board(), board({ door: true, surface: "aluminum-glass", size: [600, 900, 20] })], materials, "exterior");
  const retained = group.children[0] as THREE.Mesh;
  const owned = group.children[1];
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  owned.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
    resources.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => resources.add(material));
  });
  const disposed = new Map([...resources].map((resource) => [resource, 0]));
  resources.forEach((resource) => resource.addEventListener("dispose", () => disposed.set(resource, disposed.get(resource)! + 1)));
  let retainedDisposals = 0;
  retained.geometry.addEventListener("dispose", () => retainedDisposals++);
  model.update([board(), board({ door: true })], materials, "exterior");
  assert.equal(group.children[0], retained);
  assert.equal(retainedDisposals, 0);
  assert.ok([...disposed.values()].every((count) => count === 1));
  model.dispose(); model.dispose();
  assert.ok([...disposed.values()].every((count) => count === 1));
  assert.equal(retainedDisposals, 1);
});

test("edits that remain inside the camera preserve manual orbit, target, orientation and zoom exactly", () => {
  const camera = new THREE.PerspectiveCamera(34, 1.4, 0.01, 200);
  const target = new THREE.Vector3(0.15, 0.8, -0.1);
  camera.position.set(4.1, 2.8, 5.2);
  camera.lookAt(target); camera.updateMatrixWorld();
  const position = camera.position.toArray(), orientation = camera.quaternion.toArray(), center = target.toArray();
  for (let step = 0; step <= 100; step++) {
    const width = 0.6 + step / 100, height = 0.9 + step / 100;
    const bounds = new THREE.Box3(new THREE.Vector3(-width / 2, 0, -0.2), new THREE.Vector3(width / 2, height, 0.2));
    assert.equal(preserveViewerCamera(camera, target, bounds), false);
  }
  assert.deepEqual(camera.position.toArray(), position);
  assert.deepEqual(camera.quaternion.toArray(), orientation);
  assert.deepEqual(target.toArray(), center);
});

test("a large edit only retreats along the existing orbit, and shrinking again does not zoom back in", () => {
  const camera = new THREE.PerspectiveCamera(34, 0.8, 0.01, 200);
  const target = new THREE.Vector3(0.2, 0.9, 0);
  camera.position.set(2, 2.1, 3);
  camera.lookAt(target); camera.updateMatrixWorld();
  const direction = camera.position.clone().sub(target).normalize();
  const orientation = camera.quaternion.toArray(), center = target.toArray();
  const large = new THREE.Box3(new THREE.Vector3(-3, 0, -1.5), new THREE.Vector3(3, 4, 1.5));
  assert.equal(preserveViewerCamera(camera, target, large), true);
  assert.ok(camera.position.clone().sub(target).normalize().distanceTo(direction) < 1e-9);
  assert.deepEqual(target.toArray(), center);
  assert.deepEqual(camera.quaternion.toArray(), orientation);
  const backedOut = camera.position.toArray();
  const small = new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.2), new THREE.Vector3(0.3, 0.9, 0.2));
  assert.equal(preserveViewerCamera(camera, target, small), false);
  assert.deepEqual(camera.position.toArray(), backedOut);
});
