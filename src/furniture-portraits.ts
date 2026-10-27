import { createShowroomRenderer, createShowroomScene } from "./showroom-scene";
import type { PublicMaterial, PublicProduct } from "./types";

type Listener = { image: (source: string) => void; failure: () => void; active: boolean };
type Job = { key: string; product: PublicProduct; materials: readonly PublicMaterial[]; size: number; listeners: Listener[]; retried?: boolean };
const cache = new Map<string, string>();
const jobs: Job[] = [];
let running: Job | undefined;
let scheduled = false;
let studio: ReturnType<typeof createShowroomRenderer> | undefined;
let unavailable = false;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;

function release() { studio?.dispose(); studio = undefined; }
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", release);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); });
}

function schedule() {
  if (scheduled || running || document.hidden) return;
  if (!jobs.length) {
    clearTimeout(releaseTimer); releaseTimer = setTimeout(release, 6000); return;
  }
  scheduled = true;
  const next = () => { scheduled = false; void renderNext(); };
  if ("requestIdleCallback" in window) window.requestIdleCallback(next, { timeout: 300 });
  else setTimeout(next, 24);
}
async function renderNext() {
  const job = jobs.shift();
  if (!job) return;
  if (document.hidden) { jobs.unshift(job); return; }
  if (!job.listeners.some(listener => listener.active)) { schedule(); return; }
  running = job;
  let scene: ReturnType<typeof createShowroomScene> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    if (unavailable) throw new Error("Presentation is unavailable");
    clearTimeout(releaseTimer);
    if (!studio) {
      try { studio = createShowroomRenderer(); }
      catch (error) { unavailable = true; throw error; }
    }
    scene = createShowroomScene(job.product, job.materials, studio.environment, () => {}, studio.renderer.capabilities.getMaxAnisotropy());
    // One slow texture cannot hold the complete collection hostage.
    let texturesSettled = false;
    const ready = scene.ready.then(() => { texturesSettled = true; });
    await Promise.race([ready, new Promise(resolve => { deadline = setTimeout(resolve, 4500); })]);
    if (!texturesSettled) {
      // Keep the immediate textured SVG. Never cache a flat, unfinished portrait.
      // Once the pending images settle, their browser cache enables one bounded retry.
      if (!job.retried) void ready.then(() => {
        const listeners = job.listeners.filter(listener => listener.active);
        if (!listeners.length) return;
        const completed = cache.get(job.key);
        if (completed) { listeners.forEach(listener => listener.image(completed)); return; }
        // Another view may have requested this portrait while the texture was slow.
        // Its work must also resolve the original listeners, not leave them on SVG.
        const pending = running?.key === job.key ? running : jobs.find(item => item.key === job.key);
        if (pending) pending.listeners.push(...listeners);
        else { jobs.push({ ...job, listeners, retried: true }); schedule(); }
      });
      return;
    }
    if (!job.listeners.some(listener => listener.active)) return;
    if (document.hidden || !studio) { jobs.unshift(job); return; }
    studio.renderer.setPixelRatio(1); studio.renderer.setSize(job.size, job.size * .75, false);
    scene.camera.aspect = 4 / 3; scene.camera.updateProjectionMatrix(); scene.fit();
    scene.render(studio.renderer);
    const image = studio.renderer.domElement.toDataURL("image/webp", .92);
    cache.set(job.key, image);
    while (cache.size > 20) cache.delete(cache.keys().next().value!);
    job.listeners.forEach(listener => { if (listener.active) listener.image(image); });
  } catch {
    // Still allow the catalogue and its exact SVG preview on devices without WebGL.
    job.listeners.forEach(listener => { if (listener.active) listener.failure(); });
  } finally {
    clearTimeout(deadline); scene?.dispose(); running = undefined; schedule();
  }
}

/** All visible cards share ONE short-lived WebGL context and bounded image cache. */
export function requestFurniturePortrait(product: PublicProduct, materials: readonly PublicMaterial[], large: boolean,
  image: Listener["image"], failure: Listener["failure"]) {
  const used = new Set(product.preview.geometry.map(panel => panel.material));
  const finishes = materials.filter(material => used.has(material.id));
  const size = large ? 1200 : 800;
  const key = JSON.stringify([product.id, product.version, product.preview.geometry, product.defaults.handle,
    finishes.map(material => [material.id, material.color, material.swatch, material.renderTexture]), size]);
  const listener: Listener = { image, failure, active: true };
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key); cache.set(key, hit); image(hit);
  } else if (unavailable) failure();
  else {
    const existing = running?.key === key ? running : jobs.find(job => job.key === key);
    if (existing) existing.listeners.push(listener);
    else jobs.push({ key, product, materials: finishes, size, listeners: [listener] });
    schedule();
  }
  return () => { listener.active = false; };
}
