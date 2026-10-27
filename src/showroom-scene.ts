import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createViewerModel } from "./viewer-model.ts";
import { fitCamera } from "./viewer-scene.ts";
import { doorRotation } from "./door-preview.ts";
import { createShowroomStyling } from "./showroom-styling.ts";
import type { PublicMaterial, PublicProduct } from "./types";

export type ShowroomPose = "presence" | "front" | "side" | "detail";
export const SHOWROOM_DIRECTIONS: Record<ShowroomPose, readonly [number, number, number]> = {
  presence: [.44, .18, 1], front: [0, .025, 1], side: [.9, .12, .44], detail: [.6, .2, 1],
};

/** One physical presentation style, shared by still portraits and the live tour. */
export function createShowroomRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: "low-power" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const room = new RoomEnvironment();
  const generator = new THREE.PMREMGenerator(renderer);
  let environment: THREE.WebGLRenderTarget;
  try { environment = generator.fromScene(room, .08); }
  catch (error) { renderer.dispose(); renderer.forceContextLoss(); throw error; }
  finally { room.dispose(); generator.dispose(); }
  return { renderer, environment: environment.texture, dispose() {
    environment.dispose(); renderer.dispose(); renderer.forceContextLoss();
  } };
}

export function createShowroomScene(
  product: PublicProduct, materials: readonly PublicMaterial[], environment: THREE.Texture,
  invalidate: () => void, anisotropy = 4,
) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#e8e1d6");
  scene.environment = environment;
  scene.environmentIntensity = .35;
  const group = new THREE.Group(); scene.add(group);
  let shadowsDirty = true;
  const loading: Promise<unknown>[] = [];
  const loader = new THREE.TextureLoader();
  const model = createViewerModel(group, () => { shadowsDirty = true; invalidate(); }, anisotropy, path => {
    const request = loader.loadAsync(path);
    loading.push(request.catch(() => undefined));
    return request;
  }, true);
  const result = model.update(product.preview.geometry, materials, product.defaults.handle);
  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  if (bounds.isEmpty()) { model.dispose(); throw new Error("No hay geometría para presentar este mueble."); }
  const floorY = bounds.min.y - .002;
  const floorMaterial = new THREE.MeshStandardMaterial({ color: "#ded4c3", roughness: .91 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMaterial);
  floor.rotation.x = -Math.PI / 2; floor.position.y = floorY; floor.receiveShadow = true; scene.add(floor);
  const wallMaterial = new THREE.MeshStandardMaterial({ color: "#e7decd", roughness: .98, side: THREE.DoubleSide });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), wallMaterial);
  wall.position.set(center.x, floorY + 10, bounds.min.z - .48);
  wall.receiveShadow = true; scene.add(wall);
  const skirting = new THREE.Mesh(new THREE.BoxGeometry(60, .065, .012), floorMaterial);
  skirting.position.set(center.x, floorY + .0325, bounds.min.z - .47); skirting.receiveShadow = true; scene.add(skirting);
  const styling = createShowroomStyling(bounds, product.construction?.kind, product.category);
  scene.add(styling.group);

  // A window-sized key plus softer fill keeps the interior readable, with real shadows.
  scene.add(new THREE.HemisphereLight(0xfff8e8, 0x766754, .55));
  const key = new THREE.DirectionalLight(0xfff1dd, 2.3);
  key.position.set(center.x - 3.5, Math.max(4.5, size.y + 2), center.z + 4);
  key.target.position.copy(center); key.castShadow = true;
  const extent = Math.max(2, size.x, size.y, size.z) * 1.45;
  Object.assign(key.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: .1, far: 25 });
  key.shadow.mapSize.set(2048, 2048); key.shadow.normalBias = .0015; key.shadow.bias = -.000025;
  key.shadow.radius = 7; key.shadow.intensity = .72; scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xe9f0ff, .75);
  fill.position.set(center.x + 3, center.y + 1.5, center.z + 2); scene.add(fill);

  // A bounded contact vignette grounds the feet without darkening the complete room.
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(.2, size.x) * 1.12, Math.max(.18, size.z) * 1.35),
    new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
      vertexShader: "varying vec2 v; void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: "varying vec2 v; void main(){vec2 p=abs(v-.5)*2.;float a=(1.-smoothstep(.25,1.,max(p.x,p.y)))*.17;gl_FragColor=vec4(.24,.19,.13,a);}" }));
  contact.rotation.x = -Math.PI / 2; contact.position.set(center.x, floorY + .001, center.z); scene.add(contact);

  const camera = new THREE.PerspectiveCamera(32, 4 / 3, .01, 100);
  let openAmount = 0;
  function currentBounds() { return new THREE.Box3().setFromObject(group); }
  function fit(pose: ShowroomPose = "presence") {
    const fitting = currentBounds();
    const direction = new THREE.Vector3(...SHOWROOM_DIRECTIONS[pose]).normalize();
    const framed = fitCamera(camera, fitting, direction);
    if (pose === "detail") {
      const target = fitting.getCenter(new THREE.Vector3());
      target.y = fitting.min.y + size.y * .7;
      camera.position.copy(target).addScaledVector(direction, Math.max(.45, framed.distance * .58));
      camera.lookAt(target); camera.updateMatrixWorld(); return target;
    }
    camera.lookAt(framed.center); camera.updateMatrixWorld(); return framed.center;
  }
  function doors(amount: number) {
    const next = Math.min(1, Math.max(0, amount));
    if (next === openAmount) return;
    openAmount = next; shadowsDirty = true;
    result.doors.forEach(hinge => { hinge.rotation.y = doorRotation(hinge, openAmount); });
  }
  function render(renderer: THREE.WebGLRenderer) {
    // Orbit/zoom only move the camera. Reuse the full-resolution shadow map until
    // a door or material changes, instead of redrawing it for every camera frame.
    renderer.shadowMap.needsUpdate = shadowsDirty;
    renderer.render(scene, camera);
    shadowsDirty = false;
  }
  fit();
  return { scene, camera, group, bounds, fit, doors, render, currentBounds,
    hasDoors: result.doors.length > 0, get openAmount() { return openAmount; },
    ready: Promise.allSettled(loading), dispose() {
      model.dispose(); styling.dispose(); key.shadow.dispose();
      for (const object of [floor, wall, skirting, contact]) object.geometry.dispose();
      floorMaterial.dispose(); wallMaterial.dispose(); contact.material.dispose(); scene.clear();
    } };
}
