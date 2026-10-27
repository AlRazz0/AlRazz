import { summarizeKitchenSpace, type KitchenSpaceSummary } from "../lib/kitchen-space-summary";
import type { KitchenQuote } from "../lib/kitchen";

const dimension = (value: number) => `${(value / 10).toLocaleString("es-PE", { maximumFractionDigits: 1 })} cm`;

export function AssistantKitchenMeasures({ summary, quote }: { summary?: KitchenSpaceSummary; quote: KitchenQuote }) {
  // Cached responses from the previous Worker already include the placed quote.
  const space = summary ?? summarizeKitchenSpace(quote);
  return <div className="assistant-kitchen-measures" aria-label="Ocupación y espacio libre de la cocina">
    {space.walls.map(wall => {
      const hasBlocked = wall.rows.some(row => row.blocked > 0);
      return <div className="assistant-kitchen-wall" key={wall.wall}>
        <table>
          <caption>Pared {wall.wall.toUpperCase()} <span>· {dimension(wall.length)}</span></caption>
          <thead><tr><th scope="col">Fila</th><th scope="col">Ocupado</th>{hasBlocked && <th scope="col">Bloqueado</th>}<th scope="col">Libre</th></tr></thead>
          <tbody>{wall.rows.map(row => <tr key={row.row}>
            <th scope="row">{row.row === "base" ? "Bajos y columnas" : "Alacenas"}</th>
            <td>{dimension(row.occupied)}</td>{hasBlocked && <td>{dimension(row.blocked)}</td>}<td className="assistant-kitchen-free">{dimension(row.free)}</td>
          </tr>)}</tbody>
        </table>
        {wall.corner > 0 && <p className="assistant-kitchen-corner">Esquina: {dimension(wall.corner)} reservados en ambas filas. Ya descontados del espacio libre.</p>}
      </div>;
    })}
    <dl className="assistant-kitchen-profile">
      <div><dt>Altura instalada</dt><dd>{dimension(space.height)}</dd></div>
      <div><dt>Fondo máximo de módulos</dt><dd>{dimension(space.moduleDepth)}</dd></div>
    </dl>
  </div>;
}
