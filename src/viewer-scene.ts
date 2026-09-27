import * as THREE from "three";

export const REFERENCE_HEIGHT = 1.7;
export const STUDIO_COLOR = 0xeee9df;

export function disposeObjects(group: THREE.Object3D) {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => material.dispose());
    }
  });
}

export function clearGroup(group: THREE.Group) {
  disposeObjects(group);
  group.clear();
}

/** An architectural silhouette, measured in metres independently of the product. */
export function createScaleReference() {
  const group = new THREE.Group();
  group.name = "Referencia humana de 1,70 m — ambientación";
  const outline = new THREE.Shape();
  outline.moveTo(0, 1.7);
  outline.bezierCurveTo(0.063, 1.705, 0.091, 1.66, 0.087, 1.605);
  outline.bezierCurveTo(0.083, 1.553, 0.065, 1.522, 0.035, 1.503);
  outline.lineTo(0.036, 1.466);
  outline.bezierCurveTo(0.072, 1.446, 0.143, 1.436, 0.184, 1.405);
  outline.bezierCurveTo(0.211, 1.375, 0.213, 1.288, 0.231, 1.22);
  outline.bezierCurveTo(0.247, 1.147, 0.253, 1.069, 0.268, 0.993);
  outline.bezierCurveTo(0.281, 0.964, 0.282, 0.928, 0.268, 0.91);
  outline.bezierCurveTo(0.258, 0.895, 0.242, 0.905, 0.24, 0.926);
  outline.lineTo(0.223, 0.958);
  outline.bezierCurveTo(0.204, 1.018, 0.194, 1.1, 0.177, 1.16);
  outline.lineTo(0.157, 1.282);
  outline.bezierCurveTo(0.143, 1.235, 0.117, 1.16, 0.121, 1.087);
  outline.bezierCurveTo(0.124, 1.02, 0.16, 0.967, 0.15, 0.87);
  outline.bezierCurveTo(0.145, 0.74, 0.124, 0.629, 0.119, 0.531);
  outline.bezierCurveTo(0.109, 0.432, 0.13, 0.27, 0.119, 0.105);
  outline.lineTo(0.138, 0.047);
  outline.bezierCurveTo(0.152, 0.028, 0.162, 0, 0.132, 0);
  outline.lineTo(0.056, 0);
  outline.bezierCurveTo(0.038, 0.002, 0.037, 0.026, 0.045, 0.064);
  outline.lineTo(0.043, 0.119);
  outline.bezierCurveTo(0.024, 0.265, 0.028, 0.445, 0.031, 0.529);
  outline.bezierCurveTo(0.025, 0.652, 0.017, 0.744, 0, 0.799);
  outline.bezierCurveTo(-0.025, 0.711, -0.058, 0.598, -0.071, 0.514);
  outline.bezierCurveTo(-0.071, 0.401, -0.055, 0.237, -0.069, 0.102);
  outline.lineTo(-0.052, 0.035);
  outline.bezierCurveTo(-0.046, 0.011, -0.055, 0, -0.078, 0);
  outline.lineTo(-0.168, 0);
  outline.bezierCurveTo(-0.194, 0, -0.198, 0.024, -0.168, 0.043);
  outline.lineTo(-0.141, 0.095);
  outline.bezierCurveTo(-0.145, 0.261, -0.172, 0.446, -0.155, 0.54);
  outline.bezierCurveTo(-0.15, 0.653, -0.174, 0.807, -0.162, 0.9);
  outline.bezierCurveTo(-0.155, 0.99, -0.115, 1.048, -0.119, 1.106);
  outline.lineTo(-0.155, 1.28);
  outline.bezierCurveTo(-0.169, 1.21, -0.182, 1.119, -0.19, 1.058);
  outline.lineTo(-0.218, 0.956);
  outline.bezierCurveTo(-0.22, 0.925, -0.226, 0.903, -0.243, 0.903);
  outline.bezierCurveTo(-0.265, 0.91, -0.267, 0.944, -0.255, 0.981);
  outline.bezierCurveTo(-0.248, 1.05, -0.241, 1.15, -0.226, 1.226);
  outline.bezierCurveTo(-0.212, 1.305, -0.212, 1.366, -0.186, 1.406);
  outline.bezierCurveTo(-0.151, 1.437, -0.078, 1.448, -0.04, 1.466);
  outline.lineTo(-0.038, 1.504);
  outline.bezierCurveTo(-0.07, 1.526, -0.082, 1.565, -0.085, 1.613);
  outline.bezierCurveTo(-0.088, 1.668, -0.061, 1.7, 0, 1.7);
  outline.closePath();

  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: 0.065,
    bevelEnabled: true,
    bevelSize: 0.006,
    bevelThickness: 0.006,
    bevelSegments: 3,
    curveSegments: 16,
    steps: 1,
  });
  // Include the bevel in the measurement: the feet are y=0 and the crown y=1.70.
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  geometry.translate(0, -bounds.min.y, -0.0325);
  geometry.scale(1, REFERENCE_HEIGHT / (bounds.max.y - bounds.min.y), 1);
  geometry.computeBoundingBox();
  const person = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xfffdf7,
      roughness: 1,
      transparent: true,
      opacity: 0.64,
      depthWrite: false,
    }),
  );
  person.renderOrder = 1;
  group.add(person);
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(0.52, 0.26),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader:
        "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader:
        "varying vec2 vUv; void main() { float a = (1.0 - smoothstep(0.05, 0.5, distance(vUv, vec2(0.5)))) * 0.12; gl_FragColor = vec4(0.31, 0.28, 0.23, a); }",
    }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.001;
  group.add(contact);
  return group;
}

/** Set dressing is a separate group: it never enters furniture panels or prices. */
export function createStudio(width: number, depth: number) {
  const group = new THREE.Group();
  group.name = "Estudio — ambientación";
  const wallZ = -depth / 2 - 1.05;
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 30),
    new THREE.MeshStandardMaterial({ color: 0xe6e0d5, roughness: 1 }),
  );
  wall.position.set(0, 14.98, wallZ);
  wall.receiveShadow = true;
  group.add(wall);

  const decoration = new THREE.Group();
  decoration.position.set(-width / 2 - 0.55, 0, -depth / 2 - 0.2);
  const profile = [
    [0, 0],
    [0.09, 0],
    [0.125, 0.055],
    [0.15, 0.15],
    [0.143, 0.23],
    [0.1, 0.29],
    [0.057, 0.315],
    [0.047, 0.39],
    [0.04, 0.4],
    [0.034, 0.392],
    [0.039, 0.32],
    [0.084, 0.28],
    [0.122, 0.225],
    [0.128, 0.15],
    [0.102, 0.063],
    [0.073, 0.025],
    [0, 0.025],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const vase = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 36),
    new THREE.MeshStandardMaterial({ color: 0xbba892, roughness: 0.95 }),
  );
  vase.castShadow = true;
  vase.receiveShadow = true;
  decoration.add(vase);
  const stemMaterial = new THREE.MeshStandardMaterial({
    color: 0x8e8d6d,
    roughness: 1,
  });
  for (let i = 0; i < 3; i++) {
    const points = [
      new THREE.Vector3(0, 0.34, 0),
      new THREE.Vector3((i - 1) * 0.035, 0.59, 0.015),
      new THREE.Vector3((i - 1) * 0.1 + 0.035, 0.77 + i * 0.04, -0.01),
    ];
    const curve = new THREE.CatmullRomCurve3(points);
    const stem = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 12, 0.0025, 5, false),
      stemMaterial,
    );
    decoration.add(stem);
    for (let j = 0; j < 4; j++) {
      const point = curve.getPoint(0.44 + j * 0.145);
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(1, 10, 6),
        stemMaterial,
      );
      const side = (i + j) % 2 ? -1 : 1;
      leaf.scale.set(0.035, 0.009, 0.014);
      leaf.rotation.z = side * 0.55;
      leaf.position.copy(point).add(new THREE.Vector3(side * 0.024, 0.012, 0));
      decoration.add(leaf);
    }
  }
  group.add(decoration);
  return { group, decoration };
}

/** Keep the reference alongside the product, including after orbiting to its side. */
export function placeReference(
  reference: THREE.Group,
  direction: THREE.Vector3,
  width: number,
  depth: number,
) {
  const right = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
  if (right.lengthSq() < 0.001) right.set(1, 0, 0);
  const productExtent =
    (Math.abs(right.x) * width + Math.abs(right.z) * depth) / 2;
  reference.position.copy(right.multiplyScalar(productExtent + 0.58));
  reference.rotation.y = Math.atan2(direction.x, direction.z);
}

export function fitCamera(
  camera: THREE.PerspectiveCamera,
  bounds: THREE.Box3,
  direction: THREE.Vector3,
) {
  const center = bounds.getCenter(new THREE.Vector3());
  const right = new THREE.Vector3()
    .crossVectors(new THREE.Vector3(0, 1, 0), direction)
    .normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanX = tanY * camera.aspect;
  let distance = 0.5;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const offset = new THREE.Vector3(x, y, z).sub(center);
        distance = Math.max(
          distance,
          offset.dot(direction) + (Math.abs(offset.dot(right)) * 1.16) / tanX,
          offset.dot(direction) + (Math.abs(offset.dot(up)) * 1.16) / tanY,
        );
      }
    }
  }
  camera.position.copy(center).addScaledVector(direction, distance);
  return { center, distance };
}
