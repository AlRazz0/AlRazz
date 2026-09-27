import * as THREE from "three";

/** Fit each intermediate view, including a target that is still moving. */
export function createCameraMotion(
  camera: THREE.PerspectiveCamera,
  startTarget: THREE.Vector3,
  finalPosition: THREE.Vector3,
  finalTarget: THREE.Vector3,
  maxPolarAngle = Math.PI * 0.49,
) {
  const fromTarget = startTarget.clone();
  const toTarget = finalTarget.clone();
  const from = new THREE.Spherical().setFromVector3(
    camera.position.clone().sub(fromTarget),
  );
  const to = new THREE.Spherical().setFromVector3(
    finalPosition.clone().sub(toTarget),
  );
  const thetaChange = Math.atan2(
    Math.sin(to.theta - from.theta),
    Math.cos(to.theta - from.theta),
  );
  return (
    progress: number,
    bounds: THREE.Box3 | ((direction: THREE.Vector3) => THREE.Box3),
  ) => {
    const target = fromTarget.clone().lerp(toTarget, progress);
    const orbit = new THREE.Spherical(
      1,
      Math.max(
        0.000001,
        Math.min(
          maxPolarAngle,
          THREE.MathUtils.lerp(from.phi, to.phi, progress),
        ),
      ),
      from.theta + thetaChange * progress,
    );
    const direction = new THREE.Vector3().setFromSpherical(orbit);
    const framedBounds =
      typeof bounds === "function" ? bounds(direction) : bounds;
    const right = new THREE.Vector3()
      .crossVectors(camera.up, direction)
      .normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanX = tanY * camera.aspect;
    let radius = Math.max(
      0.5,
      THREE.MathUtils.lerp(from.radius, to.radius, progress),
    );
    if (!framedBounds.isEmpty()) {
      for (const x of [framedBounds.min.x, framedBounds.max.x]) {
        for (const y of [framedBounds.min.y, framedBounds.max.y]) {
          for (const z of [framedBounds.min.z, framedBounds.max.z]) {
            const offset = new THREE.Vector3(x, y, z).sub(target);
            const towardCamera = offset.dot(direction);
            radius = Math.max(
              radius,
              towardCamera + camera.near * 2,
              towardCamera + (Math.abs(offset.dot(right)) * 1.16) / tanX,
              towardCamera + (Math.abs(offset.dot(up)) * 1.16) / tanY,
            );
          }
        }
      }
    }
    return {
      target,
      position: target.clone().addScaledVector(direction, radius),
      direction,
      radius,
    };
  };
}
