import * as THREE from "three";
import type { Construction, Product } from "../lib/furniture.ts";

export type ShowroomStyling = { group: THREE.Group; dispose(): void };

/** Set dressing only. Mount in the scene, never in the measured furniture group. */
export function createShowroomStyling(
  bounds: THREE.Box3,
  kind: Construction["kind"] | undefined,
  category?: Product["category"],
): ShowroomStyling {
  const group = new THREE.Group();
  group.name = "Ambientación arquitectónica · fuera del producto";
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const ownedMaterials = new Set<THREE.Material>();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    group.removeFromParent(); group.clear();
    geometries.forEach(geometry => geometry.dispose()); geometries.clear();
    ownedMaterials.forEach(material => material.dispose()); ownedMaterials.clear(); materials.clear();
  };
  const dressing = { group, dispose };
  if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) return dressing;
  const box = bounds.clone();
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  if (Math.min(size.x, size.y, size.z) <= 0) return dressing;
  const floorY = box.min.y - .002;
  const wallZ = box.min.z - .48;
  const kitchen = category === "Cocina" || kind === "kitchen-base";
  const tall = kind === "wardrobe" || size.y >= 1.6;
  const desk = kind === "desk" || kind === "desk-storage";

  function material(color: string, roughness = .94) {
    const key = `${color}:${roughness}`;
    let result = materials.get(key);
    if (!result) {
      result = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
      materials.set(key, result);
      ownedMaterials.add(result);
    }
    return result;
  }
  function mesh(geometry: THREE.BufferGeometry, surface: THREE.MeshStandardMaterial, name: string) {
    geometries.add(geometry);
    const result = new THREE.Mesh(geometry, surface);
    result.name = `Ambientación · ${name}`;
    result.receiveShadow = true;
    group.add(result);
    return result;
  }

  // A painted plaster reveal touches the existing wall and floor. It is not a
  // backsplash, a cabinet panel or an asserted installation height.
  const revealWidth = Math.max(.15, Math.min(.3, size.x * .16));
  const revealHeight = Math.max(2.8, size.y + .45);
  const reveal = mesh(new THREE.PlaneGeometry(revealWidth, revealHeight), material(kitchen ? "#d5d0bd" : "#d7ccba"), "cambio de tono en la pared");
  reveal.position.set(box.min.x - .09, floorY + revealHeight / 2, wallZ + .0005);

  // Kitchen products do not carry their mounting elevation. Keep their dressing
  // architectural; do not place a supposedly installed upper cabinet or props.
  if (kitchen) return dressing;

  if (kind !== "wardrobe") {
    const width = Math.max(.36, Math.min(.6, size.x * (desk ? .38 : .32)));
    const height = width * 1.23;
    const rim = .012;
    const x = center.x + size.x * (kind === "open-shelf" ? .1 : .08);
    const y = tall ? floorY + size.y * .6 : box.max.y + height * .35;
    const frame = mesh(new THREE.BoxGeometry(width, height, .018), material("#947c5e", .8), "marco de lámina abstracta");
    frame.position.set(x, y, wallZ + .0095); frame.castShadow = true;
    const paperWidth = width - rim * 2, paperHeight = height - rim * 2;
    const paper = mesh(new THREE.PlaneGeometry(paperWidth, paperHeight), material("#f0e8d8"), "papel de la lámina");
    paper.position.set(x, y, wallZ + .019);

    // Original, deterministic abstract print: three flat pigments on the paper.
    const archWidth = paperWidth * .57, archHeight = paperHeight * .7;
    const arch = new THREE.Shape();
    arch.moveTo(-archWidth / 2, -archHeight / 2);
    arch.lineTo(archWidth / 2, -archHeight / 2);
    arch.lineTo(archWidth / 2, 0);
    arch.quadraticCurveTo(archWidth / 2, archHeight / 2, 0, archHeight / 2);
    arch.quadraticCurveTo(-archWidth / 2, archHeight / 2, -archWidth / 2, 0);
    arch.closePath();
    const pigment = mesh(new THREE.ShapeGeometry(arch, 6), material("#b68b6f"), "pigmento de la lámina");
    pigment.position.set(x - paperWidth * .12, y - paperHeight * .04, wallZ + .0192);
    const circle = mesh(new THREE.CircleGeometry(paperWidth * .16, 24), material("#7b8066"), "acento oliva de la lámina");
    circle.position.set(x + paperWidth * .22, y + paperHeight * .2, wallZ + .0194);
    const line = mesh(new THREE.PlaneGeometry(paperWidth * .3, paperHeight * .055), material("#cfb691"), "trazo de la lámina");
    line.position.set(x + paperWidth * .18, y - paperHeight * .29, wallZ + .0196);
  }

  // Ceramic and branches sit on the real floor, wholly behind the product's
  // back plane and outside its side. Front-opening leaves cannot sweep into it.
  const vaseHeight = Math.max(.28, Math.min(.42, size.y * .2));
  const scale = vaseHeight / .37, radius = .115 * scale;
  const vaseX = box.max.x + radius + .105, vaseZ = box.min.z - .24;
  const profile = [[0, 0], [.055, 0], [.085, .025], [.115, .12], [.1, .24], [.055, .31],
    [.042, .35], [.045, .37], [.037, .37], [.035, .35], [.045, .315], [.085, .24], [.099, .12], [.07, .035], [0, .035]];
  const vase = mesh(new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 24), material("#bba083", .88), "jarrón de cerámica en el suelo");
  vase.scale.setScalar(scale); vase.position.set(vaseX, floorY, vaseZ); vase.castShadow = true;
  // Contact remains legible even when the furniture shades this corner of the room.
  const contactGeometry = new THREE.PlaneGeometry(radius * 2.7, radius * 2.7);
  geometries.add(contactGeometry);
  const contactMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    vertexShader: "varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "varying vec2 v;void main(){float a=(1.-smoothstep(.05,1.,length((v-.5)*2.)))*.24;gl_FragColor=vec4(.2,.16,.11,a);}" });
  ownedMaterials.add(contactMaterial);
  const contact = new THREE.Mesh(contactGeometry, contactMaterial);
  contact.name = "Ambientación · sombra de contacto de la cerámica";
  contact.rotation.x = -Math.PI / 2; contact.position.set(vaseX, floorY + .0012, vaseZ); group.add(contact);
  const leafGeometry = new THREE.SphereGeometry(1, 8, 4);
  geometries.add(leafGeometry);
  const leaves = new THREE.InstancedMesh(leafGeometry, material("#858568"), 4);
  leaves.name = "Ambientación · hojas secas del jarrón";
  group.add(leaves);
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < 2; index++) {
    const direction = index === 0 ? -1 : 1;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(vaseX, floorY + vaseHeight * .78, vaseZ),
      new THREE.Vector3(vaseX + direction * .018, floorY + vaseHeight + .1, vaseZ),
      new THREE.Vector3(vaseX + direction * .06, floorY + vaseHeight + .23 - index * .035, vaseZ + .014),
    ]);
    mesh(new THREE.TubeGeometry(curve, 8, .0016, 4, false), material("#6c7156"), "rama en el jarrón");
    for (let leaf = 0; leaf < 2; leaf++) {
      const point = curve.getPoint(.6 + leaf * .2);
      point.x += direction * .017;
      matrix.compose(point, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, .15, direction * .35)), new THREE.Vector3(.025, .007, .01));
      leaves.setMatrixAt(index * 2 + leaf, matrix);
    }
  }
  leaves.instanceMatrix.needsUpdate = true;
  return dressing;
}
