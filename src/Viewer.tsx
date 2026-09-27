import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Panel } from "../lib/furniture";
import type { PublicMaterial } from "./types";
export type View = "iso" | "front" | "side" | "top";
export type ViewerHandle = { capture: () => string | null };
type Props = {
  panels: Panel[];
  materials: PublicMaterial[];
  width: number;
  height: number;
  depth: number;
  view?: View;
  open?: boolean;
  small?: boolean;
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
    render: () => void;
  } | null>(null);
  const [error, setError] = useState("");
  useImperativeHandle(
    ref,
    () => ({
      capture: () => {
        const r = runtime.current;
        if (!r) return null;
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
        "La vista 3D necesita WebGL. Puedes seguir ajustando medidas y consultar el despiece.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.25 : 2));
    renderer.shadowMap.enabled = !small;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0xeee9df, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute(
      "aria-label",
      "Modelo tridimensional del mueble. Arrastra para girar y usa la rueda para acercarte.",
    );
    renderer.domElement.setAttribute("role", "img");
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = !small;
    controls.enableZoom = !small;
    controls.enabled = !small;
    controls.minDistance = 0.5;
    controls.maxDistance = 12;
    controls.maxPolarAngle = Math.PI * 0.49;
    scene.add(new THREE.HemisphereLight(0xfff9ed, 0x8d8271, 2.3));
    const light = new THREE.DirectionalLight(0xfff3dd, 3.3);
    light.position.set(3, 5, 4);
    light.castShadow = !small;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -4;
    light.shadow.camera.right = 4;
    light.shadow.camera.top = 4;
    light.shadow.camera.bottom = -4;
    light.shadow.normalBias = 0.025;
    scene.add(light);
    const fill = new THREE.DirectionalLight(0xffffff, 0.75);
    fill.position.set(-3, 2, -3);
    scene.add(fill);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0xeee9df, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.003;
    ground.receiveShadow = true;
    scene.add(ground);
    const group = new THREE.Group();
    scene.add(group);
    const render = () => renderer.render(scene, camera);
    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    controls.addEventListener("change", render);
    runtime.current = { renderer, scene, camera, controls, group, render };
    resize();
    return () => {
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      runtime.current = null;
    };
  }, [small]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    while (r.group.children.length) {
      const child = r.group.children[0];
      child.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            m.dispose(),
          );
        }
      });
      r.group.remove(child);
    }
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
        if (open) hinge.rotation.y = -Math.PI * 0.58;
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
    r.render();
  }, [panels, materials, open, handle]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    const h = height / 1000;
    const fit = Math.max(width / 1000, height / 1000) * 1.9 + 0.5;
    r.controls.target.set(0, h / 2, 0);
    if (view === "front") r.camera.position.set(0, h / 2, fit);
    else if (view === "side") r.camera.position.set(fit, h / 2, 0.001);
    else if (view === "top") r.camera.position.set(0, h / 2 + fit, 0.001);
    else r.camera.position.set(fit * 0.69, h / 2 + fit * 0.37, fit * 0.88);
    r.controls.update();
    r.render();
  }, [width, height, depth, view, small]);
  return (
    <div className={"viewer " + (small ? "viewer-small" : "")} ref={mount}>
      {error && <p className="viewer-error">{error}</p>}
    </div>
  );
});
export default Viewer;
