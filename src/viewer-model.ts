import * as THREE from "three";
import { withDoorHinges, doorLatchDirection } from "../lib/door-hinges.ts";
import type { VisualPanel } from "../lib/public-geometry.ts";
import type { PublicMaterial } from "./types.ts";
import { createDoorPivot, createPlaceholder, createTransparentFront } from "./front-mesh.ts";
import { doorRotation } from "./door-preview.ts";
import { createSwatchTextures } from "./swatch-textures.ts";
import { createCameraMotion } from "./camera-motion.ts";

type Mesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
type Finish = { material: THREE.MeshStandardMaterial; lines: THREE.LineBasicMaterial; color: string };
type Entry = {
  kind: string;
  root: THREE.Object3D;
  leaf?: THREE.Object3D;
  mesh?: Mesh;
  lines?: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  grip?: THREE.Object3D;
  pane?: Mesh;
  paneSize?: [number, number];
  rails?: { mesh: Mesh; size: [number, number, number]; side: "left" | "right" | "top" | "bottom" }[];
  owned: boolean;
  signature: string;
  layout: string;
};
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Keep manual orbit, target and zoom; only retreat when edited content would clip. */
export function preserveViewerCamera(camera: THREE.PerspectiveCamera, target: THREE.Vector3, bounds: THREE.Box3) {
  if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) return false;
  camera.updateMatrixWorld();
  let fits = true;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const point = new THREE.Vector3(x, y, z).project(camera);
    if (Math.abs(point.x) > 1 / 1.16 || Math.abs(point.y) > 1 / 1.16 || point.z < -1 || point.z > 1) fits = false;
  }
  if (fits) return false;
  const pose = createCameraMotion(camera, target, camera.position, target)(1, bounds);
  if (pose.radius <= camera.position.distanceTo(target) + 1e-7) return false;
  camera.position.copy(pose.position);
  camera.updateMatrixWorld();
  return true;
}

/** Dispose an owned assembly exactly once even when its frame shares a material. */
function disposeAssembly(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
    geometries.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

/** Only visual transforms change here; server panels and their 18 mm cuts stay intact. */
export function createViewerModel(
  group: THREE.Group,
  invalidate: () => void,
  anisotropy = 1,
  loadTexture?: (path: string) => Promise<THREE.Texture>,
) {
  const boardGeometry = new THREE.BoxGeometry(1, 1, 1);
  const boardEdges = new THREE.EdgesGeometry(boardGeometry);
  const rodGeometry = new THREE.CylinderGeometry(1, 1, 1, 24);
  const gripGeometry = new THREE.BoxGeometry(0.009, 0.09, 0.025);
  const metalMaterial = new THREE.MeshStandardMaterial({ color: "#a8aba8", roughness: 0.28, metalness: 0.8 });
  const gripMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3733, metalness: 0.65, roughness: 0.35 });
  const finishes = new Map<string, Finish>();
  const swatches = createSwatchTextures(invalidate, anisotropy, loadTexture);
  let entries: Entry[] = [];
  let disposed = false;

  function finishFor(panel: VisualPanel, materials: ReadonlyMap<string, PublicMaterial>) {
    const finish = materials.get(panel.material);
    const path = finish?.renderTexture === false ? undefined : finish?.swatch;
    const color = finish?.color || "#b99469";
    const key = JSON.stringify([panel.material, path ?? ""]);
    let cached = finishes.get(key);
    if (!cached) {
      cached = {
        material: new THREE.MeshStandardMaterial({ color, roughness: 0.77, metalness: 0 }),
        lines: new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.72), transparent: true, opacity: 0.5 }),
        color,
      };
      finishes.set(key, cached);
      swatches.attach(cached.material, path);
    } else if (cached.color !== color) {
      cached.color = color;
      if (!cached.material.map) cached.material.color.set(color);
      cached.lines.color.set(color).multiplyScalar(0.72);
    }
    return { ...cached, key: `${key}:${color}` };
  }

  function createEntry(panel: VisualPanel, kind: string, material: Finish): Entry {
    if (kind === "placeholder") {
      const root = createPlaceholder({ ...panel, size: [1000, 1000, 1000], position: [0, 0, 0], rotationY: 0 });
      return { kind, root, mesh: root, owned: true, signature: "", layout: "" };
    }
    if (kind.startsWith("glass") || kind.startsWith("aluminum-glass")) {
      const root = createTransparentFront(panel, kind.endsWith("-grip") ? "exterior" : "push");
      const pane = root.getObjectByName("glass-pane") as Mesh;
      const parameters = (pane.geometry as THREE.BoxGeometry).parameters;
      const leaf = root.children[0];
      const rails: NonNullable<Entry["rails"]> = [];
      leaf.traverse((object) => {
        if (object.name !== "aluminum-frame" || !(object instanceof THREE.Mesh)) return;
        const size = (object.geometry as THREE.BoxGeometry).parameters;
        rails.push({ mesh: object as Mesh, size: [size.width, size.height, size.depth],
          side: object.position.x < 0 ? "left" : object.position.x > 0 ? "right" : object.position.y > 0 ? "top" : "bottom" });
      });
      return { kind, root, leaf, pane, paneSize: [parameters.width, parameters.height], rails,
        grip: root.getObjectByName("front-handle"), owned: true, signature: "", layout: "" };
    }
    if (kind === "rod") {
      const mesh = new THREE.Mesh(rodGeometry, metalMaterial);
      mesh.castShadow = mesh.receiveShadow = true;
      return { kind, root: mesh, mesh, owned: false, signature: "", layout: "" };
    }
    const mesh = new THREE.Mesh(boardGeometry, material.material);
    const lines = new THREE.LineSegments(boardEdges, material.lines);
    mesh.add(lines);
    mesh.castShadow = mesh.receiveShadow = true;
    let grip: THREE.Mesh | undefined;
    if (kind === "door-grip") {
      grip = new THREE.Mesh(gripGeometry, gripMaterial);
      grip.name = "front-handle";
      mesh.add(grip);
    }
    return { kind, root: panel.door ? createDoorPivot(panel, mesh) : mesh, leaf: mesh,
      mesh, lines, grip, owned: false, signature: "", layout: "" };
  }

  function positionHinge(entry: Entry, panel: VisualPanel, width: number, amount: number) {
    const direction = doorLatchDirection(panel), rotation = panel.rotationY ?? 0;
    entry.root.position.fromArray(panel.position).multiplyScalar(0.001)
      .add(new THREE.Vector3(-direction * width / 2, 0, 0).applyAxisAngle(Y_AXIS, rotation));
    entry.leaf!.position.set(direction * width / 2, 0, 0);
    entry.leaf!.rotation.y = 0;
    entry.root.userData.closedRotationY = rotation;
    entry.root.userData.hinge = panel.hinge ?? "left";
    entry.root.rotation.y = doorRotation(entry.root as THREE.Group, amount);
  }

  function updateEntry(entry: Entry, panel: VisualPanel, finish: Finish, amount: number) {
    const [width, height, depth] = panel.size.map((value) => value / 1000);
    if (entry.pane) {
      positionHinge(entry, panel, width, amount);
      const frame = panel.surface === "aluminum-glass" ? 0.02 : 0;
      entry.pane.scale.set((width - frame * 2) / entry.paneSize![0], (height - frame * 2) / entry.paneSize![1], 1);
      for (const rail of entry.rails!) {
        const vertical = rail.side === "left" || rail.side === "right";
        rail.mesh.scale.set((vertical ? frame : width - frame * 2) / rail.size[0],
          (vertical ? height : frame) / rail.size[1], depth / rail.size[2]);
        rail.mesh.position.set(rail.side === "left" ? -(width - frame) / 2 : rail.side === "right" ? (width - frame) / 2 : 0,
          rail.side === "top" ? (height - frame) / 2 : rail.side === "bottom" ? -(height - frame) / 2 : 0, 0);
      }
      entry.grip?.position.set(doorLatchDirection(panel) * (width / 2 - 0.03), 0, depth / 2 + 0.0125);
      return;
    }
    const mesh = entry.mesh!;
    if (entry.kind === "rod") {
      mesh.scale.set(height / 2, width, height / 2);
      mesh.rotation.set(0, panel.rotationY ?? 0, Math.PI / 2);
      mesh.position.fromArray(panel.position).multiplyScalar(0.001);
      return;
    }
    mesh.scale.set(width, height, depth);
    if (entry.kind === "placeholder") {
      mesh.position.fromArray(panel.position).multiplyScalar(0.001);
      mesh.rotation.y = panel.rotationY ?? 0;
      return;
    }
    mesh.material = finish.material;
    entry.lines!.material = finish.lines;
    if (panel.door) positionHinge(entry, panel, width, amount);
    else {
      mesh.position.fromArray(panel.position).multiplyScalar(0.001);
      mesh.rotation.y = panel.rotationY ?? 0;
    }
    // The board scales, but the exterior hardware keeps its physical size/inset.
    if (entry.grip) {
      entry.grip.scale.set(1 / width, 1 / height, 1 / depth);
      entry.grip.position.set(doorLatchDirection(panel) * (width / 2 - 0.045) / width, 0, 0.02 / depth);
    }
  }

  function remove(entry: Entry) {
    entry.root.removeFromParent();
    if (entry.owned) disposeAssembly(entry.root);
  }

  return {
    update(panels: readonly VisualPanel[], materials: readonly PublicMaterial[], handle = "push", amount = 0) {
      if (disposed) return { doors: [] as THREE.Group[], changed: false, boundsChanged: false };
      const materialMap = new Map(materials.map((material) => [material.id, material]));
      let changed = false, boundsChanged = false;
      const doors: THREE.Group[] = [];
      const next = withDoorHinges(panels).map((panel, index) => {
        const hasGrip = (panel.handle ?? handle) !== "push";
        const kind = panel.surface === "placeholder" ? "placeholder" : panel.shape === "cylinder" ? "rod"
          : panel.door && (panel.surface === "glass" || panel.surface === "aluminum-glass") ? `${panel.surface}-${hasGrip ? "grip" : "push"}`
          : panel.door ? `door-${hasGrip ? "grip" : "push"}` : "board";
        const finish = finishFor(panel, materialMap);
        let entry = entries[index];
        if (!entry || entry.kind !== kind) {
          if (entry) remove(entry);
          entry = createEntry(panel, kind, finish);
          group.add(entry.root);
          changed = boundsChanged = true;
        }
        const layout = JSON.stringify([panel.size, panel.position, panel.rotationY ?? 0, panel.hinge, kind]);
        const signature = `${layout}:${finish.key}`;
        if (entry.signature !== signature) {
          boundsChanged ||= entry.layout !== layout;
          updateEntry(entry, panel, finish, amount);
          entry.signature = signature;
          entry.layout = layout;
          changed = true;
        }
        if (panel.door && entry.kind !== "placeholder") doors.push(entry.root as THREE.Group);
        return entry;
      });
      for (let index = next.length; index < entries.length; index++) { remove(entries[index]); changed = boundsChanged = true; }
      entries = next;
      return { doors, changed, boundsChanged };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      entries.forEach(remove);
      entries = [];
      swatches.dispose();
      for (const finish of finishes.values()) { finish.material.dispose(); finish.lines.dispose(); }
      finishes.clear();
      for (const geometry of [boardGeometry, boardEdges, rodGeometry, gripGeometry]) geometry.dispose();
      metalMaterial.dispose(); gripMaterial.dispose();
    },
  };
}
