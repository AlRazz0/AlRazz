import type { KitchenQuote } from "./kitchen.ts";
import { buildKitchenLayoutView } from "./kitchen-layout-view.ts";

export type KitchenSpaceSummary = {
  height: number;
  moduleDepth: number;
  walls: {
    wall: "a" | "b";
    length: number;
    corner: number;
    rows: { row: "base" | "wall"; occupied: number; blocked: number; free: number }[];
  }[];
};

export function kitchenSpaceReasons(moduleCount: number): string[] {
  return [
    `Propuesta inicial con ${moduleCount} módulos publicados, dentro de las paredes y altura indicadas.`,
    "Melamina de 18 mm. La ocupación se muestra por pared y por fila; los muebles bajos y las alacenas no se suman entre sí.",
    "El espacio libre puede estar repartido en varios huecos. Revisa cada hueco al añadir un módulo.",
    "Los electrodomésticos, lavadero e instalaciones no están incluidos: añade sus reservas y revisa la distribución antes de solicitar la cotización final.",
  ];
}

/** Display the same placed intervals as the planner, without recalculating a quote. */
export function summarizeKitchenSpace(quote: KitchenQuote): KitchenSpaceSummary {
  const view = buildKitchenLayoutView(quote.plan, quote);
  if (!view.fromQuote || view.invalid) throw new Error("La distribución necesita una cotización válida para resumir sus medidas.");
  const measured = (value: number | null): number => {
    if (value === null || !Number.isFinite(value) || value < 0) throw new Error("No se pudo comprobar el espacio disponible de la cocina.");
    return value;
  };
  return {
    height: measured(quote.envelope.height),
    moduleDepth: measured(Math.max(...quote.modules.filter(module => module.kind === "furniture").map(module => module.size[2]))),
    walls: view.walls.map(wall => ({
      wall: wall.id,
      length: measured(wall.length),
      corner: measured(wall.lanes[0].corner),
      rows: (["base", "wall"] as const).map(row => {
        const lane = wall.lanes.find(lane => lane.id === row)!;
        return { row, occupied: measured(lane.occupied), blocked: measured(lane.blocked), free: measured(lane.free) };
      }),
    })),
  };
}
