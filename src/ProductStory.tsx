import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { api } from "../lib/api";
import { money } from "../lib/format-price";
import { Header, Footer } from "./App";
import { MaterialSwatch } from "./MaterialSwatch";
import { materialLabel } from "./materials";
import { ProductRoom } from "./ProductRoom";
import type { PublicProduct, PublicSettings } from "./types";
import "./product-story.css";

const centimeters = (value: number) => `${(value / 10).toLocaleString("es-PE", { maximumFractionDigits: 1 })} cm`;

export default function ProductStory() {
  const [query] = useState(() => new URLSearchParams(window.location.search));
  const requestedId = query.get("producto") ?? "";
  const [product, setProduct] = useState<PublicProduct>();
  const [settings, setSettings] = useState<PublicSettings>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

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
        <a href="/coleccion"><ArrowLeft size={15} aria-hidden="true" /> La colección</a>
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
          {error && <button className="product-story__button" type="button" onClick={() => setAttempt(value => value + 1)}>Cargar de nuevo <ArrowRight size={18} aria-hidden="true" /></button>}
          <a className={error ? "product-story__text-link" : "product-story__button"} href="/coleccion">Explorar la colección <ArrowRight size={18} aria-hidden="true" /></a>
          <a className="product-story__text-link" href="/asistente">Ayúdame a elegir <ArrowUpRight size={18} aria-hidden="true" /></a>
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
            <a className="product-story__button" href={configure}>Personalizar este mueble <ArrowUpRight size={20} aria-hidden="true" /></a>
            {selectedFinish && <p className="product-story__finish-note">Empieza con {selectedFinish.name} en el configurador. La escena muestra el acabado de referencia.</p>}
            <a className="product-story__text-link product-story__help" href="/asistente">¿Qué cabe en mi espacio? <ArrowRight size={16} aria-hidden="true" /></a>
          </div>
          <ProductRoom product={product} materials={settings?.materials ?? []} priority className="product-story__room"
            sizes="(min-width: 1100px) 65vw, (min-width: 760px) 55vw, 100vw" />
        </section>

        <section className="product-story__reference" aria-labelledby="product-story-measures">
          <div className="product-story__reference-heading">
            <p className="product-story__eyebrow">Punto de partida</p>
            <h2 id="product-story-measures">Así empieza.<br />Tú lo haces tuyo.</h2>
            <p>Medidas del modelo de referencia. Encuentra las opciones disponibles al personalizar.</p>
          </div>
          <dl className="product-story__dimensions">
            <div><dt>Ancho</dt><dd>{centimeters(product.defaults.width)}</dd></div>
            <div><dt>Alto</dt><dd>{centimeters(product.defaults.height)}</dd></div>
            <div><dt>Fondo</dt><dd>{centimeters(product.defaults.depth)}</dd></div>
            <div><dt>Material</dt><dd>Melamina <span>18 mm</span></dd></div>
          </dl>
        </section>

        {finishSamples.length > 0 && <section className="product-story__finishes" aria-labelledby="product-story-finishes">
          <div>
            <p className="product-story__eyebrow">Textura, tono, carácter</p>
            <h2 id="product-story-finishes">Un acabado.<br />Otra forma de sentirlo.</h2>
            <p>Una muestra de los acabados publicados por el taller. Elige y revisa tu combinación en el configurador.</p>
            <a className="product-story__text-link" href={configure}>Explorar los acabados <ArrowRight size={18} aria-hidden="true" /></a>
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

        <section className="product-story__invitation" aria-labelledby="product-story-start">
          <div><p className="product-story__eyebrow">El siguiente paso es tuyo</p><h2 id="product-story-start">Dale su lugar.</h2><p>Ajusta las medidas y el acabado. Guarda tu diseño y compártelo con el taller para revisar tu propuesta.</p></div>
          <a className="product-story__button product-story__button--light" href={configure}>Personalizar este mueble <ArrowUpRight size={22} aria-hidden="true" /></a>
        </section>
      </>}
    </main>
    <Footer settings={settings} />
  </div>;
}
