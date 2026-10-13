import { getConstruction, type Config } from "../lib/furniture";
import type { PublicProduct } from "./types";

/** A schematic, not a stock photo: proportions, divisions and fronts follow this module. */
export function KitchenModelPreview({ product, config, color = "#cbb99a" }: {
  product: Pick<PublicProduct, "construction" | "defaults">;
  config?: Config;
  color?: string;
}) {
  const dimensions = config ?? product.defaults;
  const { width, height, depth, modules, shelves, doors, front } = dimensions;
  const construction = getConstruction(product);
  const scale = Math.min(125 / width, 116 / height);
  const w = width * scale, h = height * scale;
  const dx = Math.min(23, depth * scale * .28), dy = dx * .48;
  const x = (190 - w - dx) / 2, y = 140 - h;
  const floor = construction.kind === "kitchen-base" ? construction.plinthHeight * scale : 0;
  const count = Math.min(6, Math.max(1, modules));
  const cell = w / count;
  const glass = front === "glass" || front === "aluminum-glass";
  return <svg viewBox="0 0 190 155" className="kitchen-model-preview" aria-hidden="true">
    <ellipse cx="95" cy="143" rx={Math.min(83, (w + dx) * .56)} ry="5" fill="#463c30" opacity=".09" />
    <g stroke="#625747" strokeWidth="1" strokeLinejoin="round">
      <path d={`M${x} ${y}l${dx} ${-dy}h${w}l${-dx} ${dy}Z`} fill={color} />
      <path d={`M${x + w} ${y}l${dx} ${-dy}v${h}l${-dx} ${dy}Z`} fill={color} />
      <path d={`M${x + w} ${y}l${dx} ${-dy}v${h}l${-dx} ${dy}Z`} fill="#261c11" opacity=".12" stroke="none" />
      <rect x={x} y={y} width={w} height={h - floor} fill={color} />
      {floor > 0 && <rect x={x + 3} y={140 - floor} width={w - 6} height={floor} fill="#74695a" />}
      {Array.from({ length: count }, (_, column) => <g key={column}>
        {column > 0 && <path d={`M${x + column * cell} ${y}v${h - floor}`} />}
        {Array.from({ length: Math.min(7, shelves) }, (_, shelf) => <path key={shelf}
          d={`M${x + column * cell + 2} ${y + (h - floor) * (shelf + 1) / (shelves + 1)}h${cell - 4}`}
          opacity={doors === "none" || glass ? .75 : .13} />)}
        {doors !== "none" && <>
          <rect x={x + column * cell + 1.7} y={y + (doors === "lower" ? (h - floor) / 2 : 1.7)}
            width={Math.max(1, cell - 3.4)} height={Math.max(1, (h - floor) * (doors === "lower" ? .5 : 1) - 3.4)}
            fill={glass ? "#adccc9" : color} fillOpacity={glass ? .6 : .86}
            stroke={front === "aluminum-glass" ? "#53605e" : "#625747"} strokeWidth={front === "aluminum-glass" ? 2.5 : .7} />
          {glass && <path d={`M${x + column * cell + cell * .3} ${y + h * .35}l${cell * .32} ${-h * .18}`} stroke="#f8ffff" strokeWidth="2" opacity=".7" />}
          <path d={`M${x + (column + 1) * cell - 6} ${y + h * (doors === "lower" ? .73 : .5)}v${Math.min(9, h * .15)}`} strokeWidth="1.8" />
        </>}
      </g>)}
    </g>
  </svg>;
}
