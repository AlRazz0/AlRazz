import { z } from "zod";
import type { KitchenPlan, KitchenModule } from "./kitchen.ts";
import type { VisualPanel } from "./public-geometry.ts";
import { doorLatchDirection } from "./door-hinges.ts";
import { KITCHEN_DOOR_OPEN_RADIANS, intersectsBoxes, rotatePoint, sweptDoorIntersects, type Bounds3 } from "./kitchen-opening-geometry.ts";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/);
const measure = (min: number, max: number) => z.number().finite().int().min(min).max(max).multipleOf(10);
export const kitchenObstacleSchema = z.object({
  id, name: z.string().trim().min(1).max(80), kind: z.enum(["window", "column", "connection"]), wall: z.enum(["a", "b"]),
  offset: measure(0, 6000), elevation: measure(0, 4000), width: measure(10, 6000), height: measure(10, 4000), depth: measure(10, 3000),
  reserveAccess: z.boolean().optional(),
}).strict();
export const kitchenDrawerSchema = z.object({
  id, itemId: id, name: z.string().trim().min(1).max(80), offset: measure(0, 6000), elevation: measure(0, 4000),
  width: measure(10, 3000), height: measure(10, 2000), extension: measure(10, 2000),
}).strict();
export const kitchenEnvironmentSchema = z.object({ obstacles: z.array(kitchenObstacleSchema).max(24), drawers: z.array(kitchenDrawerSchema).max(16).optional() }).strict();
export type KitchenEnvironment = z.infer<typeof kitchenEnvironmentSchema>;
export type KitchenObstacle = z.infer<typeof kitchenObstacleSchema>;
export type KitchenDrawer = z.infer<typeof kitchenDrawerSchema>;
export type KitchenVerificationIssue = { code: "obstacle-overlap" | "connection-review" | "door-obstruction" | "drawer-obstruction"; severity: "error" | "warning"; itemId: string; obstacleId?: string; targetId?: string; message: string };
export type KitchenVerification = { environmentRecorded: boolean; doorsChecked: number; drawersChecked: number; openingDegrees: number; issues: KitchenVerificationIssue[] };

/** Physical or access-reserved prism measured from the named wall, before centring. */
export function kitchenObstacleBounds(plan: Pick<KitchenPlan, "walls">, obstacle: KitchenObstacle): Bounds3 {
  return obstacle.wall === "a"
    ? { min: [obstacle.offset, obstacle.elevation, 0], max: [obstacle.offset + obstacle.width, obstacle.elevation + obstacle.height, obstacle.depth] }
    : { min: [plan.walls.a - obstacle.depth, obstacle.elevation, obstacle.offset], max: [plan.walls.a, obstacle.elevation + obstacle.height, obstacle.offset + obstacle.width] };
}
export function kitchenModuleBounds(module: KitchenModule): Bounds3 {
  const size = module.wall === "b" ? [module.size[2], module.size[1], module.size[0]] : module.size;
  return { min: module.position.map((v, i) => v - size[i] / 2) as Bounds3["min"], max: module.position.map((v, i) => v + size[i] / 2) as Bounds3["max"] };
}

/** Uses real server fronts and measured drawer travel; never makes parts or prices. */
export function verifyKitchenEnvironment(plan: KitchenPlan, modules: readonly KitchenModule[], fronts: ReadonlyMap<string, readonly VisualPanel[]>): KitchenVerification {
  const issues: KitchenVerificationIssue[] = [];
  const report: KitchenVerification = { environmentRecorded: plan.environment !== undefined, doorsChecked: 0, drawersChecked: 0, openingDegrees: KITCHEN_DOOR_OPEN_RADIANS * 180 / Math.PI, issues };
  const physical = modules.filter(module => module.kind !== "space");
  const obstacles = (plan.environment?.obstacles ?? []).map(obstacle => ({ ...obstacle, box: kitchenObstacleBounds(plan, obstacle), blocking: obstacle.kind !== "connection" || obstacle.reserveAccess === true }));
  for (const module of physical) for (const obstacle of obstacles) if (intersectsBoxes(kitchenModuleBounds(module), obstacle.box)) issues.push({
    code: obstacle.blocking ? "obstacle-overlap" : "connection-review", severity: obstacle.blocking ? "error" : "warning", itemId: module.id, obstacleId: obstacle.id,
    message: obstacle.blocking ? `«${module.name}» ocupa el volumen reservado de «${obstacle.name}» en la pared ${obstacle.wall.toUpperCase()}. Cambia la posición, la reserva o el módulo.`
      : `La conexión «${obstacle.name}» queda dentro de «${module.name}». El taller debe confirmar compatibilidad y acceso; no se ha supuesto un recorte ni una instalación.`,
  });
  const walls: { id: string; name: string; box: Bounds3 }[] = [
    { id: "wall-a", name: "pared A", box: { min: [-10000, 0, -10000], max: [10000, plan.roomHeight ?? 2600, 0] } },
    ...(plan.layout === "l" ? [{ id: "wall-b", name: "pared B", box: { min: [plan.walls.a, 0, -10000], max: [10000, plan.roomHeight ?? 2600, 10000] } as Bounds3 }] : []),
  ];
  for (const module of physical.filter(module => module.kind === "furniture")) {
    const blockers: { id: string; name: string; box: Bounds3; review?: boolean }[] = [...physical.filter(other => other.id !== module.id).map(other => ({ id: other.id, name: other.name, box: kitchenModuleBounds(other) })), ...obstacles.map(o => ({ id: o.id, name: o.name, box: o.box, review: !o.blocking })), ...walls];
    for (const front of fronts.get(module.id) ?? []) {
      if (!front.door) continue;
      report.doorsChecked++;
      const direction = doorLatchDirection(front), rotation = module.rotationY + (front.rotationY ?? 0);
      const local = rotatePoint([front.position[0], front.position[2]], module.rotationY);
      const hingeOffset = rotatePoint([-direction * front.size[0] / 2, 0], rotation);
      const pivot: [number, number] = [module.position[0] + local[0] + hingeOffset[0], module.position[2] + local[1] + hingeOffset[1]];
      const elevation = module.position[1] - module.size[1] / 2;
      // The leaf/frame dimensions are exact. A 25 mm outward allowance covers
      // the existing visual grip, conservatively across the leaf width.
      const depth = front.size[2] + (front.handle && front.handle !== "push" ? 50 : 0);
      for (const blocker of blockers) if (sweptDoorIntersects({ pivot, rotation, direction, width: front.size[0], depth, bottom: elevation + front.position[1] - front.size[1] / 2, top: elevation + front.position[1] + front.size[1] / 2 }, blocker.box)) {
        issues.push(blocker.review ? { code: "connection-review", severity: "warning", itemId: module.id, obstacleId: blocker.id, message: `La apertura de una puerta de «${module.name}» pasa por la zona descrita de la conexión «${blocker.name}». Revisa con el taller los elementos conectados y su acceso.` }
          : { code: "door-obstruction", severity: "warning", itemId: module.id, targetId: blocker.id, message: `Posible interferencia al abrir una puerta de «${module.name}» con «${blocker.name}» (recorrido de 0 a ${report.openingDegrees.toFixed(1)}°). Revisa la apertura y el herraje con el taller.` });
      }
    }
    for (const drawer of plan.environment?.drawers?.filter(drawer => drawer.itemId === module.id) ?? []) {
      report.drawersChecked++;
      const along = -module.size[0] / 2 + drawer.offset;
      const points = [[along, module.size[2] / 2], [along + drawer.width, module.size[2] / 2 + drawer.extension]].map(point => rotatePoint(point as [number, number], module.rotationY));
      const bottom = module.position[1] - module.size[1] / 2 + drawer.elevation;
      const box: Bounds3 = { min: [module.position[0] + Math.min(points[0][0], points[1][0]), bottom, module.position[2] + Math.min(points[0][1], points[1][1])], max: [module.position[0] + Math.max(points[0][0], points[1][0]), bottom + drawer.height, module.position[2] + Math.max(points[0][1], points[1][1])] };
      for (const blocker of blockers) if (intersectsBoxes(box, blocker.box)) issues.push(blocker.review
        ? { code: "connection-review", severity: "warning", itemId: module.id, obstacleId: blocker.id, message: `El recorrido medido de «${drawer.name}» pasa por la zona de la conexión «${blocker.name}». Confirma su acceso y los elementos conectados con el taller.` }
        : { code: "drawer-obstruction", severity: "warning", itemId: module.id, targetId: blocker.id, message: `El recorrido medido de «${drawer.name}» en «${module.name}» coincide con «${blocker.name}». Revisa la extensión y el acceso antes de fabricar.` });
    }
  }
  // One message per module/target, even when both leaves touch the same obstacle.
  report.issues = issues.filter((issue, index) => issues.findIndex(other => other.code === issue.code && other.itemId === issue.itemId && other.obstacleId === issue.obstacleId && other.targetId === issue.targetId) === index);
  return report;
}
