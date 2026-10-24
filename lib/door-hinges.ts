import type { VisualPanel } from "./public-geometry.ts";

export type DoorHinge = "left" | "right";

/** Side of the free edge in the leaf's closed local coordinates. */
export function doorLatchDirection(panel: Pick<VisualPanel, "hinge">): 1 | -1 {
  return panel.hinge === "right" ? -1 : 1;
}

/**
 * Pair adjacent leaves inside one furniture model, without changing any panel.
 * Old public geometry can use the same visual fallback. An explicit hinge always
 * wins, so combining or rotating independent kitchen modules never re-pairs them.
 */
export function withDoorHinges(geometry: readonly VisualPanel[]): VisualPanel[] {
  const rows = new Map<string, { index: number; x: number; width: number }[]>();
  geometry.forEach((panel, index) => {
    if (!panel.door || ![...panel.size, ...panel.position, panel.rotationY ?? 0].every(Number.isFinite)) return;
    const rotation = panel.rotationY ?? 0;
    const cosine = Math.cos(rotation), sine = Math.sin(rotation);
    const x = panel.position[0] * cosine - panel.position[2] * sine;
    const z = panel.position[0] * sine + panel.position[2] * cosine;
    const key = [panel.position[1] - panel.size[1] / 2,
      panel.position[1] + panel.size[1] / 2, z + panel.size[2] / 2].map(value => value.toFixed(1)).join(":")
      + ":" + Math.atan2(sine, cosine).toFixed(6);
    const row = rows.get(key) ?? [];
    row.push({ index, x, width: panel.size[0] });
    rows.set(key, row);
  });
  const hinges = new Map<number, DoorHinge>();
  for (const row of rows.values()) {
    row.sort((a, b) => a.x - b.x);
    let pairIndex = 0;
    row.forEach((leaf, index) => {
      // Adjacent housings have two sides between fronts; don't pair across a gap.
      const previous = row[index - 1];
      if (previous && leaf.x - leaf.width / 2 - previous.x - previous.width / 2 > 30) pairIndex = 0;
      hinges.set(leaf.index, pairIndex++ % 2 === 0 ? "left" : "right");
    });
  }
  return geometry.map((panel, index) => panel.door && !panel.hinge && hinges.has(index)
    ? { ...panel, hinge: hinges.get(index)! }
    : panel);
}
