import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, DoorOpen, Minus, Plus, RotateCcw } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createShowroomRenderer, createShowroomScene, type ShowroomPose } from "./showroom-scene";
import type { PublicMaterial, PublicProduct } from "./types";
import "./immersive-furniture.css";

export type ImmersiveMemory = { pose: ShowroomPose; open: boolean };
type Props = { product: PublicProduct; materials: readonly PublicMaterial[]; className?: string; memory?: { current: ImmersiveMemory } };
type Commands = { present: (pose: ShowroomPose, open: boolean) => void; zoom: (factor: number) => void };
const views: { id: ShowroomPose; label: string; note: string }[] = [
  { id: "presence", label: "El conjunto", note: "Volumen, proporciones y presencia en un espacio de referencia." },
  { id: "front", label: "De frente", note: "Observa la distribución y la alineación de sus frentes." },
  { id: "side", label: "Su profundidad", note: "Mira el fondo y el espesor real de sus tableros." },
  { id: "detail", label: "De cerca", note: "Acércate a los cantos y al acabado de referencia." },
];

/** Read-only guided presentation. Editing, saving and pricing stay in the configurator. */
export default function ImmersiveFurniture({ product, materials, className = "", memory }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const commands = useRef<Commands | null>(null);
  const [pose, setPose] = useState<ShowroomPose>(memory?.current.pose ?? "presence");
  const [open, setOpen] = useState(memory?.current.open ?? false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [hasDoors, setHasDoors] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const finishId = product.defaults.finish;
  const finish = materials.find(material => material.id === finishId);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let alive = true, frame = 0;
    let motion: ((time: number) => boolean) | undefined;
    let activePose: ShowroomPose = memory?.current.pose ?? "presence";
    let doorTarget = memory?.current.open ? 1 : 0;
    let studio: ReturnType<typeof createShowroomRenderer> | undefined;
    let scene: ReturnType<typeof createShowroomScene> | undefined;
    let controls: OrbitControls | undefined;
    let observer: ResizeObserver | undefined;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    setError(""); setReady(false); setPose(activePose); setOpen(doorTarget > 0); setEngaged(false);
    function render() {
      frame = 0;
      if (!alive || !studio || !scene || document.hidden) return;
      if (motion?.(performance.now())) invalidate(); else motion = undefined;
      scene.render(studio.renderer);
    }
    function invalidate() { if (alive && !frame && !document.hidden) frame = requestAnimationFrame(render); }
    const stopMotion = () => { motion = undefined; scene?.doors(doorTarget); setEngaged(true); invalidate(); };
    const visibility = () => { if (document.hidden) { motion?.(Infinity); cancelAnimationFrame(frame); frame = 0; motion = undefined; } else invalidate(); };
    const reduceMotion = () => { if (preference.matches && motion) { motion(Infinity); motion = undefined; invalidate(); } };
    try {
      studio = createShowroomRenderer();
      scene = createShowroomScene(product, materials, studio.environment, invalidate, studio.renderer.capabilities.getMaxAnisotropy());
      setHasDoors(scene.hasDoors);
      const canvas = studio.renderer.domElement;
      canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", `${product.name}. Vista tridimensional del modelo, con controles de perspectiva debajo.`);
      element.appendChild(canvas);
      controls = new OrbitControls(scene.camera, canvas);
      controls.enableDamping = false; controls.enablePan = false; controls.enableZoom = false;
      controls.minAzimuthAngle = -Math.PI * .43; controls.maxAzimuthAngle = Math.PI * .43;
      controls.minPolarAngle = .18; controls.maxPolarAngle = Math.PI * .485;
      scene.doors(doorTarget); controls.target.copy(scene.fit(activePose)); controls.update();
      controls.addEventListener("change", invalidate); controls.addEventListener("start", stopMotion);
      const resize = () => {
        if (!studio || !scene || !controls) return;
        const width = Math.max(1, element.clientWidth), height = Math.max(1, element.clientHeight);
        studio.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        studio.renderer.setSize(width, height, false);
        scene.camera.aspect = width / height; scene.camera.updateProjectionMatrix();
        motion?.(Infinity); motion = undefined; controls.target.copy(scene.fit(activePose)); controls.update(); invalidate();
      };
      observer = new ResizeObserver(resize); observer.observe(element); resize();
      commands.current = {
        present(nextPose, nextOpen) {
          if (!scene || !controls) return;
          activePose = nextPose;
          doorTarget = nextOpen ? 1 : 0;
          const startPosition = scene.camera.position.clone(), startTarget = controls.target.clone();
          const startDoor = scene.openAmount, targetDoor = nextOpen ? 1 : 0;
          scene.doors(targetDoor);
          const target = scene.fit(nextPose), position = scene.camera.position.clone();
          scene.doors(startDoor); scene.camera.position.copy(startPosition);
          const started = performance.now(), duration = preference.matches ? 0 : 650;
          motion = now => {
            if (!scene || !controls) return false;
            const p = duration ? Math.min(1, (now - started) / duration) : 1;
            const eased = 1 - Math.pow(1 - p, 3);
            scene.camera.position.copy(startPosition).lerp(position, eased);
            controls.target.copy(startTarget).lerp(target, eased);
            scene.doors(THREE.MathUtils.lerp(startDoor, targetDoor, eased));
            controls.update(); return p < 1;
          };
          invalidate();
        },
        zoom(factor) {
          if (!scene || !controls) return;
          motion = undefined; scene.doors(doorTarget);
          const direction = scene.camera.position.clone().sub(controls.target);
          const extent = scene.bounds.getSize(new THREE.Vector3()).length();
          direction.setLength(Math.max(.2, Math.min(extent * 3.5, direction.length() * factor)));
          scene.camera.position.copy(controls.target).add(direction); controls.update(); invalidate();
        },
      };
      void scene.ready.finally(() => { if (alive) { setReady(true); invalidate(); } });
      document.addEventListener("visibilitychange", visibility); preference.addEventListener("change", reduceMotion);
    } catch {
      setError("La vista 3D no está disponible en este navegador. Puedes volver al ambiente o continuar con la ficha del mueble.");
    }
    return () => {
      alive = false; commands.current = null; cancelAnimationFrame(frame); observer?.disconnect();
      document.removeEventListener("visibilitychange", visibility); preference.removeEventListener("change", reduceMotion);
      controls?.dispose(); scene?.dispose(); studio?.renderer.domElement.remove(); studio?.dispose();
    };
  }, [product, materials, memory]);

  function remember(nextPose: ShowroomPose, nextOpen: boolean) { if (memory) memory.current = {pose: nextPose, open: nextOpen}; }
  function select(next: ShowroomPose) { setPose(next); remember(next, open); commands.current?.present(next, open); }
  return <div className={`immersive-furniture ${className}`}>
    <div className="immersive-furniture__stage">
      <div className="immersive-furniture__canvas" ref={host}/>
      <div className="immersive-furniture__identity"><span>Estudio de la pieza</span><strong>{product.name}</strong></div>
      {error ? <p className="immersive-furniture__error" role="status">{error}</p> : <>
        {!ready && <span className="immersive-furniture__loading" role="status">Preparando la luz y los materiales…</span>}
        <div className="immersive-furniture__zoom" role="group" aria-label="Acercamiento del mueble">
          <button type="button" aria-label="Acercar el mueble" onClick={() => commands.current?.zoom(.82)}><Plus size={18}/></button>
          <button type="button" aria-label="Alejar el mueble" onClick={() => commands.current?.zoom(1.22)}><Minus size={18}/></button>
          <button type="button" aria-label="Restablecer la vista del mueble" data-ui-sound="tap" onClick={() => {setPose("presence"); setOpen(false); remember("presence",false); commands.current?.present("presence",false);}}><RotateCcw size={17}/></button>
        </div>
        <span className="immersive-furniture__hint">{engaged ? "Tu perspectiva, a tu ritmo." : "Arrastra para recorrer la pieza."}</span>
      </>}
      <p className="immersive-furniture__caption">Modelo del catálogo · Ambientación ilustrativa</p>
    </div>
    {!error && <div className="immersive-furniture__journey">
      <div className="immersive-furniture__views" role="group" aria-label="Recorrido por el mueble">{views.map((view,index) => <button type="button" key={view.id} aria-pressed={pose === view.id} data-ui-sound={pose !== view.id ? "select" : undefined} onClick={() => select(view.id)}><span>0{index+1}</span>{view.label}</button>)}</div>
      <div className="immersive-furniture__context"><p aria-live="polite">{views.find(view => view.id === pose)?.note}<small>{finish?.name ?? "Acabado del modelo"} · Melamina de 18 mm</small></p>{hasDoors && <button type="button" aria-pressed={open} data-ui-sound="select" onClick={() => {setOpen(!open); remember(pose,!open); commands.current?.present(pose,!open);}}><DoorOpen size={18}/>{open ? "Cerrar puertas" : "Ver el interior"}<ArrowUpRight size={15}/></button>}</div>
    </div>}
  </div>;
}
