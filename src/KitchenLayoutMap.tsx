import { useId, useMemo } from "react";
import { ArrowLeft, ArrowRight, Check, Ruler } from "lucide-react";
import type { KitchenPlan, KitchenQuote } from "../lib/kitchen";
import type { PublicProduct } from "./types";
import { buildKitchenLayoutView, type KitchenLayoutLane, type KitchenLayoutWall } from "./kitchen-layout-view";
import "./kitchen-layout-map.css";

type Props = {
  plan: KitchenPlan;
  quote?: KitchenQuote;
  products: readonly PublicProduct[];
  selected: string;
  pending: boolean;
  error?: string;
  onSelect: (id: string) => void;
  onMove?: (id: string, direction: -1 | 1) => void;
};
const amount = (value: number | null) => value === null ? "Medida inválida" : `${value.toLocaleString("es-PE", { maximumFractionDigits: 1 })} mm`;
const rowName = { base: "Mueble bajo", wall: "Alacena", tall: "Columna alta" };
const kindName = { furniture: "Mueble", fridge: "Reserva de equipo", cooker: "Reserva de equipo", "sink-gap": "Reserva de lavadero", space: "Espacio reservado" };

function LaneDiagram({ wall, lane, selected, pattern }: {
  wall: KitchenLayoutWall;
  lane: KitchenLayoutLane;
  selected: string;
  pattern: string;
}) {
  if (wall.length === null || lane.corner === null)
    return <p className="kitchen-layout-unavailable">Introduce medidas válidas para ver esta fila a escala.</p>;
  const extent = Math.max(wall.length, lane.used ?? 0, 1);
  const x = (value: number) => 24 + value / extent * 952;
  const availableHeight = lane.heightAvailable ?? 0;
  const verticalExtent = Math.max(availableHeight, ...lane.blocks.map((block) => block.height ?? 0), 1);
  const y = (height: number) => 163 - height / verticalExtent * 113;
  return <div className="kitchen-layout-diagram" tabIndex={0} role="region" aria-label={`Plano desplazable de ${lane.label.toLowerCase()}, pared ${wall.id.toUpperCase()}`}>
    <svg viewBox="0 0 1000 200" aria-hidden="true" focusable="false">
      <defs><pattern id={pattern} patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="9" stroke="#bdc2b4" strokeWidth="2" /></pattern><pattern id={`${pattern}-blocked`} patternUnits="userSpaceOnUse" width="11" height="11" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="11" stroke="#a77753" strokeWidth="2" /></pattern></defs>
      <rect x="24" y="40" width={x(wall.length) - 24} height="123" rx="2" fill="#f5f5ec" />
      {lane.overflow !== null && lane.overflow > 0 && <rect x={x(wall.length)} y="35" width={x(extent) - x(wall.length)} height="128" fill="#fae4d9" />}
      {lane.corner > 0 && <><rect x="24" y="40" width={x(lane.corner) - 24} height="123" fill={`url(#${pattern})`} /><text x={24 + (x(lane.corner) - 24) / 2} y="105" className="kitchen-layout-svg-note" textAnchor="middle">Esquina</text></>}
      {lane.freeIntervals.map(([from, to], index) => <g key={`free-${index}`}><rect x={x(from)} y="40" width={x(to) - x(from)} height="123" fill="#f7f8f2" stroke="#b8c1a7" strokeDasharray="5 5" /><text x={(x(from) + x(to)) / 2} y="105" className="kitchen-layout-svg-note" textAnchor="middle">{to - from >= extent * 0.08 ? `${(to - from) / 10} cm libres` : ""}</text></g>)}
      {lane.blocks.map((block, index) => {
        if (block.offset === null || block.width === null || block.height === null) return null;
        const width = block.width / extent * 952;
        const height = block.height / verticalExtent * 113;
        const exceeds = block.offset + block.width > wall.length! + 0.01 || block.heightExcess > 0 || block.blockedByLower;
        return <g key={block.id} className={`kitchen-layout-shape${block.id === selected ? " is-selected" : ""}${exceeds ? " is-excess" : ""}${block.kind !== "furniture" ? " is-reserved" : ""}${block.kind === "space" ? " is-space" : ""}`}>
          <rect x={x(block.offset) + 0.5} y={y(block.height)} width={Math.max(0.5, width - 1)} height={Math.max(0.5, height)} rx="1" />
          {width >= 28 && height >= 21 && <text x={x(block.offset) + width / 2} y={y(block.height) + height / 2 + 5} textAnchor="middle">{index + 1}</text>}
          {width >= 75 && height >= 45 && <text x={x(block.offset) + width / 2} y={y(block.height) + height / 2 + 24} textAnchor="middle" className="kitchen-layout-svg-size">{block.width / 10} cm</text>}
        </g>;
      })}
      {lane.obstacleIntervals.map(([from, to], index) => <g key={`blocked-${index}`} className="kitchen-layout-obstruction"><rect x={x(from)} y="40" width={x(to) - x(from)} height="123" fill={`url(#${pattern}-blocked)`} stroke="#ad815a" strokeDasharray="5 4" /><text x={(x(from) + x(to)) / 2} y="64" className="kitchen-layout-svg-note" textAnchor="middle">{to - from >= extent * 0.08 ? "Bloqueado" : ""}</text></g>)}
      <line x1="24" x2={x(extent)} y1="163" y2="163" stroke="#969d8a" />
      <line x1={x(wall.length)} x2={x(wall.length)} y1="30" y2="170" stroke={lane.overflow ? "#a44d31" : "#788167"} strokeWidth="2" strokeDasharray="4 4" />
      <text x="24" y="190" className="kitchen-layout-svg-note">0</text>
      <text x={x(wall.length)} y="190" textAnchor="end" className="kitchen-layout-svg-note">{amount(wall.length)} · límite de pared</text>
    </svg>
    {lane.blocks.some((block) => !block.valid) && <p className="kitchen-layout-unavailable">Hay una medida incompleta. Los elementos sin posición aparecen en la lista para que puedas corregirlos.</p>}
  </div>;
}

export function KitchenLayoutMap({ plan, quote, products, selected, pending, error, onSelect, onMove }: Props) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const layout = useMemo(() => buildKitchenLayoutView(plan, quote, products), [plan, quote, products]);
  return <section className="kitchen-layout-map" aria-labelledby={`${id}-title`}>
    <div className="kitchen-layout-heading"><div><p>Tu cocina, pieza a pieza</p><h2 id={`${id}-title`}>Vista de distribución.</h2></div><span className={`kitchen-layout-status${error || layout.invalid ? " needs-review" : ""}`} role="status"><Ruler size={15} aria-hidden="true" />{pending ? "Calculando distribución…" : layout.invalid ? "Revisa las medidas" : error ? "Necesita un ajuste" : layout.fromQuote ? "Distribución calculada" : "Borrador: falta cálculo"}</span></div>
    <p className="kitchen-layout-intro">Cada bloque ocupa su ancho real. Selecciona una pieza en la lista para ajustar sus medidas; las columnas comparten espacio con los muebles bajos.</p>
    <p className="kitchen-layout-scroll-hint">Desliza los planos de lado a lado para ver cada fila completa.</p>
    <div className="kitchen-layout-legend" aria-label="Leyenda"><span><i className="is-furniture" />Mueble</span><span><i className="is-reserved" />Reserva de equipo o lavadero</span><span><i className="is-free" />Espacio libre</span><span><i className="is-blocked" />Bloqueo por columna o equipo alto</span><span><i className="is-excess" />Exceso</span></div>
    {layout.walls.map((wall) => <article className="kitchen-layout-wall" key={wall.id} aria-labelledby={`${id}-${wall.id}`}>
      <div className="kitchen-layout-wall-title"><h3 id={`${id}-${wall.id}`}>Pared {wall.id.toUpperCase()}</h3><strong>{amount(wall.length)}</strong></div>
      {wall.lanes.map((lane) => <section className="kitchen-layout-lane" key={lane.id} aria-labelledby={`${id}-${wall.id}-${lane.id}`}>
        <div className="kitchen-layout-lane-head"><h4 id={`${id}-${wall.id}-${lane.id}`}>{lane.label}</h4><div className="kitchen-layout-metrics"><span>Ocupado <strong>{amount(lane.occupied)}</strong></span>{lane.corner !== null && lane.corner > 0 && <span>Esquina <strong>{amount(lane.corner)}</strong></span>}{lane.blocked !== null && lane.blocked > 0 && <span className="is-blocked">Bloqueado <strong>{amount(lane.blocked)}</strong></span>}<span className="is-free">Libre <strong>{amount(lane.free)}</strong></span>{lane.overflow !== null && lane.overflow > 0 && <span className="is-excess">Exceso <strong>{amount(lane.overflow)}</strong></span>}</div></div>
        <LaneDiagram wall={wall} lane={lane} selected={selected} pattern={`${id}-${wall.id}-${lane.id}-corner`} />
        <div className="kitchen-layout-piece-list">
          {lane.blocks.map((block, index) => <div className={`kitchen-layout-piece${block.id === selected ? " is-selected" : ""}${!block.valid || block.heightExcess > 0 || block.blockedByLower ? " needs-review" : ""}`} key={block.id}>
            <button type="button" className="kitchen-layout-select" aria-pressed={block.id === selected} onClick={() => onSelect(block.id)}>
              <span className="kitchen-layout-piece-number" aria-hidden="true">{index + 1}</span><span><strong>{block.label}</strong><small>{block.kind === "furniture" ? rowName[block.row] : kindName[block.kind]} · {amount(block.width)} de ancho</small>{!block.valid ? <small className="kitchen-layout-piece-warning">Revisa las medidas de esta pieza</small> : block.heightExcess > 0 ? <small className="kitchen-layout-piece-warning">Supera la altura del ambiente en {amount(block.heightExcess)}</small> : block.blockedByLower && <small className="kitchen-layout-piece-warning">Coincide con una columna o equipo de la fila inferior</small>}</span>{block.id === selected && <Check size={17} aria-hidden="true" />}
            </button>
            {onMove && <div className="kitchen-layout-piece-move"><button type="button" disabled={!block.canMoveBefore} aria-label={`Mover ${block.label} antes en esta fila`} onClick={() => onMove(block.id, -1)}><ArrowLeft size={16} aria-hidden="true" /></button><button type="button" disabled={!block.canMoveAfter} aria-label={`Mover ${block.label} después en esta fila`} onClick={() => onMove(block.id, 1)}><ArrowRight size={16} aria-hidden="true" /></button></div>}
          </div>)}
          {!lane.blocks.length && <p className="kitchen-layout-empty">Esta fila está vacía. Su ancho libre aparece arriba.</p>}
        </div>
        {lane.blockingLabels.length > 0 && <p className="kitchen-layout-blocked-note">La zona rayada está ocupada en altura por: {lane.blockingLabels.join(", ")}. Solo los intervalos libres pueden ofrecerse para alacenas.</p>}
      </section>)}
    </article>)}
    {error && <p className="kitchen-layout-server-error">{error}</p>}
    <p className="kitchen-layout-footnote">Las reservas de equipos consumen ancho y no incluyen su suministro. Los espacios reservados vacíos pueden rellenarse por sus partes libres. Libre descuenta muebles, esquina y bloqueos en altura; no garantiza que cualquier modelo quepa en cada intervalo. La holgura de esquina se conserva en ambas filas de la pared B. El servidor comprueba el encaje y el taller valida la fabricación.</p>
  </section>;
}
