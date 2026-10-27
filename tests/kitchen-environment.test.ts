import assert from "node:assert/strict";
import test from "node:test";
import { buildKitchen, kitchenPlanSchema, publicKitchenQuote, type KitchenPlan } from "../lib/kitchen.ts";
import { defaultSettings, type Product } from "../lib/furniture.ts";
import { productTemplate } from "../lib/product-templates.ts";
import { kitchenObstacleBounds, verifyKitchenEnvironment, type KitchenObstacle } from "../lib/kitchen-environment.ts";
import { sweptDoorIntersects, KITCHEN_DOOR_OPEN_RADIANS, type Bounds3 } from "../lib/kitchen-opening-geometry.ts";

const base: Product = { ...productTemplate("kitchen-base"), id: "room-base", name: "Base sintética", active: true };
const furniture = (id: string, wall: "a" | "b" = "a"): KitchenPlan["items"][number] => ({ id, kind: "furniture", wall, row: "base", productId: base.id, config: { ...base.defaults, width: 600, depth: 600 } });
const plan = (items: KitchenPlan["items"] = [furniture("one")]): KitchenPlan => ({ layout: "straight", walls: { a: 3000, b: 2400 }, roomHeight: 2600, wallElevation: 1500, install: false, transport: false, items });
const obstacle = (changes: Partial<KitchenObstacle> = {}): KitchenObstacle => ({ id: "column", name: "Columna medida", kind: "column", wall: "a", offset: 100, elevation: 0, width: 200, height: 2300, depth: 200, ...changes });
const box = (x: number, z: number, width = 10): Bounds3 => ({ min: [x, 100, z], max: [x + width, 300, z + width] });

test("old kitchen plans and snapshots stay optional, unchanged and privately priced", () => {
  const input = plan(), before = structuredClone(input);
  assert.equal("environment" in kitchenPlanSchema.parse(input), false);
  const snapshot = buildKitchen(input, [base], defaultSettings);
  assert.deepEqual(input, before);
  assert.equal(snapshot.result.verification?.environmentRecorded, false);
  assert.ok(snapshot.result.verification!.doorsChecked > 0);
  delete snapshot.result.verification;
  const historical = structuredClone(snapshot);
  assert.equal(publicKitchenQuote(snapshot).verification, undefined);
  assert.deepEqual(snapshot, historical, "reading an old snapshot does not silently run new checks");
  const hidden = publicKitchenQuote(snapshot, [{ ...base, showPrice: false }]);
  assert.equal(hidden.price, null); assert.equal(hidden.modules[0].price, null);
});

test("obstacle schema rejects off-wall, over-ceiling, foreign and nonfinite data", () => {
  for (const changes of [{ offset: -10 }, { offset: 2900 }, { elevation: 1000 }, { width: 15 }, { depth: NaN }, { wall: "b" as const }])
    assert.equal(kitchenPlanSchema.safeParse({ ...plan(), environment: { obstacles: [obstacle(changes)] } }).success, false, JSON.stringify(changes));
  assert.equal(kitchenPlanSchema.safeParse({ ...plan(), environment: { obstacles: [obstacle(), obstacle()] } }).success, false);
  assert.equal(kitchenPlanSchema.safeParse({ ...plan(), environment: { obstacles: [{ ...obstacle(), executable: "x" }] } }).success, false);
  assert.equal(kitchenPlanSchema.safeParse({ ...plan(), environment: { obstacles: Array.from({ length: 25 }, (_, i) => obstacle({ id: `o${i}` })) } }).success, false);
});

test("physical wall volumes block closed modules and equipment; a window above the base stays clear", () => {
  assert.throws(() => buildKitchen({ ...plan(), environment: { obstacles: [obstacle()] } }, [base], defaultSettings), /volumen reservado.*Columna medida/);
  const fridge: KitchenPlan["items"][number] = { id: "fridge", kind: "fridge", wall: "a", row: "tall", width: 900, height: 2000, depth: 650 };
  assert.throws(() => buildKitchen({ ...plan([fridge, furniture("one")]), environment: { obstacles: [obstacle()] } }, [base], defaultSettings), /Espacio para refrigeradora.*volumen reservado/);
  const input = { ...plan(), environment: { obstacles: [obstacle({ kind: "window", elevation: 1200, height: 800 })] } };
  const result = buildKitchen(input, [base], defaultSettings).result;
  assert.equal(result.verification?.issues.length, 0);
});

test("connections inside a cabinet require review but only explicit access reservations block it", () => {
  const input = { ...plan(), environment: { obstacles: [obstacle({ kind: "connection", name: "Toma medida" })] } };
  const expected = buildKitchen(plan(), [base], defaultSettings).result.price;
  const quote = buildKitchen(input, [base], defaultSettings).result;
  assert.equal(quote.price, expected);
  assert.ok(quote.verification?.issues.some(issue => issue.code === "connection-review" && issue.severity === "warning"));
  assert.throws(() => buildKitchen({ ...input, environment: { obstacles: [{ ...input.environment.obstacles[0], reserveAccess: true }] } }, [base], defaultSettings), /volumen reservado/);
});

test("obstacle coordinates follow A and the rotated B wall before scene centring", () => {
  const a = kitchenObstacleBounds(plan(), obstacle({ offset: 500, elevation: 700, width: 400, height: 600, depth: 200 }));
  assert.deepEqual(a, { min: [500, 700, 0], max: [900, 1300, 200] });
  const b = kitchenObstacleBounds(plan(), obstacle({ wall: "b", offset: 500, elevation: 700, width: 400, height: 600, depth: 200 }));
  assert.deepEqual(b, { min: [2800, 700, 500], max: [3000, 1300, 900] });
});

test("opposing leaf sweeps both advance forward and rotate correctly on B", () => {
  const shared = { width: 400, depth: 18, bottom: 0, top: 800 };
  assert.equal(sweptDoorIntersects({ ...shared, pivot: [0, 0], rotation: 0, direction: 1 }, box(100, 300)), true);
  assert.equal(sweptDoorIntersects({ ...shared, pivot: [800, 0], rotation: 0, direction: -1 }, box(690, 300)), true);
  assert.equal(sweptDoorIntersects({ ...shared, pivot: [0, 0], rotation: 0, direction: 1 }, box(100, -300)), false);
  assert.equal(sweptDoorIntersects({ ...shared, pivot: [0, 0], rotation: -Math.PI / 2, direction: 1 }, box(-310, 100)), true);
  assert.equal(sweptDoorIntersects({ ...shared, pivot: [0, 800], rotation: -Math.PI / 2, direction: -1 }, box(-310, 690)), true);
  assert.equal(sweptDoorIntersects({ ...shared, pivot: [0, 0], rotation: 0, direction: 1 }, box(500, 500)), false);
  assert.equal(KITCHEN_DOOR_OPEN_RADIANS, Math.PI * 0.58);
});

test("continuous sweep cannot skip a thin obstacle between angle samples or a vertically separate object", () => {
  const angle = 23.7 * Math.PI / 180, radius = 390;
  const x = radius * Math.cos(angle), z = radius * Math.sin(angle);
  const thin: Bounds3 = { min: [x, 10, z], max: [x + .1, 20, z + .1] };
  const leaf = { pivot: [0, 0] as [number, number], rotation: 0, direction: 1 as const, width: 400, depth: 6, bottom: 0, top: 800 };
  assert.equal(sweptDoorIntersects(leaf, thin), true);
  assert.equal(sweptDoorIntersects(leaf, { ...thin, min: [x, 900, z], max: [x + .1, 1000, z + .1] }), false);
});

test("real generated glass and melamine doors warn at a perpendicular module without changing prices or boards", () => {
  for (const front of ["melamine", "glass", "aluminum-glass"] as const) {
    const model = { ...base, frontOptions: ["melamine", "glass", "aluminum-glass"] as Product["frontOptions"] };
    const a = furniture("a"), b = furniture("b", "b");
    if (a.kind === "furniture") a.config = { ...a.config, front, handle: front === "melamine" ? "push" : "exterior" };
    const spacer: KitchenPlan["items"][number] = { id: "space", kind: "space", wall: "a", row: "base", width: 2000, height: 900, depth: 600 };
    const tail = { ...spacer, id: "space2", width: 400 };
    const input = { ...plan([spacer, tail, a, b]), layout: "l" as const };
    const snapshot = buildKitchen(input, [model], defaultSettings);
    assert.ok(snapshot.result.verification?.issues.some(issue => issue.code === "door-obstruction" && issue.itemId === "a"), front);
    assert.ok(snapshot.result.verification!.doorsChecked >= 2);
    assert.equal(snapshot.modules[0].result.panels.every(panel => !panel.door || panel.size[2] === 18), true);
  }
});

test("a measured drawer checks its translated corridor against B without inventing parts or price", () => {
  const input: KitchenPlan = { ...plan([{ id: "air", kind: "space", wall: "a", row: "base", width: 2000, height: 900, depth: 600 }, { id: "air2", kind: "space", wall: "a", row: "base", width: 400, height: 900, depth: 600 }, furniture("a"), furniture("b", "b")]), layout: "l" };
  const baseline = buildKitchen(input, [base], defaultSettings);
  const measured = { ...input, environment: { obstacles: [], drawers: [{ id: "drawer", itemId: "a", name: "Cajón sintético medido", offset: 50, elevation: 100, width: 500, height: 200, extension: 500 }] } };
  const before = structuredClone(measured), checked = buildKitchen(measured, [base], defaultSettings);
  assert.equal(checked.result.verification?.drawersChecked, 1);
  assert.ok(checked.result.verification?.issues.some(issue => issue.code === "drawer-obstruction" && issue.targetId === "b"));
  assert.deepEqual(checked.result.geometry, baseline.result.geometry);
  assert.equal(checked.result.price, baseline.result.price);
  assert.deepEqual(checked.modules.map(module => module.result), baseline.modules.map(module => module.result));
  assert.deepEqual(measured, before);
  assert.equal(kitchenPlanSchema.safeParse({ ...measured, environment: { ...measured.environment, drawers: [{ ...measured.environment.drawers[0], itemId: "missing" }] } }).success, false);
  assert.equal(kitchenPlanSchema.safeParse({ ...measured, environment: { ...measured.environment, drawers: [{ ...measured.environment.drawers[0], width: 600 }] } }).success, false);
});

test("a front can hit an obstacle only during opening; equipment reservations also obstruct it", () => {
  const input = plan();
  const module = { id: "leaf", name: "Mueble sintético", kind: "furniture" as const, wall: "a" as const, row: "base" as const, price: 0, position: [200, 400, 0] as [number, number, number], size: [400, 800, 10] as [number, number, number], rotationY: 0 };
  const target = { ...module, id: "appliance", name: "Reserva sintética", kind: "fridge" as const, position: [100, 400, 300] as [number, number, number], size: [20, 800, 20] as [number, number, number] };
  const fronts = new Map([[module.id, [{ door: true, hinge: "left" as const, position: [0, 400, 5] as [number, number, number], size: [400, 800, 6] as [number, number, number], material: "glass", surface: "glass" as const }]]]);
  const result = verifyKitchenEnvironment(input, [module, target], fronts);
  assert.ok(result.issues.some(issue => issue.code === "door-obstruction" && issue.targetId === "appliance"));
});
