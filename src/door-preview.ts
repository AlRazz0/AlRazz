import * as THREE from "three";

export const DOOR_OPEN_ANGLE = -Math.PI * 0.58;

/** One stable visual envelope for closed, open and intermediate door positions. */
export function doorPreviewBounds(
  root: THREE.Group,
  doors: readonly THREE.Group[],
) {
  if (!doors.length) return new THREE.Box3().setFromObject(root);
  const rotations = doors.map((door) => door.rotation.y);
  const bounds = new THREE.Box3();
  const steps = 16;
  let radius = 0;
  try {
    doors.forEach((door) => {
      door.rotation.y = door.userData.closedRotationY ?? 0;
    });
    root.updateMatrixWorld(true);
    for (const door of doors) {
      const box = new THREE.Box3().setFromObject(door);
      const pivot = door.getWorldPosition(new THREE.Vector3());
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z])
            radius = Math.max(
              radius,
              pivot.distanceTo(new THREE.Vector3(x, y, z)),
            );
    }
    for (let step = 0; step <= steps; step++) {
      doors.forEach((door) => {
        door.rotation.y =
          (door.userData.closedRotationY ?? 0) +
          (DOOR_OPEN_ANGLE * step) / steps;
      });
      bounds.union(new THREE.Box3().setFromObject(root));
    }
    // Bound the arc between samples as well, including small protruding handles.
    return bounds.expandByScalar(
      radius * (1 - Math.cos(Math.abs(DOOR_OPEN_ANGLE) / steps / 2)),
    );
  } finally {
    doors.forEach((door, index) => {
      door.rotation.y = rotations[index];
    });
    root.updateMatrixWorld(true);
  }
}
