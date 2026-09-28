import type { ClothesRail, Panel } from "./furniture";

// Only the data needed to render a board in the public 3D viewer.
// Visible geometry still permits measurements to be inferred; manufacturing
// labels, cutting instructions, edging and costing remain on the server.
export type VisualPanel = {
  size: [number, number, number];
  position: [number, number, number];
  material: string;
  door?: boolean;
  shape?: "cylinder";
};

export function publicGeometry(
  panels: readonly Panel[],
  fixtures: readonly ClothesRail[] = [],
): VisualPanel[] {
  return [
    ...panels.map(
      (panel): VisualPanel => ({
        size: [...panel.size],
        position: [...panel.position],
        material: panel.material,
        ...(typeof panel.door === "boolean" ? { door: panel.door } : {}),
      }),
    ),
    ...fixtures.map(
      (fixture): VisualPanel => ({
        size: [fixture.length, fixture.diameter, fixture.diameter],
        position: [...fixture.position],
        material: "metal",
        shape: "cylinder",
      }),
    ),
  ];
}
