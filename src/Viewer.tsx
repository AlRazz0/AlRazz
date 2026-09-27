import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createCameraMotion } from "./camera-motion";
import type { VisualPanel } from "../lib/public-geometry";
import type { PublicMaterial } from "./types";
import {
  STUDIO_COLOR,
  clearGroup,
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
  handle?: string;
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
    handle = "push",
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
    reference: THREE.Group;
    environment: THREE.Group;
    decoration: THREE.Object3D | null;
    width: number;
    depth: number;
    doors: THREE.Group[];
    doorAmount: number;
    doorTarget: number;
    framed: boolean;
    frame: (direction?: THREE.Vector3, animated?: boolean) => void;
    animate: (
      channel: "camera" | "doors",
      update: (progress: number) => void,
      duration: number,
    ) => void;
    settle: () => void;
    render: () => void;
  } | null>(null);
  const [error, setError] = useState("");
  useImperativeHandle(
    ref,
    () => ({
      capture: () => {
        const r = runtime.current;
        if (!r) return null;
        r.settle();
        r.render();
        return r.renderer.domElement.toDataURL("image/png");
      },
    }),
    [],
  );
  useEffect(() => {
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
    let disposed = false;
    const render = () => {
      const r = runtime.current;
      if (r?.reference.visible) {
        const direction = camera.position
          .clone()
          .sub(controls.target)
          .normalize();
        placeReference(r.reference, direction, r.width, r.depth);
      }
      renderer.render(scene, camera);
    };
    const tick = (now: number) => {
      animationFrame = 0;
      if (disposed) return;
      for (const [channel, motion] of motions) {
        const progress = Math.min(1, (now - motion.started) / motion.duration);
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
      if (preference.matches || small || document.hidden || duration === 0) {
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
        hinge.rotation.y = -Math.PI * 0.58 * r.doorTarget;
      });
      const bounds = new THREE.Box3().setFromObject(group);
      r.doors.forEach((hinge, index) => {
        hinge.rotation.y = rotations[index];
      });
      if (bounds.isEmpty()) return;
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
            const currentBounds = new THREE.Box3().setFromObject(group);
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
    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      frame();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    controls.addEventListener("change", render);
    controls.addEventListener("start", stopCameraMotion);
    preference.addEventListener("change", handleMotionPreference);
    document.addEventListener("visibilitychange", handleVisibility);
    runtime.current = {
      renderer,
      scene,
      camera,
      controls,
      group,
      reference: person,
      environment: studio,
      decoration: null,
      width: 1,
      depth: 0.4,
      doors: [],
      doorAmount: 0,
      doorTarget: 0,
      framed: false,
      frame,
      animate,
      settle,
      render,
    };
    resize();
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      motions.clear();
      preference.removeEventListener("change", handleMotionPreference);
      document.removeEventListener("visibilitychange", handleVisibility);
      ro.disconnect();
      controls.removeEventListener("change", render);
      controls.removeEventListener("start", stopCameraMotion);
      controls.dispose();
      disposeObjects(scene);
      light.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      runtime.current = null;
    };
  }, [small]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    const needsInitialFrame = r.group.children.length === 0;
    clearGroup(r.group);
    r.doors = [];
    panels.forEach((panel) => {
      const color =
        materials.find((f) => f.id === panel.material)?.color || "#b99469";
      const geo = new THREE.BoxGeometry(
        ...(panel.size.map((n) => n / 1000) as [number, number, number]),
      );
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.77,
        metalness: 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        ...(panel.position.map((n) => n / 1000) as [number, number, number]),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const lines = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({
          color: new THREE.Color(color).multiplyScalar(0.72),
          transparent: true,
          opacity: 0.5,
        }),
      );
      mesh.add(lines);
      if (panel.door) {
        const hinge = new THREE.Group();
        hinge.position.set(
          mesh.position.x - panel.size[0] / 2000,
          mesh.position.y,
          mesh.position.z,
        );
        mesh.position.set(panel.size[0] / 2000, 0, 0);
        hinge.add(mesh);
        hinge.rotation.y = -Math.PI * 0.58 * r.doorAmount;
        r.doors.push(hinge);
        if (handle !== "push") {
          const h = new THREE.Mesh(
            new THREE.BoxGeometry(0.009, 0.09, 0.025),
            new THREE.MeshStandardMaterial({
              color: 0x3a3733,
              metalness: 0.65,
              roughness: 0.35,
            }),
          );
          h.position.set(panel.size[0] / 2000 - 0.045, 0, 0.02);
          mesh.add(h);
        }
        r.group.add(hinge);
      } else r.group.add(mesh);
    });
    if (needsInitialFrame) r.frame();
    r.render();
  }, [panels, materials, handle, small]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    const start = r.doorAmount;
    r.doorTarget = open ? 1 : 0;
    r.animate(
      "doors",
      (progress) => {
        r.doorAmount = THREE.MathUtils.lerp(start, open ? 1 : 0, progress);
        r.doors.forEach((hinge) => {
          hinge.rotation.y = -Math.PI * 0.58 * r.doorAmount;
        });
      },
      540,
    );
  }, [open, small]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    r.width = width / 1000;
    r.depth = depth / 1000;
    r.reference.visible = reference && !small;
    r.environment.visible = environment && !small;
    clearGroup(r.environment);
    r.decoration = null;
    if (r.environment.visible) {
      const studio = createStudio(r.width, r.depth);
      r.environment.add(studio.group);
      r.decoration = studio.decoration;
    }
    r.renderer.domElement.setAttribute(
      "aria-label",
      "Modelo tridimensional del mueble." +
        (r.reference.visible
          ? " Figura humana de referencia de 1,70 metros de altura."
          : "") +
        (!small ? " Arrastra para girar y usa la rueda para acercarte." : ""),
    );
  }, [width, depth, reference, environment, small]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    const direction = new THREE.Vector3();
    if (view === "front") direction.set(0, 0.001, 1);
    else if (view === "side") direction.set(1, 0.001, 0.001);
    else if (view === "top") direction.set(0, 1, 0.001);
    else direction.set(0.52, 0.27, 1);
    r.frame(direction.normalize(), true);
  }, [width, height, depth, view, small, open, reference, environment]);
  return (
    <div className={"viewer " + (small ? "viewer-small" : "")} ref={mount}>
      {error && <p className="viewer-error">{error}</p>}
    </div>
  );
});
export default Viewer;
