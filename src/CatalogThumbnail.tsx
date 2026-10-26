import { useId, useMemo } from "react";
import type { Config } from "../lib/furniture";
import type { VisualPanel } from "../lib/public-geometry";
import type { PublicMaterial } from "./types";
import { buildCatalogThumbnail, type ThumbnailPoint } from "./catalog-thumbnail";
import "./CatalogThumbnail.css";

const coordinates = (points: ThumbnailPoint[]) => points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

export function CatalogThumbnail({ name, geometry, materials, handle, textured = false }: {
  name: string;
  geometry: readonly VisualPanel[];
  materials: readonly PublicMaterial[];
  handle: Config["handle"];
  textured?: boolean;
}) {
  const id = `catalog-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const model = useMemo(() => buildCatalogThumbnail(geometry, materials, handle), [geometry, materials, handle]);
  const textures = useMemo(() => {
    const faces = new Map<string, { source: string; transform: string; shade: string; opacity: number }>();
    if (!textured || !model) return faces;
    const finishes = new Map(materials.map(material => [material.id, material]));
    for (const face of model.faces) {
      const material = finishes.get(geometry[face.source]?.material);
      const source = material?.renderTexture === false ? undefined : material?.swatch;
      if (face.surface !== "melamine" || face.points.length !== 4 || !source ||
        !/^\/images\/materials\/[a-z0-9-]+\.(?:jpg|jpeg|png|webp)$/.test(source) ||
        !material || !/^#[0-9a-f]{6}$/i.test(material.color)) continue;
      const [origin, horizontal, , vertical] = face.points;
      const matrix = [horizontal.x - origin.x, horizontal.y - origin.y,
        vertical.x - origin.x, vertical.y - origin.y, origin.x, origin.y];
      if (!matrix.every(Number.isFinite) || Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]) < .000001) continue;
      const intensity = (color: string) => [1, 3, 5].reduce((sum, offset) => sum + parseInt(color.slice(offset, offset + 2), 16), 0);
      const base = intensity(material.color);
      const factor = base ? intensity(face.color) / base : 1;
      faces.set(face.key, { source, transform: `matrix(${matrix.map(value => value.toFixed(5)).join(" ")})`,
        shade: factor > 1 ? "#fff" : "#000", opacity: Math.min(.4, Math.max(0, factor > 1 ? 1 - 1 / factor : 1 - factor)) });
    }
    return faces;
  }, [textured, model, materials, geometry]);
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
        {model.faces.map(face => {
          const texture = textures.get(face.key);
          return texture && <pattern key={face.key} id={`${id}-texture-${face.key}`}
            patternUnits="userSpaceOnUse" width="1" height="1" patternTransform={texture.transform}>
            <rect width="1" height="1" fill={face.color} />
            <image href={texture.source} width="1" height="1" preserveAspectRatio="none" />
            <rect width="1" height="1" fill={texture.shade} opacity={texture.opacity} />
          </pattern>;
        })}
      </defs>
      <ellipse cx={model.shadow.x} cy={model.shadow.y} rx={model.shadow.rx} ry={model.shadow.ry * 1.8}
        fill={`url(#${id}-shadow)`} />
      {model.faces.map((face) => (
        <g key={face.key}>
          <polygon points={coordinates(face.points)}
            fill={textures.has(face.key) ? `url(#${id}-texture-${face.key})` : face.surface === "metal" ? `url(#${id}-metal)` : face.color}
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
