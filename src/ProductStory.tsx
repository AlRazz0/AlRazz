import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Expand, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { api } from "../lib/api";
import { money } from "../lib/format-price";
import { Header, Footer } from "./App";
import { MaterialSwatch } from "./MaterialSwatch";
import { materialLabel } from "./materials";
import { ProductRoom } from "./ProductRoom";
import type { ImmersiveMemory } from "./ImmersiveFurniture";
import type { PublicMaterial, PublicProduct, PublicSettings } from "./types";
import "./product-story.css";

const centimeters = (value: number) => `${(value / 10).toLocaleString("es-PE", { maximumFractionDigits: 1 })} cm`;
const ImmersiveFurniture = lazy(() => import("./ImmersiveFurniture"));
type View = "room" | "3d";

function ModelPresentation({ product, materials, view, memory, expanded = false }: {
  product: PublicProduct; materials: readonly PublicMaterial[]; view: View; memory: { current: ImmersiveMemory }; expanded?: boolean;
}) {
  return view === "room" ? <ProductRoom product={product} materials={materials} priority
    className={expanded ? "product-story__expanded-room" : "product-story__room"}
    sizes={expanded ? "95vw" : "(min-width: 1100px) 65vw, (min-width: 760px) 55vw, 100vw"} />
    : <div className={`product-story__3d${expanded ? " product-story__3d--expanded" : ""}`}>
      <Suspense fallback={<p className="product-story__3d-loading" role="status">Preparando la vista 3D del modelo…</p>}>
        <ImmersiveFurniture product={product} materials={materials} memory={memory} className="product-story__immersive" />
      </Suspense>
    </div>;
}

function ViewSelector({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  return <div className="product-story__view-selector" role="group" aria-label="Vista del mueble">
    <button type="button" aria-pressed={view === "room"} onClick={() => onChange("room")} data-ui-sound="select">En ambiente</button>
    <button type="button" aria-pressed={view === "3d"} onClick={() => onChange("3d")} data-ui-sound="select">Explorar en 3D</button>
  </div>;
}

function ReferenceDimensions({ product }: { product: PublicProduct }) {
  const id = useId();
  const { width, height, depth } = product.defaults;
  // This is an exterior dimension diagram, not a second furniture engine.
  const scale = Math.min(210 / width, 195 / height, 80 / depth);
  const w = width * scale, h = height * scale, dx = depth * scale * .72, dy = depth * scale * .42;
  const x = (420 - w - dx) / 2, y = (315 - h + dy) / 2;
  const depthX = x + w + dx / 2 + 13, depthY = y - dy / 2 - 22;
  return <svg className="product-story__dimension-diagram" viewBox="0 0 420 360" role="img" aria-labelledby={`${id}-title ${id}-description`}>
    <title id={`${id}-title`}>Medidas exteriores de referencia de {product.name}</title>
    <desc id={`${id}-description`}>Ancho {centimeters(width)}, alto {centimeters(height)} y fondo {centimeters(depth)}. Esquema del volumen exterior.</desc>
    <g className="product-story__dimension-volume" strokeLinejoin="round">
      <path d={`M${x},${y}l${dx},${-dy}h${w}v${h}l${-dx},${dy}Z`} fill="#e0dfd2" />
      <path d={`M${x},${y}h${w}l${dx},${-dy}h${-w}Z`} fill="#f5f2e9" />
      <path d={`M${x},${y}h${w}v${h}h${-w}Z`} fill="#eae9de" />
    </g>
    <g className="product-story__dimension-lines" fill="none">
      <path d={`M${x},${y + h + 10}v26m${w},-26v26M${x},${y + h + 28}h${w}`} />
      <path d={`M${x - 10},${y}h-26m26,${h}h-26M${x - 28},${y}v${h}`} />
      <path d={`M${x + w + 7},${y - 5}l16,-10m${dx - 16},${-dy + 10}l16,-10M${x + w + 15},${y - 10}l${dx},${-dy}`} />
    </g>
    <g className="product-story__dimension-labels" textAnchor="middle">
      <text x={x + w / 2} y={y + h + 48}>Ancho {centimeters(width)}</text>
      <text transform={`translate(${x - 42} ${y + h / 2}) rotate(-90)`}>Alto {centimeters(height)}</text>
      <text transform={`translate(${depthX} ${depthY}) rotate(-30.25)`}>Fondo {centimeters(depth)}</text>
    </g>
  </svg>;
}

export default function ProductStory() {
  const [query] = useState(() => new URLSearchParams(window.location.search));
  const requestedId = query.get("producto") ?? "";
  const [product, setProduct] = useState<PublicProduct>();
  const [settings, setSettings] = useState<PublicSettings>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<View>("room");
  const [expanded, setExpanded] = useState(false);
  const [showMobileCta, setShowMobileCta] = useState(false);
  const primaryCta = useRef<HTMLAnchorElement>(null);
  const finalInvitation = useRef<HTMLElement>(null);
  const immersiveMemory = useRef<ImmersiveMemory>({ pose: "presence", open: false });

  useEffect(() => {
    let current = true;
    setLoading(true); setError(""); setProduct(undefined);
    if (!/^[a-z0-9-]{2,60}$/.test(requestedId)) {
      setLoading(false);
      return () => { current = false; };
    }
    void api<{ products: PublicProduct[]; settings: PublicSettings }>("action=catalog")
      .then(data => {
        if (!current) return;
        setSettings(data.settings);
        setProduct(data.products.find(item => item.id === requestedId && item.active));
      })
      .catch(cause => { if (current) setError(cause instanceof Error ? cause.message : "No pudimos cargar este modelo."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [requestedId, attempt]);

  useEffect(() => {
    const previous = document.title;
    document.title = product ? `${product.name} · El capo` : "Un mueble para tu espacio · El capo";
    return () => { document.title = previous; };
  }, [product]);

  useEffect(() => {
    if (!product || !primaryCta.current || !finalInvitation.current || typeof IntersectionObserver === "undefined") {
      setShowMobileCta(false); return;
    }
    const mobile = window.matchMedia("(max-width: 759px)");
    const update = () => {
      const primary = primaryCta.current?.getBoundingClientRect();
      const end = finalInvitation.current?.getBoundingClientRect();
      setShowMobileCta(!!(mobile.matches && primary && primary.bottom <= 0 && end && end.top > window.innerHeight));
    };
    const observer = new IntersectionObserver(update, { threshold: [0, 1] });
    observer.observe(primaryCta.current); observer.observe(finalInvitation.current);
    mobile.addEventListener("change", update); update();
    return () => { observer.disconnect(); mobile.removeEventListener("change", update); };
  }, [product?.id]);

  const materials = settings?.materials.filter(material => material.active) ?? [];
  const selectedFinish = materials.find(material => material.id === query.get("acabado"));
  const configure = product ? `/configurar?${new URLSearchParams({ producto: product.id,
    ...(selectedFinish ? { acabado: selectedFinish.id } : {}),
  }).toString()}` : "/coleccion";
  const referenceFinish = materials.find(material => material.id === product?.defaults.finish);
  const finishSamples = [...(selectedFinish ? [selectedFinish] : []), ...(referenceFinish ? [referenceFinish] : []), ...materials]
    .filter((material, index, all) => all.findIndex(item => item.id === material.id) === index).slice(0, 4);
  const price = product?.showPrice !== false && typeof product?.publicPrice === "number" && Number.isFinite(product.publicPrice)
    ? product.publicPrice : null;

  return <div className="product-story-shell">
    <Header />
    <main id="main-content" className="product-story" tabIndex={-1}>
      <nav className="product-story__breadcrumb" aria-label="Ruta de navegación">
        <a href="/coleccion" data-ui-sound="tap"><ArrowLeft size={15} aria-hidden="true" /> La colección</a>
        {product && <><span aria-hidden="true">/</span><span aria-current="page">{product.name}</span></>}
      </nav>
      {loading ? <div className="product-story__loading" role="status" aria-live="polite">
        <div className="product-story__loading-copy"><span /> <span /> <span /><p>Preparando este modelo…</p></div>
        <div className="product-story__loading-room" />
      </div> : !product ? <section className="product-story__empty" aria-labelledby="product-story-unavailable">
        <p className="product-story__eyebrow">La colección de El capo</p>
        <h1 id="product-story-unavailable">{error ? "Volvamos a intentarlo." : "Este modelo no está disponible."}</h1>
        <p role={error ? "alert" : undefined}>{error || "Puede que el taller lo esté renovando. Explora los modelos publicados o encuentra una propuesta para tu espacio."}</p>
        <div className="product-story__links">
          {error && <button className="product-story__button" type="button" onClick={() => setAttempt(value => value + 1)} data-ui-sound="tap">Cargar de nuevo <ArrowRight size={18} aria-hidden="true" /></button>}
          <a className={error ? "product-story__text-link" : "product-story__button"} href="/coleccion" data-ui-sound="tap">Explorar la colección <ArrowRight size={18} aria-hidden="true" /></a>
          <a className="product-story__text-link" href="/asistente" data-ui-sound="tap">Ayúdame a elegir <ArrowUpRight size={18} aria-hidden="true" /></a>
        </div>
      </section> : <>
        <section className="product-story__hero" aria-labelledby="product-story-title">
          <div className="product-story__intro">
            <p className="product-story__eyebrow">{product.category} <span aria-hidden="true">/</span> A tu medida</p>
            <h1 id="product-story-title">{product.name}</h1>
            <p className="product-story__description">{product.description}</p>
            <div className="product-story__price">
              <span>{price === null ? "Una propuesta para ti" : "Precio de referencia"}</span>
              <strong>{price === null ? "Cotiza tu medida" : money(price)}</strong>
              <p>{price === null ? "El taller confirmará el importe de tu diseño." : "Para las medidas y opciones de referencia. Tu cotización se actualiza al personalizar."}</p>
              {price !== null && (product.defaults.install || product.defaults.transport) && <p>
                Incluye {[product.defaults.install && "instalación", product.defaults.transport && "transporte"].filter(Boolean).join(" y ")} en la referencia.
              </p>}
            </div>
            <a className="product-story__button" href={configure} ref={primaryCta} data-ui-sound="tap">Personalizar este mueble <ArrowUpRight size={20} aria-hidden="true" /></a>
            {selectedFinish && <p className="product-story__finish-note">Empieza con {selectedFinish.name} en el configurador. La escena muestra el acabado de referencia.</p>}
            <a className="product-story__text-link product-story__help" href="/asistente" data-ui-sound="tap">¿Qué cabe en mi espacio? <ArrowRight size={16} aria-hidden="true" /></a>
          </div>
          <Dialog open={expanded} onOpenChange={setExpanded}>
            <div className="product-story__gallery" aria-label="Galería del modelo">
              <ModelPresentation product={product} materials={settings?.materials ?? []} memory={immersiveMemory} view={expanded ? "room" : view} />
              <div className="product-story__gallery-toolbar"><ViewSelector view={view} onChange={setView} />
                <DialogTrigger asChild><button className="product-story__expand" type="button" data-ui-sound="tap"><Expand size={16} aria-hidden="true" /> Ampliar<span className="product-story__sr-only"> vista de {product.name}</span></button></DialogTrigger>
              </div>
            </div>
            <DialogContent className="product-story__gallery-modal" showCloseButton={false}>
              <div className="product-story__modal-heading"><div><DialogTitle>{product.name}</DialogTitle><DialogDescription>Modelo de referencia. Las medidas, los frentes y los acabados se cambian al personalizar.</DialogDescription></div>
                <DialogClose asChild><button type="button" className="product-story__modal-close" aria-label="Cerrar vista ampliada" data-ui-sound="tap"><X size={20} aria-hidden="true" /><span>Cerrar</span></button></DialogClose>
              </div>
              {expanded && <ModelPresentation product={product} materials={settings?.materials ?? []} memory={immersiveMemory} view={view} expanded />}
              <div className="product-story__modal-toolbar"><ViewSelector view={view} onChange={setView} /><span>Vista de referencia · Sin cambios en tu diseño</span></div>
            </DialogContent>
          </Dialog>
        </section>

        <section className="product-story__reference" aria-labelledby="product-story-measures">
          <div className="product-story__reference-heading">
            <p className="product-story__eyebrow">Punto de partida</p>
            <h2 id="product-story-measures">Así empieza.<br />Tú lo haces tuyo.</h2>
            <p>Medidas del modelo de referencia. Encuentra las opciones disponibles al personalizar.</p>
          </div>
          <div className="product-story__reference-visual"><ReferenceDimensions product={product} /><dl className="product-story__dimensions">
            <div><dt>Ancho</dt><dd>{centimeters(product.defaults.width)}</dd></div>
            <div><dt>Alto</dt><dd>{centimeters(product.defaults.height)}</dd></div>
            <div><dt>Fondo</dt><dd>{centimeters(product.defaults.depth)}</dd></div>
            <div><dt>Material</dt><dd>Melamina <span>18 mm</span></dd></div>
          </dl><p className="product-story__diagram-note">Esquema exterior de referencia. El taller revisa los detalles antes de fabricar.</p></div>
        </section>

        {finishSamples.length > 0 && <section className="product-story__finishes" aria-labelledby="product-story-finishes">
          <div>
            <p className="product-story__eyebrow">Textura, tono, carácter</p>
            <h2 id="product-story-finishes">Un acabado.<br />Otra forma de sentirlo.</h2>
            <p>Una muestra de los acabados publicados por el taller. Elige y revisa tu combinación en el configurador.</p>
            <a className="product-story__text-link" href={configure} data-ui-sound="tap">Explorar los acabados <ArrowRight size={18} aria-hidden="true" /></a>
          </div>
          <ul className="product-story__finish-list" aria-label="Muestra de acabados, vista de referencia">
            {finishSamples.map(material => <li key={material.id}>
              <MaterialSwatch material={material} className="product-story__finish-swatch" />
              <span>{material.name}</span>
              <small>{material.brand || "Melamina"}{material.code ? ` · ${material.code}` : ""}</small>
              <span className="product-story__sr-only">{materialLabel(material)}</span>
            </li>)}
          </ul>
        </section>}

        <section className="product-story__invitation" aria-labelledby="product-story-start" ref={finalInvitation}>
          <div><p className="product-story__eyebrow">El siguiente paso es tuyo</p><h2 id="product-story-start">Dale su lugar.</h2><p>Ajusta las medidas y el acabado. Guarda tu diseño y compártelo con el taller para revisar tu propuesta.</p></div>
          <a className="product-story__button product-story__button--light" href={configure} data-ui-sound="tap">Personalizar este mueble <ArrowUpRight size={22} aria-hidden="true" /></a>
        </section>
      </>}
    </main>
    {product && showMobileCta && !expanded && <nav className="product-story__mobile-cta" aria-label="Personalizar este modelo">
      <div><span>{product.name}</span><strong>{price === null ? "A tu medida" : money(price)}</strong></div>
      <a href={configure} data-ui-sound="tap" aria-label={`Personalizar este mueble: ${product.name}`}>Personalizar <ArrowUpRight size={18} aria-hidden="true" /></a>
    </nav>}
    <Footer settings={settings} />
  </div>;
}
