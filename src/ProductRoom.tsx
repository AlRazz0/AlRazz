import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CatalogThumbnail } from "./CatalogThumbnail";
import type { PublicMaterial, PublicProduct } from "./types";
import "./product-room.css";

export type ProductRoomProps = {
  product: PublicProduct;
  materials: readonly PublicMaterial[];
  className?: string;
  priority?: boolean;
  sizes?: string;
};

/** Immediate SVG reference; visible cards progressively request a shared WebGL portrait. */
export function ProductRoom({ product, materials, className = "", priority = false,
  sizes = "(min-width: 1100px) 32vw, (min-width: 700px) 48vw, 100vw",
}: ProductRoomProps) {
  const [backgroundFailed, setBackgroundFailed] = useState(false);
  const [nearViewport, setNearViewport] = useState(priority);
  const [portrait, setPortrait] = useState("");
  const room = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!room.current || typeof IntersectionObserver === "undefined") { setNearViewport(true); return; }
    // SVG images have no native lazy-loading attribute. Keep their textures local
    // to visible scenes; returning to a scene reuses the browser's image cache.
    const observer = new IntersectionObserver(entries => setNearViewport(entries.some(entry => entry.isIntersecting)), { rootMargin: "240px" });
    observer.observe(room.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!nearViewport || !product.preview?.geometry.length) return;
    let active = true;
    let cancel: (() => void) | undefined;
    void import("./furniture-portraits").then(({ requestFurniturePortrait }) => {
      if (active) cancel = requestFurniturePortrait(product, materials, priority,
        source => { if (active) setPortrait(source); }, () => {});
    }).catch(() => {});
    return () => { active = false; cancel?.(); };
  }, [nearViewport, product, materials, priority]);
  useEffect(() => { setPortrait(""); }, [product]);
  const { width, height, depth } = product.defaults;
  const kind = product.construction?.kind ?? "cabinet";
  const isDesk = kind === "desk" || kind === "desk-storage";
  const isUpper = product.category === "Cocina" && kind !== "kitchen-base" && height <= 1200;
  const family = isUpper ? "upper" : isDesk ? "desk"
    : kind === "wardrobe" || height >= 1700 ? "tall" : height <= 1050 ? "low" : "storage";
  // Match the existing thumbnail's fixed camera, retaining the model's proportions.
  // The setting is illustrative: it does not certify a room measurement or an installation.
  const projectedWidth = width * .891 + depth * .454;
  const projectedHeight = height * .951 + (width * .454 + depth * .891) * .309;
  const thumbnailScale = Math.min(344 / projectedWidth, 260 / projectedHeight);
  const modelWidth = Math.max(38, Math.min(108, (400 * .57 / 2200 / thumbnailScale) * 100));
  const style = { "--room-model-width": `${modelWidth}%` } as CSSProperties;
  const hasGeometry = !!product.preview?.geometry.length;

  return (
    <div className={`product-room product-room--${family} ${className}`.trim()} style={style} ref={room}>
      {!portrait && !backgroundFailed && <img className="product-room__background"
        src="/images/editorial/room-1600.webp"
        srcSet="/images/editorial/room-800.webp 800w, /images/editorial/room-1600.webp 1600w"
        sizes={sizes} width="1600" height="900"
        alt="" loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"}
        decoding="async" onError={() => setBackgroundFailed(true)} />}
      {portrait && <img className="product-room__portrait" src={portrait} alt={`${product.name}, render de su volumen y acabado de referencia.`} width="1200" height="900" decoding="async" />}
      {!portrait && <div className="product-room__light" aria-hidden="true" />}
      {!portrait && (hasGeometry ? <div className="product-room__model">
        <CatalogThumbnail name={product.name} geometry={product.preview.geometry}
          materials={materials} handle={product.defaults.handle} textured={nearViewport} />
      </div> : <p className="product-room__unavailable">La vista de este modelo estará disponible al personalizar.</p>)}
      <p className="product-room__caption">Ambiente ilustrativo <span aria-hidden="true">·</span> Modelo del catálogo</p>
    </div>
  );
}

export default ProductRoom;
