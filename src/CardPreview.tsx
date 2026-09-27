import { useEffect, useRef, useState } from "react";
import { Box } from "lucide-react";
import Viewer from "./Viewer";
import type { PublicMaterial, PublicProduct } from "./types";

// A large viewport must not create one WebGL context for the entire catalog.
const activePreviews = new Set<() => void>();
const waitingPreviews = new Set<() => void>();
const MAX_ACTIVE_PREVIEWS = 8;

function requestPreview(start: () => void) {
  if (activePreviews.size < MAX_ACTIVE_PREVIEWS) {
    activePreviews.add(start);
    start();
  } else waitingPreviews.add(start);
  return () => {
    waitingPreviews.delete(start);
    if (!activePreviews.delete(start)) return;
    const next = waitingPreviews.values().next().value;
    if (next) {
      waitingPreviews.delete(next);
      activePreviews.add(next);
      next();
    }
  };
}

export function CardPreview({
  product,
  materials,
}: {
  product: PublicProduct;
  materials: PublicMaterial[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState(false);
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!element || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => setNearby(entry.isIntersecting),
      { rootMargin: "60px 0px", threshold: 0 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearby || !product.preview) return;
    const release = requestPreview(() => setGranted(true));
    return () => {
      setGranted(false);
      release();
    };
  }, [nearby, product.preview]);

  return (
    <div className="card-preview" ref={container}>
      {nearby && granted && product.preview ? (
        <Viewer
          small
          panels={product.preview.geometry}
          materials={materials}
          {...product.defaults}
        />
      ) : (
        <div
          className="card-preview-placeholder"
          role="img"
          aria-label={`${product.name}. Abre el modelo para ver su diseño en 3D.`}
        >
          <Box size={38} strokeWidth={1} aria-hidden="true" />
          <span>Explora este modelo</span>
        </div>
      )}
    </div>
  );
}
