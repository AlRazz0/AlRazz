import { Box } from "lucide-react";
import { CatalogThumbnail } from "./CatalogThumbnail";
import type { PublicMaterial, PublicProduct } from "./types";

/** Catalog cards never allocate a WebGL context. The product page owns its 3D viewer. */
export function CardPreview({
  product,
  materials,
}: {
  product: PublicProduct;
  materials: PublicMaterial[];
}) {
  return (
    <div className="card-preview">
      {product.preview?.geometry.length ? (
        <CatalogThumbnail
          name={product.name}
          geometry={product.preview.geometry}
          materials={materials}
          handle={product.defaults.handle}
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
