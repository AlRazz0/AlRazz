import {
  useLayoutEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  animationProgress,
  createCameraMotion,
  getResizeDirection,
  getViewDirection,
} from "./camera-motion";
import { createDimensionOverlay } from "./viewer-dimensions";
import { doorRotation, doorPreviewBounds } from "./door-preview";
import { createViewerModel, preserveViewerCamera } from "./viewer-model";
import { createPlacementOverlay, placementBounds } from "./viewer-placement";
import type { PlacementSlot } from "./kitchen-slots";
import "./viewer-placement.css";
import type { VisualPanel } from "../lib/public-geometry";
import type { PublicMaterial } from "./types";
import {
  STUDIO_COLOR,
  createScaleReference,
  createStudio,
  disposeObjects,
  fitCamera,
  placeReference,
} from "./viewer-scene";
export type View = "iso" | "front" | "side" | "top";
export type ViewerHandle = { capture: () => string | null };
type Props = {
  panels: VisualPanel[];
  materials: PublicMaterial[];
  width: number;
  height: number;
  depth: number;
  view?: View;
  open?: boolean;
  small?: boolean;
  reference?: boolean;
  environment?: boolean;
  dimensions?: boolean;
  handle?: string;
  placementSlots?: readonly PlacementSlot[];
  onPlacementSelect?: (id: string) => void;
};
const Viewer = forwardRef<ViewerHandle, Props>(function Viewer(
  {
    panels,
    materials,
    width,
    height,
    depth,
    view = "iso",
    open = false,
    small = false,
    reference = !small,
    environment = !small,
    dimensions = false,
    handle = "push",
    placementSlots = [],
    onPlacementSelect,
  },
  ref,
) {
  const mount = useRef<HTMLDivElement>(null);
  const runtime = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    group: THREE.Group;
    model: ReturnType<typeof createViewerModel>;
    reference: THREE.Group;
    environment: THREE.Group;
    decoration: THREE.Object3D | null;
    studio: { group: THREE.Group; decoration: THREE.Object3D; width: number; depth: number } | null;
    dimensions: ReturnType<typeof createDimensionOverlay>;
    placements: ReturnType<typeof createPlacementOverlay> | null;
    placementBounds: THREE.Box3;
    width: number;
    depth: number;
    doors: THREE.Group[];
    previewBounds: THREE.Box3 | null;
    doorAmount: number;
    doorTarget: number;
    framed: boolean;
    frame: (direction?: THREE.Vector3, animated?: boolean) => void;
    reconcileFrame: () => void;
    animate: (
      channel: "camera" | "doors",
      update: (progress: number) => void,
      duration: number,
    ) => void;
    settle: () => void;
    render: () => void;
    invalidate: () => void;
  } | null>(null);
  const [error, setError] = useState("");
  const framedOpen = small ? false : open;
  const framingSettings = useRef<{ view: View; small: boolean; open: boolean; reference: boolean; environment: boolean } | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      capture: () => {
        const r = runtime.current;
        if (!r) return null;
        r.settle();
        r.render();
        return (
          r.dimensions?.capture(r.renderer.domElement) ??
          r.renderer.domElement.toDataURL("image/png")
        );
      },
    }),
    [],
  );
  useLayoutEffect(() => {
    if (!mount.current) return;
    const el = mount.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
    } catch {
      setError(
        "Tu navegador no pudo abrir la vista 3D. Puedes seguir ajustando medidas y acabados, guardar tu diseño o escribirnos para revisarlo contigo.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.25 : 2));
    renderer.shadowMap.enabled = !small;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(STUDIO_COLOR, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.domElement.setAttribute(
      "aria-label",
      "Modelo tridimensional del mueble. Arrastra para girar y usa la rueda para acercarte.",
    );
    renderer.domElement.setAttribute("role", "img");
    el.appendChild(renderer.domElement);
    const dimensionOverlay = small ? null : createDimensionOverlay(el);
    const placementOverlay = small ? null : createPlacementOverlay(el);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 200);
    camera.position.set(4, 3, 6);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = !small;
    controls.enableZoom = !small;
    controls.enabled = !small;
    controls.minDistance = 0.5;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI * 0.49;
    scene.add(new THREE.HemisphereLight(0xfffaf2, 0x9b9180, 2.1));
    const light = new THREE.DirectionalLight(0xfff7ed, 2.8);
    light.position.set(-3, 6, 5);
    light.castShadow = !small;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -5;
    light.shadow.camera.right = 5;
    light.shadow.camera.top = 5;
    light.shadow.camera.bottom = -5;
    light.shadow.normalBias = 0.012;
    light.shadow.bias = -0.0002;
    light.shadow.radius = 4;
    scene.add(light);
    const fill = new THREE.DirectionalLight(0xffffff, 0.75);
    fill.position.set(-3, 2, -3);
    scene.add(fill);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: STUDIO_COLOR, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.003;
    ground.receiveShadow = true;
    scene.add(ground);
    const group = new THREE.Group();
    scene.add(group);
    const person = small ? new THREE.Group() : createScaleReference();
    person.visible = false;
    const studio = new THREE.Group();
    scene.add(person, studio);
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motions = new Map<
      "camera" | "doors",
      {
        started: number;
        duration: number;
        update: (progress: number) => void;
      }
    >();
    let animationFrame = 0;
    let renderFrame = 0;
    let disposed = false;
    const render = () => {
      if (renderFrame) cancelAnimationFrame(renderFrame);
      renderFrame = 0;
      if (disposed) return;
      const r = runtime.current;
      if (r?.reference.visible) {
        const direction = camera.position
          .clone()
          .sub(controls.target)
          .normalize();
        placeReference(r.reference, direction, r.width, r.depth);
      }
      renderer.render(scene, camera);
      dimensionOverlay?.draw(
        camera,
        renderer.domElement,
        el.clientWidth,
        el.clientHeight,
      );
      placementOverlay?.draw(camera, el.clientWidth, el.clientHeight);
    };
    const invalidate = () => {
      if (disposed || renderFrame || motions.size) return;
      renderFrame = requestAnimationFrame(() => { renderFrame = 0; render(); });
    };
    const tick = (now: number) => {
      animationFrame = 0;
      if (disposed) return;
      for (const [channel, motion] of motions) {
        const progress = animationProgress(
          now,
          motion.started,
          motion.duration,
        );
        motion.update(1 - Math.pow(1 - progress, 3));
        if (progress === 1) motions.delete(channel);
      }
      render();
      if (motions.size) animationFrame = requestAnimationFrame(tick);
    };
    const animate = (
      channel: "camera" | "doors",
      update: (progress: number) => void,
      duration: number,
    ) => {
      motions.delete(channel);
      if (
        preference.matches ||
        (small && channel === "camera") ||
        document.hidden ||
        duration === 0
      ) {
        update(1);
        render();
        return;
      }
      motions.set(channel, { started: performance.now(), duration, update });
      if (!animationFrame) animationFrame = requestAnimationFrame(tick);
    };
    const settle = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      for (const motion of motions.values()) motion.update(1);
      motions.clear();
      render();
    };
    const stopCameraMotion = () => motions.delete("camera");
    const handleMotionPreference = () => {
      if (preference.matches) settle();
    };
    const handleVisibility = () => {
      if (document.hidden) settle();
    };
    const frame = (direction?: THREE.Vector3, animated = false) => {
      const r = runtime.current;
      if (!r) return;
      const lookingFrom =
        direction || camera.position.clone().sub(controls.target).normalize();
      if (r.reference.visible)
        placeReference(r.reference, lookingFrom, r.width, r.depth);
      // The destination fits the final doors; intermediate frames fit their
      // actual animated pose so closing returns to the closed composition.
      const rotations = r.doors.map((hinge) => hinge.rotation.y);
      r.doors.forEach((hinge) => {
        hinge.rotation.y = doorRotation(hinge, r.doorTarget);
      });
      const bounds =
        small && r.previewBounds
          ? r.previewBounds.clone()
          : new THREE.Box3().setFromObject(group);
      r.doors.forEach((hinge, index) => {
        hinge.rotation.y = rotations[index];
      });
      if (bounds.isEmpty()) return;
      if (!r.placementBounds.isEmpty()) bounds.union(r.placementBounds);
      if (r.reference.visible) bounds.expandByObject(r.reference);
      if (r.decoration && r.environment.visible)
        bounds.expandByObject(r.decoration);
      const startPosition = camera.position.clone();
      const startTarget = controls.target.clone();
      const fit = fitCamera(camera, bounds, lookingFrom);
      const finalPosition = camera.position.clone();
      camera.position.copy(startPosition);
      controls.maxDistance = Math.max(12, fit.distance * 3);
      const poseAt = createCameraMotion(
        camera,
        startTarget,
        finalPosition,
        fit.center,
        controls.maxPolarAngle,
      );
      animate(
        "camera",
        (progress) => {
          const pose = poseAt(progress, (currentDirection) => {
            const currentBounds =
              small && r.previewBounds
                ? r.previewBounds.clone()
                : new THREE.Box3().setFromObject(group);
            if (!r.placementBounds.isEmpty()) currentBounds.union(r.placementBounds);
            if (r.reference.visible) {
              placeReference(r.reference, currentDirection, r.width, r.depth);
              currentBounds.expandByObject(r.reference);
            }
            if (r.decoration && r.environment.visible)
              currentBounds.expandByObject(r.decoration);
            return currentBounds;
          });
          controls.target.copy(pose.target);
          camera.position.copy(pose.position);
          controls.maxDistance = Math.max(
            controls.maxDistance,
            pose.radius * 1.1,
          );
          controls.update();
        },
        animated && r.framed ? 640 : 0,
      );
      r.framed = true;
    };
    const reconcileFrame = () => {
      const r = runtime.current;
      if (!r || !r.framed || motions.has("camera")) return;
      if (r.reference.visible) placeReference(r.reference,
        camera.position.clone().sub(controls.target).normalize(), r.width, r.depth);
      const bounds = small && r.previewBounds ? r.previewBounds.clone() : new THREE.Box3().setFromObject(group);
      if (!r.placementBounds.isEmpty()) bounds.union(r.placementBounds);
      if (r.reference.visible) bounds.expandByObject(r.reference);
      if (r.decoration && r.environment.visible) bounds.expandByObject(r.decoration);
      if (preserveViewerCamera(camera, controls.target, bounds)) controls.update();
    };
    let viewportWidth = 0, viewportHeight = 0;
    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      if (w === viewportWidth && h === viewportHeight) return;
      viewportWidth = w; viewportHeight = h;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const direction = getResizeDirection(
        camera,
        controls.target,
        motions.has("camera") ? settle : undefined,
      );
      frame(direction);
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    controls.addEventListener("change", invalidate);
    controls.addEventListener("start", stopCameraMotion);
    preference.addEventListener("change", handleMotionPreference);
    document.addEventListener("visibilitychange", handleVisibility);
    runtime.current = {
      renderer,
      scene,
      camera,
      controls,
      group,
      model: createViewerModel(group, invalidate, renderer.capabilities.getMaxAnisotropy()),
      reference: person,
      environment: studio,
      decoration: null,
      studio: null,
      dimensions: dimensionOverlay,
      placements: placementOverlay,
      placementBounds: new THREE.Box3(),
      width: 1,
      depth: 0.4,
      doors: [],
      previewBounds: null,
      doorAmount: 0,
      doorTarget: 0,
      framed: false,
      frame,
      reconcileFrame,
      animate,
      settle,
      render,
      invalidate,
    };
    resize();
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      cancelAnimationFrame(renderFrame);
      motions.clear();
      preference.removeEventListener("change", handleMotionPreference);
      document.removeEventListener("visibilitychange", handleVisibility);
      ro.disconnect();
      controls.removeEventListener("change", invalidate);
      controls.removeEventListener("start", stopCameraMotion);
      controls.dispose();
      runtime.current?.model.dispose();
      disposeObjects(scene);
      light.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      dimensionOverlay?.dispose();
      placementOverlay?.dispose();
      runtime.current = null;
    };
  }, [small]);
  useLayoutEffect(() => {
    const r = runtime.current;
    if (!r) return;
    const firstGeometry = !r.framed;
    const updated = r.model.update(panels, materials, handle, r.doorAmount);
    r.doors = updated.doors;
    if (updated.boundsChanged) {
      r.previewBounds = small ? doorPreviewBounds(r.group, r.doors) : null;
      if (firstGeometry) r.frame(getViewDirection(view));
      else r.reconcileFrame();
    }
    if (updated.changed) r.invalidate();
  }, [panels, materials, handle, small]);
  useLayoutEffect(() => {
    const r = runtime.current;
    if (!r) return;
    const slots = !small && onPlacementSelect ? placementSlots : [];
    const nextBounds = placementBounds(slots);
    const changedBounds = !r.placementBounds.equals(nextBounds);
    r.placementBounds.copy(nextBounds);
    r.placements?.update(slots, onPlacementSelect);
    if (changedBounds) r.reconcileFrame();
    r.invalidate();
  }, [placementSlots, onPlacementSelect, small]);
  useLayoutEffect(() => {
    const r = runtime.current;
    if (!r) return;
    const start = r.doorAmount;
    const target = open && r.doors.length ? 1 : 0;
    r.doorTarget = target;
    r.animate(
      "doors",
      (progress) => {
        r.doorAmount = THREE.MathUtils.lerp(start, target, progress);
        r.doors.forEach((hinge) => {
          hinge.rotation.y = doorRotation(hinge, r.doorAmount);
        });
      },
      Math.abs(start - target) < 0.000001 ? 0 : 540,
    );
  }, [open, small]);
  useLayoutEffect(() => {
    const r = runtime.current;
    if (!r) return;
    r.width = width / 1000;
    r.depth = depth / 1000;
    r.reference.visible = reference && !small;
    r.environment.visible = environment && !small;
    if (r.environment.visible && !r.studio) {
      const studio = createStudio(r.width, r.depth);
      r.environment.add(studio.group);
      r.studio = { ...studio, width: r.width, depth: r.depth };
    }
    if (r.studio) {
      // The wall and vase move with the rear edge; their geometry stays cached.
      r.studio.group.position.z = (r.studio.depth - r.depth) / 2;
      r.studio.decoration.position.x += (r.studio.width - r.width) / 2;
      r.studio.width = r.width;
      r.decoration = r.studio.decoration;
    }
    r.renderer.domElement.setAttribute(
      "aria-label",
      "Modelo tridimensional del mueble." +
        (r.reference.visible
          ? " Figura humana de referencia de 1,70 metros de altura."
          : "") +
        (!small ? " Arrastra para girar y usa la rueda para acercarte." : ""),
    );
    r.invalidate();
  }, [width, depth, reference, environment, small]);
  useLayoutEffect(() => {
    const r = runtime.current;
    if (!r) return;
    r.dimensions?.update(width, height, depth, dimensions && !small);
    r.invalidate();
  }, [width, height, depth, dimensions, small]);
  useLayoutEffect(() => {
    const r = runtime.current;
    if (!r) return;
    const previous = framingSettings.current;
    framingSettings.current = { view, small, open: framedOpen, reference, environment };
    if (!previous || !r.framed || previous.view !== view || previous.small !== small)
      r.frame(getViewDirection(view), Boolean(previous));
    else if (previous.open !== framedOpen || previous.reference !== reference || previous.environment !== environment)
      r.frame(undefined, true);
    else r.reconcileFrame();
    r.invalidate();
  }, [width, height, depth, view, small, framedOpen, reference, environment]);
  return (
    <div className={"viewer " + (small ? "viewer-small" : "")} ref={mount}>
      {error && <p className="viewer-error">{error}</p>}
    </div>
  );
});
export default Viewer;
