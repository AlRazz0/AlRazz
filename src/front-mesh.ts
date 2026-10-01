import * as THREE from "three";
import type { VisualPanel } from "../lib/public-geometry";

/** Shared door assembly; all elements rotate around the same left hinge. */
export function createTransparentFront(panel: VisualPanel, handle: string) {
  const [width, height, depth] = panel.size.map((value) => value / 1000);
  const framed = panel.surface === "aluminum-glass";
  const frameWidth = framed ? 0.02 : 0;
  const hinge = new THREE.Group();
  hinge.position.fromArray(panel.position.map((value) => value / 1000));
  const rotation = panel.rotationY ?? 0;
  hinge.position.add(
    new THREE.Vector3(-width / 2, 0, 0).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      rotation,
    ),
  );
  hinge.rotation.y = rotation;
  hinge.userData.closedRotationY = rotation;
  hinge.name = "transparent-front-hinge";
  const assembly = new THREE.Group();
  assembly.position.x = width / 2;
  hinge.add(assembly);
  const pane = new THREE.Mesh(
    new THREE.BoxGeometry(
      width - frameWidth * 2,
      height - frameWidth * 2,
      0.006,
    ),
    new THREE.MeshPhysicalMaterial({
      color: 0xcce1df,
      roughness: 0.1,
      metalness: 0,
      transparent: true,
      opacity: 0.28,
      transmission: 0.12,
      thickness: 0.006,
      ior: 1.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  pane.name = "glass-pane";
  pane.receiveShadow = false;
  pane.castShadow = false;
  assembly.add(pane);
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(pane.geometry),
    new THREE.LineBasicMaterial({
      color: 0x7baba5,
      transparent: true,
      opacity: 0.65,
    }),
  );
  pane.add(edge);
  if (framed) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xa1a5a5,
      roughness: 0.3,
      metalness: 0.85,
    });
    const rails = [
      {
        size: [frameWidth, height, depth],
        position: [-(width - frameWidth) / 2, 0, 0],
      },
      {
        size: [frameWidth, height, depth],
        position: [(width - frameWidth) / 2, 0, 0],
      },
      {
        size: [width - frameWidth * 2, frameWidth, depth],
        position: [0, (height - frameWidth) / 2, 0],
      },
      {
        size: [width - frameWidth * 2, frameWidth, depth],
        position: [0, -(height - frameWidth) / 2, 0],
      },
    ];
    rails.forEach(({ size, position }) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(...(size as [number, number, number])),
        material,
      );
      rail.name = "aluminum-frame";
      rail.position.fromArray(position);
      rail.castShadow = rail.receiveShadow = true;
      assembly.add(rail);
    });
  }
  if (handle !== "push") {
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.009, 0.09, 0.025),
      new THREE.MeshStandardMaterial({
        color: 0x3a3733,
        metalness: 0.75,
        roughness: 0.3,
      }),
    );
    grip.name = "front-handle";
    grip.position.set(width / 2 - 0.03, 0, depth / 2 + 0.0125);
    grip.castShadow = true;
    assembly.add(grip);
  }
  return hinge;
}

export function createPlaceholder(panel: VisualPanel) {
  const geometry = new THREE.BoxGeometry(
    ...(panel.size.map((value) => value / 1000) as [number, number, number]),
  );
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xabaea7,
      roughness: 0.9,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    }),
  );
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({
      color: 0x7f867d,
      transparent: true,
      opacity: 0.5,
    }),
  );
  mesh.add(edges);
  mesh.position.fromArray(panel.position.map((value) => value / 1000));
  mesh.rotation.y = panel.rotationY ?? 0;
  return mesh;
}
