import type { Config } from "../lib/furniture";
import type { VisualPanel } from "../lib/public-geometry";
import type { PublicMaterial } from "./types";
import { withDoorHinges, doorLatchDirection } from "../lib/door-hinges.ts";

type Vector = [number, number, number];
export type ThumbnailPoint = { x: number; y: number };
type Surface = "melamine" | "glass" | "aluminum-glass" | "metal" | "placeholder";
export type ThumbnailFace = {
  key: string;
  source: number;
  points: ThumbnailPoint[];
  color: string;
  edge: string;
  surface: Surface;
  door: boolean;
  opacity: number;
  handle?: [ThumbnailPoint, ThumbnailPoint];
};
export type CatalogProjection = {
  width: number;
  height: number;
  faces: ThumbnailFace[];
  shadow: { x: number; y: number; rx: number; ry: number };
};
type ProjectedPoint = ThumbnailPoint & { depth: number };
type RawFace = Omit<ThumbnailFace, "points" | "handle"> & {
  points: ProjectedPoint[];
  handle?: [ProjectedPoint, ProjectedPoint];
  depth: number;
  plane: [number, number, number];
  bounds: [number, number, number, number];
};

// A fixed orthographic product view. This only projects server-supplied panels;
// it never derives boards, doors, dimensions, prices or construction from a model.
const YAW = Math.PI * 27 / 180;
const PITCH = Math.PI * 18 / 180;
const RIGHT: Vector = [Math.cos(YAW), 0, -Math.sin(YAW)];
const DOWN: Vector = [Math.sin(YAW) * Math.sin(PITCH), -Math.cos(PITCH), Math.cos(YAW) * Math.sin(PITCH)];
const CAMERA: Vector = [Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH)];
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const project = (point: Vector): ProjectedPoint => ({ x: dot(point, RIGHT), y: dot(point, DOWN), depth: dot(point, CAMERA) });
const cross = (a: ThumbnailPoint, b: ThumbnailPoint, c: ThumbnailPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const signedArea = (points: ThumbnailPoint[]) => points.reduce((area, p, i) => {
  const q = points[(i + 1) % points.length];
  return area + p.x * q.y - q.x * p.y;
}, 0) / 2;

function rotate(point: Vector, angle: number): Vector {
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  return [point[0] * cosine + point[2] * sine, point[1], -point[0] * sine + point[2] * cosine];
}

function shade(color: string, factor: number) {
  return "#" + [1, 3, 5].map((offset) => Math.max(0, Math.min(255,
    Math.round(parseInt(color.slice(offset, offset + 2), 16) * factor),
  )).toString(16).padStart(2, "0")).join("");
}

/** Convex intersection lets painter order use the actual overlap, not panel centers. */
function overlap(a: ThumbnailPoint[], b: ThumbnailPoint[]) {
  let output = a;
  const direction = signedArea(b) >= 0 ? 1 : -1;
  for (let i = 0; i < b.length && output.length; i++) {
    const from = b[i], to = b[(i + 1) % b.length];
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length];
      const pDistance = cross(from, to, p) * direction;
      const qDistance = cross(from, to, q) * direction;
      if (pDistance >= 0) output.push(p);
      if ((pDistance >= 0) !== (qDistance >= 0)) {
        const amount = pDistance / (pDistance - qDistance);
        output.push({ x: p.x + (q.x - p.x) * amount, y: p.y + (q.y - p.y) * amount });
      }
    }
  }
  return output;
}

function painterOrder(faces: RawFace[]) {
  const outgoing = faces.map(() => new Set<number>());
  const incoming = faces.map(() => 0);
  for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
    const a = faces[i], b = faces[j];
    if (a.source === b.source || a.bounds[2] <= b.bounds[0] || b.bounds[2] <= a.bounds[0]
      || a.bounds[3] <= b.bounds[1] || b.bounds[3] <= a.bounds[1]) continue;
    const intersection = overlap(a.points, b.points);
    if (intersection.length < 3 || Math.abs(signedArea(intersection)) < 1e-5) continue;
    const center = intersection.reduce((p, q) => ({ x: p.x + q.x / intersection.length, y: p.y + q.y / intersection.length }), { x: 0, y: 0 });
    const depthAt = (face: RawFace) => face.plane[0] * center.x + face.plane[1] * center.y + face.plane[2];
    const difference = depthAt(a) - depthAt(b);
    if (Math.abs(difference) < 1e-6) continue;
    const far = difference < 0 ? i : j, near = difference < 0 ? j : i;
    outgoing[far].add(near);
    incoming[near]++;
  }
  const remaining = new Set(faces.map((_, i) => i));
  const result: RawFace[] = [];
  while (remaining.size) {
    // Intersecting input faces may form a cycle. Resolve only that ambiguity
    // deterministically; all independent occlusion constraints remain in place.
    const ready = [...remaining].filter((i) => incoming[i] === 0);
    const next = (ready.length ? ready : [...remaining]).reduce((a, b) => faces[a].depth <= faces[b].depth ? a : b);
    remaining.delete(next);
    result.push(faces[next]);
    for (const near of outgoing[next]) incoming[near]--;
  }
  return result;
}

export function buildCatalogThumbnail(
  geometry: readonly VisualPanel[],
  materials: readonly Pick<PublicMaterial, "id" | "color">[],
  defaultHandle: Config["handle"] = "push",
): CatalogProjection | null {
  const colors = new Map(materials.map((material) => [material.id, material.color]));
  const faces: RawFace[] = [];
  withDoorHinges(geometry).forEach((panel, source) => {
    const angle = panel.rotationY ?? 0;
    if (!Number.isFinite(angle) || panel.size.some((n) => !Number.isFinite(n) || n <= 0 || n > 1e7)
      || panel.position.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e7)) return;
    const [width, height, depth] = panel.size;
    const material = colors.get(panel.material);
    const surface: Surface = panel.surface ?? (panel.shape === "cylinder" || panel.material === "metal" ? "metal" : "melamine");
    const base = surface === "glass" || surface === "aluminum-glass" ? "#cce1df"
      : surface === "metal" ? "#a8aba8" : surface === "placeholder" ? "#abaea7"
      : material && /^#[0-9a-f]{6}$/i.test(material) ? material : "#b99469";
    const world = (point: Vector): Vector => {
      const rotated = rotate(point, angle);
      return rotated.map((n, axis) => n + panel.position[axis]) as Vector;
    };
    function addFace(vertices: Vector[], normal: Vector, name: string, front = false) {
      const facing = rotate(normal, angle);
      if (dot(facing, CAMERA) <= 1e-7) return;
      const points = vertices.map((p) => project(world(p)));
      const [p, q, r] = points;
      const determinant = cross(p, q, r);
      if (Math.abs(determinant) < 1e-8) return;
      const dx = ((q.depth - p.depth) * (r.y - p.y) - (r.depth - p.depth) * (q.y - p.y)) / determinant;
      const dy = ((q.x - p.x) * (r.depth - p.depth) - (r.x - p.x) * (q.depth - p.depth)) / determinant;
      const transparent = surface === "glass" || surface === "aluminum-glass";
      const factor = Math.max(.68, Math.min(1.1, .96 + facing[1] * .14 + facing[2] * .02 - facing[0] * .15));
      const handle = panel.door && front && (panel.handle ?? defaultHandle) !== "push"
        ? [-Math.min(45, height * .14), Math.min(45, height * .14)].map((y) => project(world([doorLatchDirection(panel) * (width / 2 - Math.min(45, width * .12)), y, depth / 2 + .5]))) as [ProjectedPoint, ProjectedPoint]
        : undefined;
      faces.push({
        key: `${source}-${name}`, source, points, handle,
        color: shade(base, factor), edge: transparent ? "#7baba5" : shade(base, .65),
        surface, door: !!panel.door,
        opacity: transparent ? .28 : surface === "placeholder" ? .28 : 1,
        depth: points.reduce((sum, p) => sum + p.depth / points.length, 0),
        plane: [dx, dy, p.depth - dx * p.x - dy * p.y],
        bounds: [Math.min(...points.map((p) => p.x)), Math.min(...points.map((p) => p.y)), Math.max(...points.map((p) => p.x)), Math.max(...points.map((p) => p.y))],
      });
    }
    if (panel.shape === "cylinder") {
      // The public cylinder primitive is a rail along local X, as in Viewer.
      const radius = height / 2;
      const ring = (x: number) => Array.from({ length: 12 }, (_, i): Vector => [x, Math.cos(i * Math.PI / 6) * radius, Math.sin(i * Math.PI / 6) * radius]);
      const left = ring(-width / 2), right = ring(width / 2);
      addFace(left, [-1, 0, 0], "cap-left");
      addFace(right, [1, 0, 0], "cap-right");
      for (let i = 0; i < left.length; i++) {
        const next = (i + 1) % left.length, middle = (i + .5) * Math.PI / 6;
        addFace([left[i], right[i], right[next], left[next]], [0, Math.cos(middle), Math.sin(middle)], `rail-${i}`);
      }
      return;
    }
    const x = width / 2, y = height / 2, z = depth / 2;
    const points: Vector[] = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
    const face = (indices: number[], normal: Vector, name: string, front = false) => addFace(indices.map((i) => points[i]), normal, name, front);
    face([4, 5, 6, 7], [0, 0, 1], "front", true);
    face([1, 0, 3, 2], [0, 0, -1], "back");
    face([1, 5, 6, 2], [1, 0, 0], "right");
    face([4, 0, 3, 7], [-1, 0, 0], "left");
    face([3, 2, 6, 7], [0, 1, 0], "top");
  });
  if (!faces.length) return null;
  const minX = Math.min(...faces.map((f) => f.bounds[0])), minY = Math.min(...faces.map((f) => f.bounds[1]));
  const maxX = Math.max(...faces.map((f) => f.bounds[2])), maxY = Math.max(...faces.map((f) => f.bounds[3]));
  const width = 400, height = 320;
  const scale = Math.min((width - 56) / Math.max(1, maxX - minX), (height - 60) / Math.max(1, maxY - minY));
  const offsetX = (width - (maxX - minX) * scale) / 2 - minX * scale;
  const offsetY = 24 + (height - 60 - (maxY - minY) * scale) / 2 - minY * scale;
  const fit = (point: ThumbnailPoint): ThumbnailPoint => ({ x: point.x * scale + offsetX, y: point.y * scale + offsetY });
  return {
    width, height,
    faces: painterOrder(faces).map(({ points, handle, depth: _depth, plane: _plane, bounds: _bounds, ...face }) => ({
      ...face, points: points.map(fit), ...(handle ? { handle: handle.map(fit) as [ThumbnailPoint, ThumbnailPoint] } : {}),
    })),
    shadow: { x: width / 2, y: maxY * scale + offsetY + 9, rx: Math.max(24, (maxX - minX) * scale * .43), ry: Math.max(3, Math.min(9, (maxX - minX) * scale * .025)) },
  };
}
