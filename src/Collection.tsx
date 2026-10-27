import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Layers3, Search, X } from "lucide-react";
import { api } from "../lib/api";
import { money } from "../lib/format-price";
import { COLLECTION_PAGE_SIZE, filterShowroomProducts, normalizeShowroomText, resolveShowroomCategory, resolveShowroomFinish, showroomCategories, showroomPage, showroomProductHref } from "../lib/showroom";
import type { PublicProduct, PublicSettings } from "./types";
import { Header, Footer } from "./App";
import { ProductRoom } from "./ProductRoom";
import { materialLabel } from "./materials";
import "./collection.css";

type Catalogue = { products: PublicProduct[]; settings: PublicSettings };

export default function Collection() {
  const initial = useRef(new URLSearchParams(window.location.search));
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [settings, setSettings] = useState<PublicSettings>();
  const [requestedCategory, setRequestedCategory] = useState(initial.current.get("categoria") ?? "");
  const [search, setSearch] = useState((initial.current.get("q") ?? "").slice(0, 160));
  const [requestedFinish, setRequestedFinish] = useState(initial.current.get("acabado") ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({ key: "", count: COLLECTION_PAGE_SIZE });
  const generation = useRef(0);
  const productLinks = useRef(new Map<string, HTMLAnchorElement>());

  async function load() {
    const sequence = ++generation.current;
    setLoading(true); setError("");
    try {
      const data = await api<Catalogue>("action=catalog");
      if (sequence !== generation.current) return;
      setProducts(data.products.filter(product => product.active)); setSettings(data.settings);
    } catch (cause) {
      if (sequence === generation.current) setError(cause instanceof Error ? cause.message : "No pudimos cargar la colección.");
    } finally { if (sequence === generation.current) setLoading(false); }
  }
  useEffect(() => { void load(); return () => { generation.current++; }; }, []);
  useEffect(() => {
    const onNavigation = () => {
      const parameters = new URLSearchParams(window.location.search);
      setRequestedCategory(parameters.get("categoria") ?? ""); setSearch((parameters.get("q") ?? "").slice(0, 160)); setRequestedFinish(parameters.get("acabado") ?? "");
    };
    window.addEventListener("popstate", onNavigation);
    return () => window.removeEventListener("popstate", onNavigation);
  }, []);

  const categories = useMemo(() => showroomCategories(products), [products]);
  const category = resolveShowroomCategory(requestedCategory, categories) ?? "";
  const finish = resolveShowroomFinish(requestedFinish, settings?.materials ?? []);
  const unavailableCategory = !loading && !error && !!requestedCategory.trim() && !category;
  const unavailableFinish = !loading && !error && !!requestedFinish.trim() && !finish;
  const filtered = useMemo(() => filterShowroomProducts(products, category, search), [products, category, search]);
  const filterKey = JSON.stringify([category, normalizeShowroomText(search)]);
  const page = showroomPage(filtered, pagination.key === filterKey ? pagination.count : COLLECTION_PAGE_SIZE);
  const hasFilters = !!requestedCategory.trim() || !!search.trim();
  const categoryCounts = useMemo(() => new Map(categories.map(item => [item, filterShowroomProducts(products, item, "").length])), [categories, products]);

  useEffect(() => {
    const previous = document.title;
    document.title = `${category ? `${category} · ` : ""}La colección · El capo`;
    return () => { document.title = previous; };
  }, [category]);

  useEffect(() => {
    if (loading || error) return;
    const url = new URL(window.location.href);
    if (category) url.searchParams.set("categoria", category); else url.searchParams.delete("categoria");
    if (search.trim()) url.searchParams.set("q", search.trim()); else url.searchParams.delete("q");
    if (finish) url.searchParams.set("acabado", finish.id); else url.searchParams.delete("acabado");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [category, search, finish?.id, loading, error]);

  function clearFilters() { setRequestedCategory(""); setSearch(""); }
  function showMore() {
    const firstNew = filtered[page.items.length];
    setPagination({ key: filterKey, count: Math.min(filtered.length, page.items.length + COLLECTION_PAGE_SIZE) });
    if (firstNew) requestAnimationFrame(() => {
      const link = productLinks.current.get(firstNew.id);
      link?.focus({ preventScroll: true }); link?.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
  }

  return <div className="collection-shell">
    <Header />
    <main className="collection-page" id="main-content" tabIndex={-1}>
      <header className="collection-intro">
        <nav className="collection-breadcrumb" aria-label="Ubicación"><a href="/">Inicio</a><span aria-hidden="true">/</span><span aria-current="page">Colección</span></nav>
        <div className="collection-intro-grid"><div><p className="collection-eyebrow">El capo · La colección</p><h1>Encuentra tu<br /><em>próxima pieza.</em></h1></div><div className="collection-intro-copy"><p>Una forma de ordenar.<br />Un lugar para crear.<br />Una pieza que se hace tuya.</p><span>Explora los modelos y descubre sus medidas, acabados y posibilidades.</span></div></div>
      </header>
      <section className="collection-catalogue" aria-labelledby="collection-results-title">
        <h2 id="collection-results-title" className="collection-sr-only">Modelos de la colección</h2>
        <div className="collection-controls">
          <div className="collection-mobile-filter"><label htmlFor="collection-category-select">Categoría</label><select id="collection-category-select" value={category} onChange={event => setRequestedCategory(event.target.value)} data-ui-sound="select"><option value="">Todas las piezas ({products.length})</option>{categories.map(item => <option value={item} key={item}>{item} ({categoryCounts.get(item)})</option>)}</select></div>
          <div className="collection-categories" role="group" aria-label="Filtrar la colección por categoría"><button type="button" aria-pressed={!category} className={!category ? "is-selected" : ""} onClick={() => setRequestedCategory("")} data-ui-sound="select">Todas las piezas <span>{loading ? "—" : products.length}</span></button>{categories.map(item => <button type="button" key={item} aria-pressed={category === item} className={category === item ? "is-selected" : ""} onClick={() => setRequestedCategory(item)} data-ui-sound="select">{item}<span>{categoryCounts.get(item)}</span></button>)}</div>
          <div className="collection-search-field"><label className="collection-search-label" htmlFor="collection-search-input">Buscar una pieza</label><div className="collection-search"><Search size={20} strokeWidth={1.5} aria-hidden="true" /><input id="collection-search-input" type="search" value={search} maxLength={160} onChange={event => setSearch(event.target.value)} placeholder="Nombre, categoría o detalle" /></div></div>
        </div>
        <div className="collection-summary"><p role="status" aria-live="polite" aria-atomic="true">{loading ? "Preparando la colección…" : error ? "La colección no está disponible" : `Mostrando ${page.items.length} de ${filtered.length} ${filtered.length === 1 ? "modelo" : "modelos"}${category ? ` · ${category}` : ""}`}</p>{hasFilters && <button type="button" onClick={clearFilters} data-ui-sound="select">Limpiar filtros <X size={15} aria-hidden="true" /></button>}</div>
        {unavailableCategory && <p className="collection-link-notice" role="status">La categoría del enlace ya no está disponible. Ese filtro no se ha aplicado; puedes explorar las categorías actuales.</p>}
        {finish && <div className="collection-finish-note"><span style={{ backgroundColor: finish.color }} aria-hidden="true" /><p>Al abrir tu pieza continuarás con <strong>{materialLabel(finish)}</strong>. Las imágenes muestran un acabado de referencia.</p><button type="button" aria-label="Quitar el acabado del enlace" onClick={() => setRequestedFinish("")} data-ui-sound="select"><X size={17} aria-hidden="true" /></button></div>}
        {unavailableFinish && <p className="collection-link-notice" role="status">El acabado del enlace no está disponible. Podrás elegir entre los acabados actuales al abrir una pieza.</p>}
        {loading && <div className="collection-grid collection-skeletons" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <div className="collection-skeleton" key={index}><div /><span /><span /></div>)}</div>}
        {!loading && error && <div className="collection-message" role="alert"><Layers3 size={36} strokeWidth={1} aria-hidden="true" /><h3>Volvamos a abrir la colección.</h3><p>{error}</p><button type="button" onClick={() => void load()}>Volver a cargar <ArrowRight size={18} aria-hidden="true" /></button></div>}
        {!loading && !error && !filtered.length && <div className="collection-message"><Search size={34} strokeWidth={1.2} aria-hidden="true" /><h3>{products.length ? "Hagamos espacio a otra idea." : "Estamos preparando nuevas posibilidades."}</h3><p>{products.length ? "Prueba otra palabra o vuelve a explorar todas las piezas." : "Los modelos aparecerán aquí cuando estén publicados. Puedes contarnos qué necesita tu espacio."}</p>{products.length ? <button type="button" onClick={clearFilters}>Ver todas las piezas <ArrowRight size={18} aria-hidden="true" /></button> : <a href="/#contacto">Conversar con el taller <ArrowUpRight size={18} aria-hidden="true" /></a>}</div>}
        {!loading && !error && filtered.length > 0 && <>
          <div className="collection-grid">{page.items.map((product, index) => <article className="collection-card" key={product.id}>
            <a href={showroomProductHref(product.id, finish?.id)} ref={element => { if (element) productLinks.current.set(product.id, element); else productLinks.current.delete(product.id); }} aria-labelledby={`collection-title-${product.id}`} aria-describedby={`collection-detail-${product.id}`} data-ui-sound="tap">
              <div className="collection-card-art"><ProductRoom product={product} materials={settings?.materials ?? []} className="collection-product-room" priority={index === 0} /><span className="collection-card-open" aria-hidden="true"><ArrowUpRight size={21} strokeWidth={1.5} /></span></div>
              <div className="collection-card-info"><p className="collection-card-category">{product.category}</p><h3 id={`collection-title-${product.id}`}>{product.name}</h3><p className="collection-card-dimensions" id={`collection-detail-${product.id}`}><span className="collection-sr-only">Medidas de referencia: ancho, alto y fondo. </span>{product.defaults.width / 10} × {product.defaults.height / 10} × {product.defaults.depth / 10} cm</p><div className="collection-card-bottom"><span className="collection-card-price">{product.showPrice === false || product.publicPrice == null || !Number.isFinite(product.publicPrice) ? "Precio por cotizar" : <><small>Diseño de referencia</small><strong>{money(product.publicPrice)}</strong></>}</span><span className="collection-card-cta">Ver pieza <ArrowRight size={16} aria-hidden="true" /></span></div></div>
            </a>
          </article>)}</div>
          <div className="collection-more"><p>{page.items.length} de {filtered.length} modelos</p>{page.remaining > 0 ? <button type="button" onClick={showMore} data-ui-sound="tap">Ver {Math.min(COLLECTION_PAGE_SIZE, page.remaining)} piezas más <ArrowDown size={18} aria-hidden="true" /></button> : <span>Has visto todas las piezas de esta selección.</span>}</div>
          <p className="collection-render-note">Ambientes ilustrativos. Medidas e importes de referencia; cada cambio se vuelve a cotizar y el taller confirma los detalles antes de fabricar.</p>
        </>}
      </section>
      <section className="collection-invitation"><div><p className="collection-eyebrow">Un punto de partida, contigo.</p><h2>La pieza empieza aquí.<br />La medida la pones tú.</h2></div><a href="/asistente" data-ui-sound="tap">Ayúdame a encontrarla <ArrowUpRight size={19} aria-hidden="true" /></a></section>
    </main>
    <Footer settings={settings} />
  </div>;
}
