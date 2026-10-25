type Interval = [number, number];
const GRID = 10;
// Ignore floating-point noise at a grid boundary, not a measurable obstruction.
const EPSILON = 1e-7;
const roundUp = (value: number) => Math.ceil((value - EPSILON) / GRID) * GRID + 0;
const roundDown = (value: number) => Math.floor((value + EPSILON) / GRID) * GRID + 0;

/** Free placement ranges only; this never creates a part or calculates a price. */
export function subtractKitchenIntervals(
  interval: Interval,
  blockers: readonly Interval[],
  minimumWidth = GRID,
): Interval[] {
  if (!interval.every(Number.isFinite) || interval[1] <= interval[0]
    || !Number.isFinite(minimumWidth) || minimumWidth <= 0) return [];
  const from = roundUp(interval[0]), to = roundDown(interval[1]);
  const minimum = Math.max(GRID, roundUp(minimumWidth));
  if (![from, to, minimum].every(Number.isFinite) || to - from < minimum) return [];
  // Round obstacles outward and the available range inward. An irregular edge
  // may reduce the offer, but must never make occupied space look available.
  const occupied = blockers
    .filter((block) => block.every(Number.isFinite) && block[1] > block[0])
    .map(([start, end]): Interval => [Math.max(from, roundDown(start)), Math.min(to, roundUp(end))])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const free: Interval[] = [];
  let cursor = from;
  for (const [start, end] of occupied) {
    if (end <= cursor) continue;
    if (start - cursor >= minimum) free.push([cursor, start]);
    cursor = Math.max(cursor, end);
    if (cursor >= to) break;
  }
  if (to - cursor >= minimum) free.push([cursor, to]);
  return free;
}
