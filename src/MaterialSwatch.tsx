import { useState, type ReactNode } from "react";
import type { PublicMaterial } from "./types";
import "./material-swatch.css";

export function MaterialSwatch({
  material,
  className = "",
  title,
  children,
}: {
  material: Pick<PublicMaterial, "color" | "swatch">;
  className?: string;
  title?: string;
  children?: ReactNode;
}) {
  const [failedSource, setFailedSource] = useState("");
  const source = material.swatch;
  const showImage =
    !!source &&
    source !== failedSource &&
    /^\/images\/materials\/[a-z0-9][a-z0-9._-]*\.(?:jpg|jpeg|png|webp)$/i.test(
      source,
    );
  return (
    <span
      className={`material-swatch ${className}`.trim()}
      style={{ backgroundColor: material.color }}
      title={title}
      aria-hidden="true"
    >
      {showImage && (
        <img
          src={source}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedSource(source)}
        />
      )}
      {children}
    </span>
  );
}

export function MaterialSource({ material }: { material?: PublicMaterial }) {
  if (!material?.sourceUrl?.startsWith("https://")) return null;
  return (
    <a
      className="material-source"
      href={material.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      Ver {material.name} en el catálogo de {material.brand || "la marca"}
      <span className="material-source-new-tab"> (otra pestaña)</span>
    </a>
  );
}
