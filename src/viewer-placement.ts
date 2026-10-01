import * as THREE from "three";
import type { PlacementSlot } from "./kitchen-slots";

/** Slots are display controls, excluded from manufacturing and captured images. */
export function placementBounds(slots: readonly PlacementSlot[]) {
  const bounds = new THREE.Box3();
  for (const slot of slots) if (slot.position.every(Number.isFinite)) {
    const point = new THREE.Vector3(...slot.position).multiplyScalar(0.001);
    bounds.expandByPoint(point.clone().addScalar(0.075));
    bounds.expandByPoint(point.clone().addScalar(-0.075));
  }
  return bounds;
}

export function projectPlacementSlots(slots: readonly PlacementSlot[], camera: THREE.PerspectiveCamera, width: number, height: number) {
  if (width < 60 || height < 60 || !Number.isFinite(width + height)) return [];
  const placed: { id: string; x: number; y: number; anchorX: number; anchorY: number }[] = [];
  for (const slot of slots) {
    if (!slot.position.every(Number.isFinite)) continue;
    const point = new THREE.Vector3(...slot.position).multiplyScalar(0.001);
    const cameraPoint = point.clone().applyMatrix4(camera.matrixWorldInverse);
    const projected = point.project(camera);
    if (cameraPoint.z >= 0 || projected.z < -1 || projected.z > 1 || !Number.isFinite(projected.x + projected.y + projected.z)) continue;
    const anchorX = (projected.x + 1) * width / 2, anchorY = (1 - projected.y) * height / 2;
    if (anchorX < 0 || anchorX > width || anchorY < 0 || anchorY > height) continue;
    const initial = { x: THREE.MathUtils.clamp(anchorX, 26, width - 26), y: THREE.MathUtils.clamp(anchorY, 26, height - 26) };
    const candidates = [[0, 0], [0, -50], [0, 50], [-50, 0], [50, 0], [-50, -50], [50, -50], [-50, 50], [50, 50]];
    const candidate = candidates.map(([dx, dy]) => ({ x: initial.x + dx, y: initial.y + dy }))
      .find(candidate => candidate.x >= 26 && candidate.x <= width - 26 && candidate.y >= 26 && candidate.y <= height - 26 && placed.every(other => Math.hypot(other.x - candidate.x, other.y - candidate.y) >= 48));
    if (!candidate) continue;
    placed.push({ id: slot.id, ...candidate, anchorX, anchorY });
  }
  return placed;
}

export function createPlacementOverlay(container: HTMLElement) {
  const layer = document.createElement("div");
  layer.className = "viewer-placements";
  layer.setAttribute("role", "group");
  layer.setAttribute("aria-label", "Espacios disponibles para añadir muebles");
  container.appendChild(layer);
  let slots: readonly PlacementSlot[] = [];
  let onSelect: ((id: string) => void) | undefined;
  const buttons = new Map<string, { button: HTMLButtonElement; leader: HTMLSpanElement }>();
  return {
    update(next: readonly PlacementSlot[], callback?: (id: string) => void) {
      slots = callback ? next : [];
      onSelect = callback;
      const ids = new Set(slots.map(slot => slot.id));
      for (const [id, entry] of buttons) if (!ids.has(id)) { entry.button.remove(); entry.leader.remove(); buttons.delete(id); }
      for (const slot of slots) {
        let entry = buttons.get(slot.id);
        if (!entry) {
          const button = document.createElement("button");
          const leader = document.createElement("span");
          button.type = "button";
          button.className = "viewer-placement";
          button.textContent = "+";
          button.hidden = true;
          button.addEventListener("pointerdown", event => event.stopPropagation());
          button.addEventListener("click", event => { event.stopPropagation(); onSelect?.(slot.id); });
          leader.className = "viewer-placement-leader";
          leader.setAttribute("aria-hidden", "true");
          layer.appendChild(leader);
          layer.appendChild(button);
          entry = { button, leader };
          buttons.set(slot.id, entry);
        }
        entry.button.setAttribute("aria-label", slot.label);
        entry.button.title = slot.label;
      }
      layer.hidden = !slots.length;
    },
    draw(camera: THREE.PerspectiveCamera, width: number, height: number) {
      const projected = new Map(projectPlacementSlots(slots, camera, width, height).map(point => [point.id, point]));
      for (const [id, { button, leader }] of buttons) {
        const point = projected.get(id);
        button.hidden = !point;
        leader.hidden = !point;
        if (!point) continue;
        button.style.left = `${point.x}px`;
        button.style.top = `${point.y}px`;
        const dx = point.x - point.anchorX, dy = point.y - point.anchorY;
        leader.style.left = `${point.anchorX}px`;
        leader.style.top = `${point.anchorY}px`;
        leader.style.width = `${Math.hypot(dx, dy)}px`;
        leader.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      }
    },
    dispose() { buttons.clear(); layer.remove(); },
  };
}
