/** The same 104.4° preview angle used by the viewer, in radians. */
export const KITCHEN_DOOR_OPEN_RADIANS = Math.PI * 0.58;
export type Point2 = [number, number];
export type Bounds3 = { min: [number, number, number]; max: [number, number, number] };
export const intersectsBoxes = (a: Bounds3, b: Bounds3) => a.min.every((value, axis) =>
  Math.min(a.max[axis], b.max[axis]) - Math.max(value, b.min[axis]) > 0.01);

export function rotatePoint(point: Point2, angle: number): Point2 {
  return [point[0] * Math.cos(angle) + point[1] * Math.sin(angle), -point[0] * Math.sin(angle) + point[1] * Math.cos(angle)];
}
const cross = (a: Point2, b: Point2, c: Point2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function hull(points: Point2[]): Point2[] {
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower: Point2[] = [], upper: Point2[] = [];
  for (const point of sorted) { while (lower.length > 1 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop(); lower.push(point); }
  for (const point of sorted.slice().reverse()) { while (upper.length > 1 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop(); upper.push(point); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function intersectsPolygonBox(polygon: Point2[], box: Bounds3, margin: number) {
  const rect: Point2[] = [[box.min[0] - margin, box.min[2] - margin], [box.max[0] + margin, box.min[2] - margin], [box.max[0] + margin, box.max[2] + margin], [box.min[0] - margin, box.max[2] + margin]];
  const axes: Point2[] = [[1, 0], [0, 1], ...polygon.map((point, i): Point2 => { const next = polygon[(i + 1) % polygon.length]; return [-(next[1] - point[1]), next[0] - point[0]]; })];
  return axes.every(axis => {
    const values = (points: Point2[]) => points.map(point => point[0] * axis[0] + point[1] * axis[1]);
    const a = values(polygon), b = values(rect);
    return Math.min(Math.max(...a), Math.max(...b)) - Math.max(Math.min(...a), Math.min(...b)) > 0.01 * Math.hypot(...axis);
  });
}

/** Conservative continuous sweep: hull endpoints plus the bounded arc sagitta.
 * This does not skip thin obstacles between angular samples. Near contact can
 * produce a warning, never a claim of exact hardware clearance. Millimetres.
 */
export function sweptDoorIntersects({ pivot, rotation, direction, width, depth, bottom, top, angle = KITCHEN_DOOR_OPEN_RADIANS }: {
  pivot: Point2; rotation: number; direction: 1 | -1; width: number; depth: number; bottom: number; top: number; angle?: number;
}, box: Bounds3): boolean {
  if (Math.min(top, box.max[1]) - Math.max(bottom, box.min[1]) <= 0.01) return false;
  // Cheap, exact rejection before constructing any angular polygons. Most
  // other modules in a long kitchen lie outside the leaf's entire radius.
  const radius = Math.hypot(width, depth / 2);
  const dx = Math.max(box.min[0] - pivot[0], 0, pivot[0] - box.max[0]);
  const dz = Math.max(box.min[2] - pivot[1], 0, pivot[1] - box.max[2]);
  if (Math.hypot(dx, dz) > radius + 0.02) return false;
  const local: Point2[] = [[0, -depth / 2], [direction * width, -depth / 2], [direction * width, depth / 2], [0, depth / 2]];
  const steps = Math.ceil(angle / (Math.PI / 90));
  const increment = angle / steps;
  const margin = radius * (1 - Math.cos(increment / 2)) + 0.02;
  const at = (step: number) => local.map(point => { const rotated = rotatePoint(point, rotation - direction * increment * step); return [pivot[0] + rotated[0], pivot[1] + rotated[1]] as Point2; });
  let previous = at(0);
  for (let step = 1; step <= steps; step++) {
    const next = at(step);
    if (intersectsPolygonBox(hull([...previous, ...next]), box, margin)) return true;
    previous = next;
  }
  return false;
}
