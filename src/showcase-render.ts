import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createSwatchTextures } from "./swatch-textures.ts";
import { createStudio, disposeObjects, fitCamera } from "./viewer-scene.ts";
import { DOOR_OPEN_ANGLE } from "./door-preview.ts";
import { createPlaceholder, createTransparentFront } from "./front-mesh.ts";
import type { VisualPanel } from "../lib/public-geometry";
import type { PublicMaterial } from "./types";
import type { Gallery } from "../lib/model-gallery";

export type ShowcaseImage = { label: string; src: string };

/** Use the exact quoted boards and fixtures; decoration never becomes product data. */
export function createShowcaseModel(
  geometry: VisualPanel[],
  materials: PublicMaterial[],
  handle: string,
) {
  const group = new THREE.Group();
  const doors: THREE.Group[] = [];
  const finishes: { material: THREE.MeshStandardMaterial; swatch?: string }[] =
    [];
  for (const panel of geometry) {
    const doorHandle = panel.handle ?? handle;
    if (panel.surface === "placeholder") {
      group.add(createPlaceholder(panel));
      continue;
    }
    if (
      panel.door &&
      (panel.surface === "glass" || panel.surface === "aluminum-glass")
    ) {
      const pivot = createTransparentFront(panel, doorHandle);
      group.add(pivot);
      doors.push(pivot);
      continue;
    }
    const [w, h, d] = panel.size.map((n) => n / 1000);
    const fixture =
      (panel as VisualPanel & { shape?: string }).shape === "cylinder";
    const finish = materials.find((item) => item.id === panel.material);
    const material = new THREE.MeshPhysicalMaterial({
      color: fixture ? 0xb9b9b4 : finish?.color || "#b99469",
      roughness: fixture ? 0.25 : 0.64,
      metalness: fixture ? 0.85 : 0,
      clearcoat: fixture ? 0 : 0.12,
      clearcoatRoughness: 0.65,
    });
    const shape = fixture
      ? new THREE.CylinderGeometry(h / 2, h / 2, w, 24)
      : new RoundedBoxGeometry(
          w,
          h,
          d,
          2,
          Math.min(0.0009, w / 8, h / 8, d / 8),
        );
    if (fixture) shape.rotateZ(Math.PI / 2);
    const mesh = new THREE.Mesh(shape, material);
    mesh.position.fromArray(panel.position.map((n) => n / 1000));
    mesh.rotation.y = panel.rotationY ?? 0;
    mesh.castShadow = mesh.receiveShadow = true;
    if (!fixture)
      finishes.push({
        material,
        swatch: finish?.renderTexture === false ? undefined : finish?.swatch,
      });
    if (panel.door) {
      const pivot = new THREE.Group();
      const closedRotationY = panel.rotationY ?? 0;
      pivot.position
        .copy(mesh.position)
        .add(
          new THREE.Vector3(-w / 2, 0, 0).applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            closedRotationY,
          ),
        );
      pivot.rotation.y = closedRotationY;
      pivot.userData.closedRotationY = closedRotationY;
      mesh.position.set(w / 2, 0, 0);
      mesh.rotation.y = 0;
      pivot.add(mesh);
      if (doorHandle !== "push") {
        const grip = new THREE.Mesh(
          new RoundedBoxGeometry(0.009, 0.09, 0.025, 2, 0.003),
          new THREE.MeshStandardMaterial({
            color: 0x373532,
            metalness: 0.8,
            roughness: 0.26,
          }),
        );
        grip.name = "front-handle";
        grip.position.set(w / 2 - 0.045, 0, 0.02);
        grip.castShadow = true;
        mesh.add(grip);
      }
      doors.push(pivot);
      group.add(pivot);
    } else group.add(mesh);
  }
  return { group, doors, finishes };
}

function floorTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#cbbba3";
  ctx.fillRect(0, 0, 512, 512);
  let seed = 17;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let plank = 0; plank < 8; plank++) {
    ctx.fillStyle = `rgba(115,89,56,${0.035 + random() * 0.09})`;
    ctx.fillRect(plank * 64, 0, 64, 512);
    ctx.fillStyle = "rgba(88,72,48,.12)";
    ctx.fillRect(plank * 64, 0, 1, 512);
    for (let grain = 0; grain < 35; grain++) {
      ctx.strokeStyle = `rgba(108,82,52,${random() * 0.07})`;
      ctx.lineWidth = 0.5 + random();
      ctx.beginPath();
      const x = plank * 64 + random() * 64;
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 4, 140, x - 4, 360, x + 2, 512);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 8);
  return texture;
}

let renderQueue: Promise<unknown> = Promise.resolve();
export function renderShowcase(
  geometry: VisualPanel[],
  materials: PublicMaterial[],
  handle: string,
  style: NonNullable<Gallery["scene"]>,
  signal: AbortSignal,
): Promise<ShowcaseImage[]> {
  const job = renderQueue.then(() =>
    signal.aborted
      ? []
      : renderShowcaseNow(geometry, materials, handle, style, signal),
  );
  renderQueue = job.catch(() => {});
  return job;
}

async function renderShowcaseNow(
  geometry: VisualPanel[],
  materials: PublicMaterial[],
  handle: string,
  style: NonNullable<Gallery["scene"]>,
  signal: AbortSignal,
): Promise<ShowcaseImage[]> {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  });
  const cleanup: (() => void)[] = [
    () => renderer.forceContextLoss(),
    () => renderer.dispose(),
  ];
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    const width = 1200,
      height = 800;
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    cleanup.push(() => disposeObjects(scene));
    scene.background = new THREE.Color(
      style === "dark" ? 0x575650 : style === "light" ? 0xf0eeea : 0xe2d8c8,
    );
    const camera = new THREE.PerspectiveCamera(32, width / height, 0.02, 60);
    const model = createShowcaseModel(geometry, materials, handle);
    scene.add(model.group);
    const bounds = new THREE.Box3().setFromObject(model.group);
    const size = bounds.getSize(new THREE.Vector3());
    const studio = createStudio(size.x, size.z);
    studio.group.traverse((object) => {
      if (
        object instanceof THREE.Mesh &&
        object.geometry instanceof THREE.PlaneGeometry
      ) {
        (object.material as THREE.MeshStandardMaterial).color.copy(
          scene.background as THREE.Color,
        );
      }
    });
    scene.add(studio.group);
    const wood = floorTexture();
    cleanup.push(() => wood.dispose());
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshStandardMaterial({
        color: style === "dark" ? 0x9f9586 : 0xffffff,
        map: wood,
        roughness: 0.88,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    floor.receiveShadow = true;
    scene.add(floor);
    const sun = new THREE.DirectionalLight(0xfff1d8, 3.4);
    cleanup.push(() => sun.shadow.dispose());
    sun.position.set(-3.5, 5, 3);
    sun.target.position.set(0, size.y / 2, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -4,
      right: 4,
      top: 5,
      bottom: -3,
      near: 0.1,
      far: 18,
    });
    sun.shadow.normalBias = 0.002;
    sun.shadow.bias = -0.00008;
    sun.shadow.radius = 4;
    scene.add(
      sun,
      sun.target,
      new THREE.HemisphereLight(0xfffaf4, 0x9b8971, 0.45),
    );
    const room = new RoomEnvironment();
    cleanup.push(() => room.dispose());
    const generator = new THREE.PMREMGenerator(renderer);
    cleanup.push(() => generator.dispose());
    const environment = generator.fromScene(room, 0.04);
    cleanup.push(() => environment.dispose());
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.3;
    const pending: Promise<THREE.Texture>[] = [];
    const textures = createSwatchTextures(
      () => {},
      renderer.capabilities.getMaxAnisotropy(),
      (path) => {
        const loading = new THREE.TextureLoader().loadAsync(path);
        pending.push(loading);
        return loading;
      },
    );
    cleanup.push(() => textures.dispose());
    model.finishes.forEach(({ material, swatch }) =>
      textures.attach(material, swatch),
    );
    const composer = new EffectComposer(renderer);
    cleanup.push(() => composer.dispose());
    const beauty = new RenderPass(scene, camera);
    cleanup.push(() => beauty.dispose());
    composer.addPass(beauty);
    const ao = new SSAOPass(scene, camera, width, height, 16);
    // This Three.js release does not include these two resources in SSAOPass.dispose().
    cleanup.push(
      () => ao.dispose(),
      () => ao.ssaoMaterial.dispose(),
      () => ao.noiseTexture.dispose(),
    );
    ao.kernelRadius = 0.15;
    ao.minDistance = 0.001;
    ao.maxDistance = 0.12;
    // Transparent glazing is not an opaque occluder in the ambient-occlusion pass.
    const translucent: THREE.Mesh[] = [];
    model.group.traverse((object) => {
      if (
        object instanceof THREE.Mesh &&
        !Array.isArray(object.material) &&
        object.material.transparent
      )
        translucent.push(object);
    });
    const renderAO = ao.render.bind(ao);
    ao.render = (...args: Parameters<typeof ao.render>) => {
      const visible = translucent.map((mesh) => mesh.visible);
      translucent.forEach((mesh) => {
        mesh.visible = false;
      });
      try {
        renderAO(...args);
      } finally {
        translucent.forEach((mesh, index) => {
          mesh.visible = visible[index];
        });
      }
    };
    composer.addPass(ao);
    const output = new OutputPass();
    cleanup.push(() => output.dispose());
    composer.addPass(output);
    await Promise.race([
      Promise.allSettled(pending),
      new Promise((resolve) => {
        timeout = setTimeout(resolve, 8000);
      }),
      new Promise<void>((resolve) => {
        onAbort = resolve;
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
    if (signal.aborted) return [];
    const views = [
      {
        label: "En tu espacio",
        open: false,
        direction: new THREE.Vector3(0.44, 0.18, 1),
      },
      ...(model.doors.length
        ? [
            {
              label: "Interior",
              open: true,
              direction: new THREE.Vector3(0.44, 0.2, 1),
            },
          ]
        : []),
      {
        label: "De frente",
        open: false,
        direction: new THREE.Vector3(0, 0.045, 1),
      },
    ];
    const images: ShowcaseImage[] = [];
    for (const view of views) {
      if (signal.aborted) return [];
      model.doors.forEach((door) => {
        door.rotation.y =
          (door.userData.closedRotationY ?? 0) +
          (view.open ? DOOR_OPEN_ANGLE : 0);
      });
      const frame = new THREE.Box3().setFromObject(model.group);
      const fit = fitCamera(camera, frame, view.direction.normalize());
      camera.position.sub(fit.center).multiplyScalar(1.15).add(fit.center);
      camera.lookAt(fit.center);
      camera.updateProjectionMatrix();
      composer.render();
      images.push({
        label: view.label,
        src: renderer.domElement.toDataURL("image/png"),
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return images;
  } finally {
    clearTimeout(timeout);
    if (onAbort) signal.removeEventListener("abort", onAbort);
    for (const dispose of cleanup.reverse()) {
      try {
        dispose();
      } catch {
        /* Always reach renderer/context cleanup after a partial setup failure. */
      }
    }
  }
}
