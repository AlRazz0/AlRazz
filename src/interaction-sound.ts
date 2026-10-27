export type InteractionSound = "tap" | "select" | "confirm";
export type InteractionSoundState = Readonly<{ enabled: boolean; available: boolean }>;
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
export const INTERACTION_SOUND_KEY = "alrazz.interactionSound";
const MIN_INTERVAL = 160;
const MAX_RESUME_DELAY = 180;
const MASTER_LEVEL = 0.18;

type SoundEnvironment = {
  supported: () => boolean;
  createContext: () => AudioContext | null;
  allowed: () => boolean;
  route: () => string;
  now: () => number;
  storage?: PreferenceStorage;
};

/** A small gesture-only synthesizer. Reading preferences never opens an audio device. */
export function createInteractionSoundController(environment: SoundEnvironment) {
  let retained = false;
  try { retained = environment.storage?.getItem(INTERACTION_SOUND_KEY) === "on"; } catch {}
  let available = false;
  try { available = environment.supported(); } catch {}
  let state: InteractionSoundState = { enabled: retained && available, available };
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let filter: BiquadFilterNode | null = null;
  let generation = 0, lastIntent = -Infinity;
  const subscribers = new Set<() => void>();
  const voices = new Set<{ source: OscillatorNode; gain: GainNode; clean: () => void }>();
  function publish(enabled: boolean, available = state.available) {
    if (enabled === state.enabled && available === state.available) return;
    state = { enabled, available }; for (const listener of subscribers) listener();
  }
  function stop() {
    generation++;
    if (master && context) {
      try { master.gain.cancelScheduledValues(context.currentTime); master.gain.setValueAtTime(0, context.currentTime); } catch {}
    }
    for (const voice of [...voices]) { try { voice.source.stop(); } catch {} voice.clean(); }
    const old = context; context = null;
    try { master?.disconnect(); filter?.disconnect(); } catch {}
    master = null; filter = null;
    if (old && old.state !== "closed") { try { void old.close().catch(() => {}); } catch {} }
  }
  function setEnabled(enabled: boolean, persist = true) {
    const value = enabled && state.available;
    if (!value) stop();
    publish(value);
    if (persist) try { environment.storage?.setItem(INTERACTION_SOUND_KEY, value ? "on" : "off"); } catch {}
  }
  function fail() { stop(); publish(false, false); }
  function tone(audio: AudioContext, frequency: number, endFrequency: number, offset: number, duration: number, level: number) {
    const source = audio.createOscillator(), gain = audio.createGain();
    const start = audio.currentTime + 0.003 + offset, end = start + duration;
    const clean = () => {
      voices.delete(voice); source.onended = null;
      try { source.disconnect(); gain.disconnect(); } catch {}
    };
    const voice = { source, gain, clean }; voices.add(voice);
    source.type = "sine";
    source.frequency.setValueAtTime(frequency, start);
    source.frequency.exponentialRampToValueAtTime(endFrequency, start + duration * 0.6);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    source.connect(gain); gain.connect(master!); source.onended = clean;
    source.start(start); source.stop(end);
  }
  function synthesize(audio: AudioContext, kind: InteractionSound) {
    if (!master) {
      master = audio.createGain(); master.gain.setValueAtTime(MASTER_LEVEL, audio.currentTime);
      filter = audio.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.setValueAtTime(1800, audio.currentTime); filter.Q.setValueAtTime(0.4, audio.currentTime);
      master.connect(filter); filter.connect(audio.destination);
    }
    if (kind === "tap") {
      tone(audio, 570, 330, 0, 0.09, 0.08); tone(audio, 1040, 710, 0, 0.045, 0.024);
    } else if (kind === "select") {
      tone(audio, 430, 510, 0, 0.12, 0.06); tone(audio, 850, 700, 0, 0.05, 0.016);
    } else {
      tone(audio, 520, 470, 0, 0.105, 0.055); tone(audio, 660, 590, 0.035, 0.125, 0.04);
    }
  }
  function play(kind: InteractionSound, userGesture = false, commitAllowed: () => boolean = () => true) {
    if (!userGesture || !state.enabled || !state.available || !environment.allowed()) return;
    const requestedAt = environment.now();
    if (requestedAt - lastIntent < MIN_INTERVAL) return;
    lastIntent = requestedAt;
    const intent = ++generation, route = environment.route();
    try {
      context ??= environment.createContext();
      if (!context || context.state === "closed") { fail(); return; }
      const audio = context;
      const current = () => generation === intent && context === audio && state.enabled && environment.allowed() && environment.route() === route && environment.now() - requestedAt <= MAX_RESUME_DELAY && commitAllowed();
      if (audio.state === "running") { queueMicrotask(() => { try { if (current()) synthesize(audio, kind); } catch { fail(); } }); return; }
      // resume() is invoked synchronously in the gesture, then checked again on resolution.
      void audio.resume().then(() => { if (current() && audio.state === "running") synthesize(audio, kind); })
        .catch(() => { if (generation === intent && context === audio) fail(); });
    } catch { fail(); }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { subscribers.add(listener); return () => { subscribers.delete(listener); }; },
    setEnabled, play, stop,
  };
}

export type InteractionSoundController = ReturnType<typeof createInteractionSoundController>;
const serverSnapshot: InteractionSoundState = { enabled: false, available: false };
let browser: InteractionSoundController | undefined;
function audioConstructor() {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}
function publicRoute() { return typeof window !== "undefined" && !/^\/admin(?:\/|$)/i.test(window.location.pathname); }
function controller() {
  if (!browser) {
    let storage: PreferenceStorage | undefined;
    try { if (typeof window !== "undefined") storage = window.localStorage; } catch {}
    browser = createInteractionSoundController({
      supported: () => !!audioConstructor(), createContext: () => { const Audio = audioConstructor(); return Audio ? new Audio({ latencyHint: "interactive" }) : null; },
      allowed: () => publicRoute() && document.visibilityState !== "hidden", route: () => window.location.pathname,
      now: () => performance.now(), storage,
    });
  }
  return browser;
}
export function getInteractionSoundState() { return typeof window === "undefined" ? serverSnapshot : controller().getSnapshot(); }
export function getServerInteractionSoundState() { return serverSnapshot; }
export function subscribeInteractionSound(listener: () => void) { return controller().subscribe(listener); }
export function setInteractionSoundEnabled(enabled: boolean, userGesture = false) {
  controller().setEnabled(enabled);
  if (enabled && userGesture && publicRoute()) controller().play("tap", true);
}

let installations = 0;
const blocked = "[disabled], [aria-disabled='true'], [inert], [hidden], [aria-hidden='true'], [data-ui-sound-disabled], [data-state='inactive']";
const slider = "input[type='range'], [role='slider'], [data-slot='slider'], [data-ui-sound-drag]";
const draggedSliders = new Set<number>();
let suppressClickUntil = 0;
function pointerStarted(event: PointerEvent) {
  if (event.isTrusted && event.target instanceof Element && event.target.closest(slider)) draggedSliders.add(event.pointerId);
}
function pointerFinished(event: PointerEvent) {
  if (draggedSliders.delete(event.pointerId)) suppressClickUntil = performance.now() + 220;
}
function clicked(event: MouseEvent) {
  if (!event.isTrusted || event.defaultPrevented || event.button !== 0 || !publicRoute() || !(event.target instanceof Element)) return;
  if (draggedSliders.size || performance.now() < suppressClickUntil) return;
  if (event.target.closest("[data-ui-sound-toggle]") || event.target.closest(slider)) return;
  const element = event.target.closest<HTMLElement>("[data-ui-sound]");
  if (!element || element.closest(blocked) || element.closest(slider) || element.getClientRects().length === 0) return;
  if (element.matches("[aria-selected='true'], [aria-pressed='true'], [aria-current]:not([aria-current='false']), :disabled")) return;
  const kind = element.dataset.uiSound;
  if (kind !== "tap" && kind !== "select" && kind !== "confirm") return;
  controller().play(kind, true, () => !event.defaultPrevented);
}
const silence = () => { draggedSliders.clear(); suppressClickUntil = 0; controller().stop(); };
function visibilityChanged() { if (document.visibilityState === "hidden") silence(); }
function preferenceChanged(event: StorageEvent) { if (event.key === INTERACTION_SOUND_KEY || event.key === null) controller().setEnabled(event.newValue === "on", false); }

/** Install once from a public app effect; no device is opened until an opted-in click. */
export function installInteractionSounds() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  installations++;
  if (installations === 1) {
    document.addEventListener("click", clicked, true);
    document.addEventListener("pointerdown", pointerStarted, true);
    document.addEventListener("pointerup", pointerFinished, true);
    document.addEventListener("pointercancel", pointerFinished, true);
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("pagehide", silence);
    window.addEventListener("blur", silence);
    window.addEventListener("popstate", silence);
    window.addEventListener("hashchange", silence);
    window.addEventListener("storage", preferenceChanged);
  }
  let active = true;
  return () => {
    if (!active) return; active = false;
    if (--installations !== 0) return;
    document.removeEventListener("click", clicked, true);
    document.removeEventListener("pointerdown", pointerStarted, true);
    document.removeEventListener("pointerup", pointerFinished, true);
    document.removeEventListener("pointercancel", pointerFinished, true);
    document.removeEventListener("visibilitychange", visibilityChanged);
    window.removeEventListener("pagehide", silence); window.removeEventListener("blur", silence); window.removeEventListener("popstate", silence);
    window.removeEventListener("hashchange", silence); window.removeEventListener("storage", preferenceChanged);
    silence();
  };
}
