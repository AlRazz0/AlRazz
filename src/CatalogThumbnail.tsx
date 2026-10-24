import { useId, useMemo } from "react";
import type { Config } from "../lib/furniture";
import type { VisualPanel } from "../lib/public-geometry";
import type { PublicMaterial } from "./types";
import { buildCatalogThumbnail, type ThumbnailPoint } from "./catalog-thumbnail";
import "./CatalogThumbnail.css";

const coordinates = (points: ThumbnailPoint[]) => points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

export function CatalogThumbnail({ name, geometry, materials, handle }: {
  name: string;
  geometry: readonly VisualPanel[];
  materials: readonly PublicMaterial[];
  handle: Config["handle"];
}) {
  const id = `catalog-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const model = useMemo(() => buildCatalogThumbnail(geometry, materials, handle), [geometry, materials, handle]);
  if (!model) return <div className="card-preview-placeholder">Vista del modelo no disponible</div>;
  return (
    <svg className="catalog-thumbnail" viewBox={`0 0 ${model.width} ${model.height}`}
      role="img" aria-labelledby={`${id}-title`} focusable="false">
      <title id={`${id}-title`}>{name}, vista del diseño con sus frentes cerrados</title>
      <defs>
        <radialGradient id={`${id}-shadow`}>
          <stop offset="0" stopColor="#504535" stopOpacity=".17" />
          <stop offset="1" stopColor="#504535" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e2e5e2" />
          <stop offset=".38" stopColor="#8c9592" />
          <stop offset=".6" stopColor="#d5dad7" />
          <stop offset="1" stopColor="#8a928f" />
        </linearGradient>
      </defs>
      <ellipse cx={model.shadow.x} cy={model.shadow.y} rx={model.shadow.rx} ry={model.shadow.ry * 1.8}
        fill={`url(#${id}-shadow)`} />
      {model.faces.map((face) => (
        <g key={face.key}>
          <polygon points={coordinates(face.points)}
            fill={face.surface === "metal" ? `url(#${id}-metal)` : face.color}
            fillOpacity={face.opacity} stroke={face.surface === "aluminum-glass" ? "#8d9795" : face.edge}
            strokeOpacity={face.surface === "aluminum-glass" ? 1 : .65}
            strokeWidth={face.surface === "aluminum-glass" ? 2 : face.door ? .75 : .55}
            strokeDasharray={face.surface === "placeholder" ? "3 3" : undefined}
            strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {face.handle && <polyline points={coordinates(face.handle)} fill="none" stroke="#575952"
            strokeWidth="1.8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        </g>
      ))}
    </svg>
  );
}
