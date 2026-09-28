import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Image as ImageIcon } from "lucide-react";
import { resolveGallery } from "../lib/model-gallery";
import type { Config } from "../lib/furniture";
import type { VisualPanel } from "../lib/public-geometry";
import type { PublicMaterial, PublicProduct } from "./types";
import type { ShowcaseImage } from "./showcase-render";
import "./showcase.css";

export default function ModelShowcase({
  product,
  geometry,
  materials,
  config,
  pending,
}: {
  product: PublicProduct;
  geometry: VisualPanel[];
  materials: PublicMaterial[];
  config: Config;
  pending: boolean;
}) {
  const container = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [images, setImages] = useState<ShowcaseImage[]>([]);
  const [renderedFor, setRenderedFor] = useState<{
    productId: string;
    geometry: VisualPanel[];
    materials: PublicMaterial[];
    handle: string;
    scene: string;
  } | null>(null);
  const [selected, setSelected] = useState(0);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const gallery = resolveGallery(product.gallery);
  useEffect(() => {
    if (!container.current || !gallery.enabled) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" },
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [gallery.enabled]);
  useEffect(() => {
    if (!visible || !gallery.enabled || pending || !geometry.length) return;
    const controller = new AbortController();
    setRendering(true);
    setError(false);
    const timer = setTimeout(() => {
      void import("./showcase-render")
        .then(({ renderShowcase }) =>
          renderShowcase(
            geometry,
            materials,
            config.handle,
            gallery.scene,
            controller.signal,
          ),
        )
        .then((result) => {
          if (controller.signal.aborted) return;
          setImages(result);
          setRenderedFor({
            productId: product.id,
            geometry,
            materials,
            handle: config.handle,
            scene: gallery.scene,
          });
          setSelected(0);
          setRendering(false);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setImages([]);
            setRenderedFor(null);
            setError(true);
            setRendering(false);
          }
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    visible,
    gallery.enabled,
    gallery.scene,
    product.id,
    geometry,
    materials,
    config.handle,
    pending,
    retry,
  ]);
  if (!gallery.enabled) return null;
  const matches =
    renderedFor?.productId === product.id &&
    renderedFor.geometry === geometry &&
    renderedFor.materials === materials &&
    renderedFor.handle === config.handle &&
    renderedFor.scene === gallery.scene;
  const availableImages = matches ? images : [];
  const updating = rendering || pending || (visible && !matches && !error);
  const current = availableImages[selected];
  return (
    <section
      ref={container}
      className="model-showcase"
      aria-label="Imágenes realistas del modelo"
    >
      <div className="showcase-heading">
        <div>
          <p className="eyebrow">DEL DISEÑO A TU ESPACIO</p>
          <h2>
            Así quedaría
            <br />
            <em>{product.name}.</em>
          </h2>
        </div>
        <p>
          Una mirada más cercana a tu mueble, con las medidas y acabados que
          acabas de elegir.
        </p>
      </div>
      <div className="showcase-image" aria-busy={updating}>
        {current && (
          <img
            src={current.src}
            width={1200}
            height={800}
            alt={`Render digital de ${product.name}: ${current.label.toLocaleLowerCase("es")}`}
          />
        )}
        {!current && (
          <div className="showcase-placeholder">
            <ImageIcon size={36} strokeWidth={1} />
            <span>
              {error
                ? "No se pudo generar esta imagen."
                : "Preparando la luz, los materiales y tu mueble…"}
            </span>
          </div>
        )}
        {updating && (
          <span className="showcase-progress" role="status">
            Actualizando tu imagen…
          </span>
        )}
        <span className="showcase-badge">RENDER DIGITAL · MELAMINA 18 MM</span>
      </div>
      {error && (
        <p className="showcase-error" role="alert">
          Tu navegador no pudo generar la vista ambientada.{" "}
          <button onClick={() => setRetry((value) => value + 1)}>
            Volver a intentar
          </button>
        </p>
      )}
      <div className="showcase-controls">
        <div className="showcase-views" aria-label="Vistas realistas">
          {availableImages.map((item, index) => (
            <button
              key={item.label}
              type="button"
              aria-pressed={selected === index}
              disabled={updating || error}
              onClick={() => setSelected(index)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {current && !updating && !error && (
          <a
            href={current.src}
            download={`el-capo-${product.id}-${selected + 1}.png`}
          >
            <ArrowDownToLine size={17} /> Descargar imagen
          </a>
        )}
      </div>
      <p className="showcase-caption">
        {gallery.caption ||
          "Simulación digital del modelo configurado. La ambientación no forma parte del mueble; confirma el acabado con una muestra física."}
      </p>
    </section>
  );
}
