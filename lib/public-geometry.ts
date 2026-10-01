import type { Config, Fixture, Panel } from "./furniture";

// Only the data needed to render a board in the public 3D viewer.
// Visible geometry still permits measurements to be inferred; manufacturing
// labels, cutting instructions, edging and costing remain on the server.
export type VisualPanel = {
  size: [number, number, number];
  position: [number, number, number];
  material: string;
  door?: boolean;
  shape?: "cylinder";
  surface?: "glass" | "aluminum-glass" | "placeholder";
  rotationY?: number;
  handle?: Config["handle"];
};

export function publicGeometry(
  panels: readonly Panel[],
  fixtures: readonly Fixture[] = [],
): VisualPanel[] {
  return [
    ...panels.map((panel): VisualPanel => ({
      size: [...panel.size],
      position: [...panel.position],
      material: panel.material,
      ...(typeof panel.door === "boolean" ? { door: panel.door } : {}),
    })),
    ...fixtures.map((fixture): VisualPanel =>
      fixture.kind === "front-door"
        ? {
            size: [...fixture.size],
            position: [...fixture.position],
            material: fixture.surface,
            surface: fixture.surface,
            door: true,
          }
        : {
            size: [fixture.length, fixture.diameter, fixture.diameter],
            position: [...fixture.position],
            material: "metal",
            shape: "cylinder",
          },
    ),
  ];
}
