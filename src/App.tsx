import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Layers3,
  Ruler,
  Search,
  ShoppingBag,
  Menu,
  X,
  Check,
  SlidersHorizontal,
} from "lucide-react";
import { api } from "../lib/api";
import { money } from "../lib/format-price";
import type { PublicProduct, PublicSettings } from "./types";
import { CardPreview } from "./CardPreview";
import { materialLabel, materialBrands } from "./materials";
import { MaterialSwatch } from "./MaterialSwatch";
import { ContactLinks } from "./ContactLinks";
import { Brand } from "./Brand";
import { useRevealMotion } from "./useRevealMotion";
import { nextLogoTap } from "./footer-access";
import "./chrome-quote.css";
import "./home-redesign.css";
import "./alrazz-identity.css";
import { startMeasurements } from "../lib/measurement-client";
import { MeasurementPreferences } from "./MeasurementPreferences";
import "./measurements.css";
const DesignAssistant = lazy(() => import("./DesignAssistant"));
const CustomerQuote = lazy(() => import("./CustomerQuote"));
const CompletedProjects = lazy(() => import("./CompletedProjects").then(module => ({default:module.CompletedProjects})));
const Configurator = lazy(() => import("./Configurator"));
const Cart = lazy(() => import("./Cart"));
const Admin = lazy(() => import("./Admin"));
const KitchenPlanner = lazy(() => import("./KitchenPlanner"));
const catalogSearchText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
export function Header({ compact = false }: { compact?: boolean }) {
  const [count, setCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const navigationId = useId();
  useEffect(() => {
    let current = true;
    api("action=designs")
      .then((d) => {
        if (current) setCount(
          d.designs?.reduce(
            (n: number, d: { quantity: number }) => n + d.quantity,
            0,
          ) || 0,
        );
      })
      .catch(() => {});
    return () => { current = false; };
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    navigation.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !header.current?.contains(event.target))
        setMenuOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    const desktop = window.matchMedia("(min-width: 1101px)");
    const closeDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    desktop.addEventListener("change", closeDesktop);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
      desktop.removeEventListener("change", closeDesktop);
    };
  }, [menuOpen]);
  return (
    <>
      <a className="site-skip-link" href="#main-content" onClick={(event) => {
        const content = document.getElementById("main-content") || document.querySelector("main");
        if (content) {
          event.preventDefault();
          content.tabIndex = -1;
          content.focus();
          content.scrollIntoView({ block: "start" });
        }
      }}>Saltar al contenido</a>
      <div className="announcement site-announcement">
        Hecho en Perú. Pensado para ti. <span>Melamina de 18 mm</span>
      </div>
      <header className="site-header site-header--branded site-header--redesign" ref={header}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
        }}>
        <a className="brand-link" href="/" aria-label="El capo, ir al inicio">
          <Brand />
        </a>
        <nav className={`site-nav${menuOpen ? " is-open" : ""}`} id={navigationId}
          aria-label="Navegación principal" ref={navigation} onClick={() => setMenuOpen(false)}>
          <a href="/#catalogo">Nuestros muebles</a>
          <a href="/cocinas">Cocinas</a>
          <a href="/asistente">Asistente de diseño</a>
          <a href="/#proceso">Cómo funciona</a>
          <a href="/#materiales">Materiales</a>
          <a href="/#contacto">Contacto</a>
          <a className="site-nav-design" href="/asistente">Encontrar mi diseño <ArrowUpRight size={20} aria-hidden="true" /></a>
        </nav>
        <div className="header-actions">
          {!compact && (
            <a href="/asistente" className="header-cta">
              Empezar mi proyecto <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          )}
          <a
            className="bag"
            href="/carrito"
            aria-label={"Mis diseños, " + count + " muebles"}
          >
            <ShoppingBag size={21} aria-hidden="true" />
            <span aria-hidden="true">{count}</span>
          </a>
          <button className="site-menu-toggle" type="button" ref={menuButton}
            aria-expanded={menuOpen} aria-controls={navigationId}
            aria-label={menuOpen ? "Cerrar menú de navegación" : "Abrir menú de navegación"}
            onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={23} aria-hidden="true" /> : <Menu size={23} aria-hidden="true" />}
          </button>
        </div>
      </header>
    </>
  );
}
export function Footer({
  settings,
}: {
  settings?: Pick<PublicSettings, "facebook">;
}) {
  const taps = useRef({ count: 0, at: -Infinity });
  return (
    <footer className="site-footer">
      <button
        className="brand-link footer-brand-access"
        type="button"
        aria-label="El capo, acceso al taller"
        onClick={() => {
          const next = nextLogoTap(taps.current, performance.now());
          taps.current = next;
          if (next.enter) window.location.assign("/admin");
        }}
      >
        <Brand variant="footer" />
      </button>
      <p>Muebles en melamina Marlon</p>
      {settings?.facebook && (
        <a href={settings.facebook} target="_blank" rel="noopener noreferrer">
          Facebook ↗
        </a>
      )}
      <span>Diseñado y fabricado en Perú · 2026</span>
      <MeasurementPreferences />
    </footer>
  );
}
export default function App() {
  const path = window.location.pathname;
  useEffect(() => { void startMeasurements(); }, []);
  return (
    <Suspense
      fallback={<div className="loading-page">Preparando tu espacio…</div>}
    >
      {path === "/cotizacion" ? (
        <CustomerQuote />
      ) : path === "/asistente" ? (
        <DesignAssistant />
      ) : path === "/admin" ? (
        <Admin />
      ) : path === "/configurar" ? (
        <Configurator />
      ) : path === "/carrito" ? (
        <Cart />
      ) : path === "/cocinas" ? (
        <KitchenPlanner />
      ) : (
        <Home />
      )}
    </Suspense>
  );
}
function Home() {
  const page = useRef<HTMLElement>(null);
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [settings, setSettings] = useState<PublicSettings>();
  const [error, setError] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  function load() {
    setError("");
    setLoading(true);
    api<{ products: PublicProduct[]; settings: PublicSettings }>("action=catalog")
      .then((data) => {
        setProducts(data.products);
        setSettings(data.settings);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "No pudimos cargar los muebles."))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);
  const categories = [...new Set(products.map((product) => product.category))];
  const finishes = settings?.materials.filter((material) => material.active) || [];
  const shown = products.filter((product) =>
    (!category || product.category === category) &&
    catalogSearchText(`${product.name} ${product.category} ${product.description}`).includes(catalogSearchText(search)),
  );
  const hasFilters = Boolean(search.trim() || category);
  const heroProduct = products[0];
  function clearFilters() {
    setSearch("");
    setCategory("");
  }
  useRevealMotion(page, category + ":" + shown.map((product) => product.id).join(","));
  return (
    <div className="home-shell">
      <Header />
      <main className="home-page" id="main-content" ref={page} tabIndex={-1}>
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-image home-hero-blueprint">
            <div className="home-hero-sheet">
              <div className="home-hero-sheet-head"><span>Diseño de catálogo</span><span>Melamina · 18 mm</span></div>
              {heroProduct && settings ? <CardPreview product={heroProduct} materials={settings.materials} /> : <div className="home-hero-sheet-placeholder" aria-hidden="true"><Layers3 size={90} strokeWidth={.7}/><span>Todo empieza por las medidas.</span></div>}
              <div className="home-hero-sheet-foot"><strong>{heroProduct?.name ?? "Una idea, bien pensada."}</strong>{heroProduct&&<span>{heroProduct.defaults.width/10} × {heroProduct.defaults.height/10} × {heroProduct.defaults.depth/10} cm</span>}<small>Representación digital · Acabados referenciales</small></div>
            </div>
          </div>
          <div className="home-hero-copy">
            <p className="home-eyebrow"><span aria-hidden="true" /> Diseñamos contigo. Lo hacemos a tu medida.</p>
            <h1 id="home-title">Cada espacio<br />tiene su<br /><em>medida.</em></h1>
            <p className="home-hero-intro">Primero pensamos en tu espacio.<br />Después encontramos el mueble que lo acompaña.</p>
            <a className="home-button home-button--dark" href="/asistente">Encontrar mi diseño <ArrowUpRight size={20} aria-hidden="true" /></a>
            <a className="home-hero-secondary" href="#catalogo">Explorar el catálogo <ArrowRight size={17} aria-hidden="true" /></a>
          </div>
          <p className="home-hero-caption">El capo <span>Del plano a tu casa.</span></p>
        </section>
        <div className="home-promise" aria-label="Nuestra propuesta">
          <p><Ruler size={18} strokeWidth={1.5} aria-hidden="true" /> Medidas que se adaptan a ti</p>
          <p><Layers3 size={18} strokeWidth={1.5} aria-hidden="true" /> Melamina de 18 mm</p>
          <p><Check size={18} strokeWidth={1.5} aria-hidden="true" /> Cada diseño se revisa contigo</p>
        </div>
        <section id="catalogo" className="home-section home-catalog" aria-labelledby="catalog-title" tabIndex={-1}>
          <div className="home-section-heading" data-reveal>
            <div><p className="home-eyebrow">Un punto de partida. Mil posibilidades.</p><h2 id="catalog-title">Encuentra tu forma.</h2></div>
            <p>Elige un modelo.<br />El siguiente paso lleva tus medidas.</p>
          </div>
          <div className="home-catalog-controls">
            <div className="home-category-list" role="group" aria-label="Filtrar por categoría">
              <button type="button" className={!category ? "is-active" : ""} aria-pressed={!category} onClick={() => setCategory("")}>Todos <span>{products.length}</span></button>
              {categories.map((item) => (
                <button type="button" key={item} className={category === item ? "is-active" : ""}
                  aria-pressed={category === item} onClick={() => setCategory(item)}>
                  {item}<span>{products.filter((product) => product.category === item).length}</span>
                </button>
              ))}
            </div>
            <label className="home-search">
              <Search size={19} strokeWidth={1.6} aria-hidden="true" />
              <span className="home-visually-hidden">Buscar por nombre, categoría o descripción</span>
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="¿Qué estás buscando?" />
            </label>
          </div>
          <div className="home-catalog-summary">
            <p role="status" aria-live="polite" aria-atomic="true">
              {loading ? "Preparando la colección…" : error ? "Colección no disponible" : `${shown.length} ${shown.length === 1 ? "modelo" : "modelos"}${category ? ` · ${category}` : " para hacer tuyos"}`}
            </p>
            {hasFilters && <button type="button" onClick={clearFilters}>Limpiar filtros <X size={14} aria-hidden="true" /></button>}
          </div>
          {error && (
            <div className="home-catalog-message" role="alert">
              <SlidersHorizontal size={30} strokeWidth={1.3} aria-hidden="true" />
              <h3>La colección necesita un momento.</h3>
              <p>{error}</p>
              <button type="button" className="home-button home-button--dark" onClick={load}>Volver a cargar <ArrowRight size={18} aria-hidden="true" /></button>
            </div>
          )}
          {loading && <div className="home-product-grid home-skeleton-grid" aria-hidden="true">{Array.from({ length: 3 }, (_, index) => <div className="home-card-skeleton" key={index}><div /><span /><span /></div>)}</div>}
          {!loading && !error && shown.length === 0 && (
            <div className="home-catalog-message">
              <Search size={30} strokeWidth={1.3} aria-hidden="true" />
              <h3>{hasFilters ? "Todavía no encontramos esa combinación." : "Estamos preparando la colección."}</h3>
              <p>{hasFilters ? "Prueba con otra palabra o vuelve a ver todos los modelos." : "Puedes empezar en el configurador o conversar con nosotros sobre tu espacio."}</p>
              {hasFilters ? <button type="button" className="home-button home-button--dark" onClick={clearFilters}>Ver todos los muebles <ArrowRight size={18} aria-hidden="true" /></button> : <a href="/configurar" className="home-button home-button--dark">Empezar a diseñar <ArrowUpRight size={18} aria-hidden="true" /></a>}
            </div>
          )}
          {!loading && !error && shown.length > 0 && (
            <div className="home-product-grid">
              {shown.map((product, index) => (
                <a className="product-card home-product-card" key={product.id} href={`/configurar?producto=${encodeURIComponent(product.id)}`}
                  data-reveal data-reveal-key={category + ":" + product.id} data-reveal-delay={(index % 3) * 55}>
                  <div className="product-art">
                    <span className="home-card-label">A tu medida</span>
                    {product.preview && settings ? <CardPreview product={product} materials={settings.materials} /> : (
                      <div className="card-preview-placeholder" role="img" aria-label={`Vista de ${product.name} no disponible`}><Layers3 size={36} strokeWidth={1} aria-hidden="true" /><span>Descubre este modelo</span></div>
                    )}
                    <span className="home-card-open" aria-hidden="true"><ArrowUpRight size={20} /></span>
                  </div>
                  <div className="home-card-information">
                    <p className="home-card-category">{product.category}</p>
                    <div className="home-card-title"><h3>{product.name}</h3></div>
                    <p className="home-card-dimensions"><span className="home-visually-hidden">Ancho, alto y fondo: </span>{product.defaults.width / 10} × {product.defaults.height / 10} × {product.defaults.depth / 10} cm <span>· Personalizable</span></p>
                    <div className="home-card-bottom">
                      <span className="home-card-price">{product.publicPrice == null ? <span className="chrome-quote chrome-quote--compact">Cotizar <ArrowUpRight size={14} aria-hidden="true" /></span> : <>Este diseño <strong>{money(product.publicPrice)}</strong></>}</span>
                      <span className="home-card-cta">Personalizar <ArrowRight size={16} aria-hidden="true" /></span>
                    </div>
                    {finishes.length > 0 && <div className="home-card-finishes"><div className="mini-swatches" aria-hidden="true">{finishes.slice(0, 4).map((finish) => <MaterialSwatch key={finish.id} material={finish} title={materialLabel(finish)} />)}</div><span>{finishes.length} {finishes.length === 1 ? "acabado disponible" : "acabados disponibles"}</span></div>}
                  </div>
                </a>
              ))}
            </div>
          )}
          {!loading && !error && shown.length > 0 && <p className="home-catalog-note">Medidas de referencia: ancho × alto × fondo. Ajusta cada modelo en el configurador.<br />Las estimaciones y el despiece son preliminares; nuestro equipo valida los detalles antes de fabricar.</p>}
        </section>
        <section id="materiales" className="home-materials home-section" aria-labelledby="materials-title" tabIndex={-1}>
          <div className="home-material-copy" data-reveal>
            <p className="home-eyebrow">El carácter está en los detalles.</p>
            <h2 id="materials-title">El color cambia<br />todo.</h2>
            <p>Tonos que acompañan. Texturas que dan carácter. Encuentra el acabado que hace que tu mueble se sienta parte de casa.</p>
            <div className="home-material-spec"><Layers3 size={18} strokeWidth={1.5} aria-hidden="true" /><span>Siempre melamina de <strong>18 mm.</strong></span></div>
            {materialBrands(finishes).length > 0 && <p className="home-material-brands">{materialBrands(finishes).join(" · ")}</p>}
            <a className="home-text-link" href="/configurar">Explorar los acabados <ArrowRight size={18} aria-hidden="true" /></a>
          </div>
          <div className="home-material-selection" data-reveal data-reveal-delay="80">
            {finishes.length > 0 ? <div className="home-material-grid">{finishes.slice(0, 6).map((finish) => (
              <a href={`/configurar?acabado=${encodeURIComponent(finish.id)}`} key={finish.id} aria-label={`Diseñar con ${materialLabel(finish)}`}>
                <MaterialSwatch material={finish} /><span>{finish.name}</span><small>{finish.brand}{finish.board === "rh" ? " · RH" : ""}</small>
              </a>
            ))}</div> : <p className="home-material-unavailable">Los acabados disponibles aparecerán aquí al cargar la colección.</p>}
            <p className="home-material-note">Los tonos de pantalla son referenciales. Confirmamos disponibilidad y muestra física contigo.</p>
          </div>
        </section>
        <Suspense fallback={null}><CompletedProjects limit={6}/></Suspense>
        <section id="proceso" className="home-section home-process" aria-labelledby="process-title" tabIndex={-1}>
          <div className="home-section-heading" data-reveal><div><p className="home-eyebrow">De la pantalla a tu espacio.</p><h2 id="process-title">Pensarlo. Probarlo. Habitarlo.</h2></div><a className="home-text-link" href="/configurar">Empieza a crear <ArrowUpRight size={19} aria-hidden="true" /></a></div>
          <div className="home-steps">
            {[
              ["01", "Encuentra tu forma", "Elige el modelo que encaja con lo que necesitas. Es solo el principio."],
              ["02", "Hazlo tuyo", "Ajusta sus medidas y acabados. Explora tu combinación en 3D y guarda el diseño."],
              ["03", "Conversemos los detalles", "Solicita tu cotización. Revisamos juntos las medidas, los materiales y la fabricación."],
            ].map(([number, title, description], index) => <article key={number} data-reveal data-reveal-delay={index * 60}><span>{number}</span><h3>{title}</h3><p>{description}</p></article>)}
          </div>
          <a href="/cocinas" className="home-kitchen-link"><span><small>¿Estás pensando en algo más grande?</small><strong>Imagina tu cocina completa.</strong></span><ArrowUpRight size={28} strokeWidth={1.3} aria-hidden="true" /></a>
        </section>
        <section className="home-section home-faq" aria-labelledby="faq-title">
          <div data-reveal><p className="home-eyebrow">Antes de empezar.</p><h2 id="faq-title">Hagamos<br />espacio a tus dudas.</h2></div>
          <div className="home-faq-list">
            {[
              ["¿Qué puedo personalizar?", "Las medidas, la distribución, las repisas, las puertas y los acabados, según las opciones de cada modelo. El configurador te muestra los límites de tu diseño."],
              ["¿La cotización es definitiva?", "Es una estimación. Confirmamos materiales, medidas, accesorios, transporte e instalación contigo antes de cerrar la cotización y fabricar."],
              ["¿Cuándo estará listo?", "Nuestro equipo confirma la agenda de fabricación al revisar tu proyecto. La disponibilidad orientativa no reserva una fecha."],
              ["¿Puedo retomar mi diseño después?", "Sí. Guárdalo en Mis diseños y conserva su enlace para volver a la misma configuración."],
            ].map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}
          </div>
        </section>
        <section id="contacto" className="home-section home-contact-section" aria-labelledby="contact-title" tabIndex={-1}>
          <div data-reveal><p className="home-eyebrow">Lo hacemos contigo.</p><h2 id="contact-title">Tu próximo mueble<br />empieza en una conversación.</h2><p>Cuéntanos cómo es tu espacio y qué tienes en mente.<br />Te ayudamos a darle forma.</p></div>
          <div className="home-contact-panel" data-reveal data-reveal-delay="60">
            {settings ? <><ContactLinks settings={settings} />{settings.facebook && <a className="home-text-link" href={settings.facebook} target="_blank" rel="noopener noreferrer">Conoce nuestros trabajos en Facebook <ArrowUpRight size={17} aria-hidden="true" /><span className="home-visually-hidden"> (abre otra pestaña)</span></a>}</> : <p>Los contactos del taller estarán disponibles cuando cargue la colección.</p>}
          </div>
        </section>
      </main>
      <Footer settings={settings} />
    </div>
  );
}
