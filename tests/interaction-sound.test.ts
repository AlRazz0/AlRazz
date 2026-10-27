import assert from "node:assert/strict";
import test from "node:test";
import { createInteractionSoundController, INTERACTION_SOUND_KEY, installInteractionSounds } from "../src/interaction-sound.ts";

class Parameter {
  events: { kind: string; value: number; time: number }[] = [];
  setValueAtTime(value: number, time: number) { this.events.push({ kind: "set", value, time }); }
  linearRampToValueAtTime(value: number, time: number) { this.events.push({ kind: "linear", value, time }); }
  exponentialRampToValueAtTime(value: number, time: number) { this.events.push({ kind: "exponential", value, time }); }
  cancelScheduledValues(time: number) { this.events.push({ kind: "cancel", value: 0, time }); }
}
class AudioNodeFake {
  disconnected = false;
  connect(_node: unknown) {}
  disconnect() { this.disconnected = true; }
}
class OscillatorFake extends AudioNodeFake {
  frequency = new Parameter(); type = "sine"; onended: (() => void) | null = null;
  starts: number[] = []; stops: number[] = [];
  start(time: number) { this.starts.push(time); }
  stop(time = 0) { this.stops.push(time); }
}
class GainFake extends AudioNodeFake { gain = new Parameter(); }
class FilterFake extends AudioNodeFake { type = "lowpass"; frequency = new Parameter(); Q = new Parameter(); }
class ContextFake {
  state: AudioContextState = "running"; currentTime = 1; destination = new AudioNodeFake();
  oscillators: OscillatorFake[] = []; gains: GainFake[] = []; filters: FilterFake[] = [];
  closeCalls = 0; resumeCalls = 0;
  resumeResult: Promise<void> = Promise.resolve();
  createOscillator() { const value = new OscillatorFake(); this.oscillators.push(value); return value; }
  createGain() { const value = new GainFake(); this.gains.push(value); return value; }
  createBiquadFilter() { const value = new FilterFake(); this.filters.push(value); return value; }
  resume() { this.resumeCalls++; return this.resumeResult.then(() => { this.state = "running"; }); }
  close() { this.closeCalls++; this.state = "closed"; return Promise.resolve(); }
}
function deferred() { let resolve!: () => void; let reject!: (error: Error) => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function setup(options: { retained?: boolean; supported?: boolean; suspended?: boolean; resume?: Promise<void>; constructorFails?: boolean; storageFails?: boolean } = {}) {
  let clock = 0, route = "/coleccion", hidden = false, created = 0;
  const contexts: ContextFake[] = [], stored = new Map<string, string>(options.retained ? [[INTERACTION_SOUND_KEY, "on"]] : []);
  const controller = createInteractionSoundController({
    supported: () => options.supported !== false,
    createContext: () => { created++; if (options.constructorFails) throw new Error("Unavailable audio device"); const context = new ContextFake(); if (options.suspended) context.state = "suspended"; if (options.resume) context.resumeResult = options.resume; contexts.push(context); return context as unknown as AudioContext; },
    allowed: () => !hidden && !/^\/admin(?:\/|$)/.test(route), route: () => route, now: () => clock,
    storage: { getItem: key => { if (options.storageFails) throw new Error("Storage denied"); return stored.get(key) ?? null; }, setItem: (key, value) => { if (options.storageFails) throw new Error("Storage denied"); stored.set(key, value); } },
  });
  return { controller, contexts, stored, created: () => created, advance: (ms: number) => { clock += ms; }, navigate: (path: string) => { route = path; }, hide: () => { hidden = true; } };
}

test("fresh sound is off; installing a preference or calling without a gesture never autoplays", async () => {
  const fresh = setup(); assert.deepEqual(fresh.controller.getSnapshot(), { enabled: false, available: true });
  fresh.controller.play("tap", true); fresh.controller.setEnabled(true); fresh.controller.play("tap"); await flush();
  assert.equal(fresh.created(), 0);
  const retained = setup({ retained: true }); assert.equal(retained.controller.getSnapshot().enabled, true); assert.equal(retained.created(), 0);
  retained.controller.play("select", true); await flush(); assert.equal(retained.created(), 1); assert.equal(retained.contexts[0].oscillators.length, 2);
  fresh.controller.stop(); retained.controller.stop();
});
test("tones remain short and quiet, repetitions are throttled and finished nodes disconnect", async () => {
  const fixture = setup(); fixture.controller.setEnabled(true);
  for (const kind of ["tap", "select", "confirm"] as const) {
    fixture.controller.play(kind, true); await flush(); const context = fixture.contexts[0];
    const pair = context.oscillators.slice(-2), duration = Math.max(...pair.map(source => source.stops[0])) - context.currentTime;
    assert.ok(duration >= 0.08 && duration <= 0.18, `${kind} should finish within a short click`);
    assert.ok(context.gains.every(gain => gain.gain.events.every(event => event.value <= 0.18)));
    const count = context.oscillators.length;
    fixture.advance(25); fixture.controller.play(kind, true); await flush(); assert.equal(context.oscillators.length, count);
    for (const source of pair) source.onended?.();
    assert.ok(pair.every(source => source.disconnected)); assert.ok(context.gains.slice(-2).every(gain => gain.disconnected));
    fixture.advance(250);
  }
  fixture.controller.stop(); assert.equal(fixture.contexts[0].closeCalls, 1);
});
test("mute immediately cancels scheduled sources and invalidates queued synthesis", async () => {
  const fixture = setup(); fixture.controller.setEnabled(true); fixture.controller.play("confirm", true); await flush();
  const context = fixture.contexts[0]; fixture.controller.setEnabled(false);
  assert.equal(fixture.controller.getSnapshot().enabled, false); assert.equal(fixture.stored.get(INTERACTION_SOUND_KEY), "off");
  assert.ok(context.oscillators.every(source => source.stops.at(-1) === 0 && source.disconnected));
  assert.equal(context.gains[0].gain.events.at(-1)?.value, 0); assert.equal(context.closeCalls, 1);
  const queued = setup(); queued.controller.setEnabled(true); queued.controller.play("tap", true); queued.controller.stop(); await flush();
  assert.equal(queued.contexts[0].oscillators.length, 0);
});
test("a suspended context cannot play late after mute, route change, hiding or slow resume", async () => {
  for (const reason of ["mute", "route", "hidden", "delay"] as const) {
    const resume = deferred(), fixture = setup({ suspended: true, resume: resume.promise });
    fixture.controller.setEnabled(true); fixture.controller.play("tap", true);
    assert.equal(fixture.contexts[0].resumeCalls, 1, "resume starts within the interaction, not an unrelated later effect");
    if (reason === "mute") { fixture.controller.setEnabled(false); fixture.controller.setEnabled(true); }
    if (reason === "route") fixture.navigate("/mueble");
    if (reason === "hidden") fixture.hide();
    if (reason === "delay") fixture.advance(500);
    resume.resolve(); await flush(); assert.equal(fixture.contexts[0].oscillators.length, 0, reason); fixture.controller.stop();
  }
});
test("only the latest pending gesture survives resume and cancelled UI actions remain silent", async () => {
  const resume = deferred(), fixture = setup({ suspended: true, resume: resume.promise });
  fixture.controller.setEnabled(true); fixture.controller.play("tap", true); fixture.advance(250); fixture.controller.play("confirm", true);
  resume.resolve(); await flush(); assert.equal(fixture.contexts[0].oscillators.length, 2); fixture.controller.stop();
  const cancelled = setup(); let prevented = false;
  cancelled.controller.setEnabled(true); cancelled.controller.play("select", true, () => !prevented); prevented = true;
  await flush(); assert.equal(cancelled.contexts[0].oscillators.length, 0); cancelled.controller.stop();
});
test("unsupported audio, blocked storage and construction/resume failures never break the interface", async () => {
  const unavailable = setup({ supported: false, retained: true }); unavailable.controller.setEnabled(true); unavailable.controller.play("tap", true);
  assert.deepEqual(unavailable.controller.getSnapshot(), { enabled: false, available: false }); assert.equal(unavailable.created(), 0);
  const blockedStorage = setup({ storageFails: true }); blockedStorage.controller.setEnabled(true); blockedStorage.controller.play("tap", true); await flush();
  assert.equal(blockedStorage.contexts[0].oscillators.length, 2); blockedStorage.controller.stop();
  const broken = setup({ constructorFails: true }); assert.doesNotThrow(() => { broken.controller.setEnabled(true); broken.controller.play("tap", true); });
  assert.equal(broken.controller.getSnapshot().enabled, false);
  const resume = deferred(), rejected = setup({ suspended: true, resume: resume.promise }); rejected.controller.setEnabled(true); rejected.controller.play("tap", true);
  resume.reject(new Error("Resume denied")); await flush(); assert.deepEqual(rejected.controller.getSnapshot(), { enabled: false, available: false }); assert.equal(rejected.contexts[0].closeCalls, 1);
});
test("admin and hidden public pages cannot create an audio device", () => {
  const admin = setup({ retained: true }); admin.navigate("/admin"); admin.controller.play("confirm", true); assert.equal(admin.created(), 0);
  const hidden = setup({ retained: true }); hidden.hide(); hidden.controller.play("tap", true); assert.equal(hidden.created(), 0);
});

test("delegation snapshots opt-in in capture, ignores inactive/slider/synthetic clicks and cleans up", async () => {
  class Target {
    listeners = new Map<string, Set<(event: any) => void>>(); capture = false;
    addEventListener(type: string, listener: (event: any) => void, capture = false) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type)!.add(listener); if (type === "click") this.capture = capture; }
    removeEventListener(type: string, listener: (event: any) => void) { this.listeners.get(type)?.delete(listener); }
    fire(type: string, event: any) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
  }
  class ElementFake {
    dataset: { uiSound?: string } = { uiSound: "select" }; blocked = false; selected = false; slider = false; visible = true;
    closest(selector: string) { if (selector === "[data-ui-sound]") return this.dataset.uiSound ? this : null; if (selector.includes("[disabled]")) return this.blocked ? this : null; if (selector.includes("input[type='range']")) return this.slider ? this : null; return null; }
    matches() { return this.selected; } getClientRects() { return this.visible ? [{}] : []; }
  }
  let clock = 0; const contexts: ContextFake[] = [];
  const documentFake = Object.assign(new Target(), { visibilityState: "visible" });
  const windowFake = Object.assign(new Target(), { location: { pathname: "/coleccion" }, localStorage: { getItem: () => "on", setItem: () => {} }, AudioContext: class extends ContextFake { constructor() { super(); contexts.push(this); } } });
  const original = ["window", "document", "Element", "performance"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowFake }); Object.defineProperty(globalThis, "document", { configurable: true, value: documentFake });
  Object.defineProperty(globalThis, "Element", { configurable: true, value: ElementFake }); Object.defineProperty(globalThis, "performance", { configurable: true, value: { now: () => clock } });
  let cleanup: (() => void) | undefined;
  try {
    cleanup = installInteractionSounds(); assert.equal(documentFake.capture, true); assert.equal(contexts.length, 0);
    const click = (target: ElementFake, patch = {}) => documentFake.fire("click", { target, isTrusted: true, defaultPrevented: false, button: 0, ...patch });
    for (const key of ["blocked", "selected", "slider"] as const) { const element = new ElementFake(); element[key] = true; click(element); }
    click(new ElementFake(), { isTrusted: false }); windowFake.location.pathname = "/admin"; click(new ElementFake()); windowFake.location.pathname = "/coleccion";
    assert.equal(contexts.length, 0);
    const dragging = new ElementFake(); dragging.slider = true;
    documentFake.fire("pointerdown", { target: dragging, pointerId: 1, isTrusted: true });
    click(new ElementFake()); assert.equal(contexts.length, 0, "another finger/button cannot sound during a slider drag");
    documentFake.fire("pointerup", { target: dragging, pointerId: 1, isTrusted: true });
    click(new ElementFake()); assert.equal(contexts.length, 0, "the click generated by releasing a drag stays silent"); clock += 250;
    const changing = new ElementFake(); click(changing); changing.dataset.uiSound = undefined; changing.selected = true;
    await flush(); assert.equal(contexts[0].oscillators.length, 2, "a valid select still sounds if React removes its marker while updating the selection");
    documentFake.visibilityState = "hidden"; documentFake.fire("visibilitychange", {}); assert.equal(contexts[0].closeCalls, 1);
    cleanup(); cleanup = undefined; clock += 250; documentFake.visibilityState = "visible"; click(new ElementFake()); assert.equal(contexts.length, 1);
  } finally { cleanup?.(); for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } }
});
