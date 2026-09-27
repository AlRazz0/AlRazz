import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Layers3,
  Ruler,
  ShoppingBag,
} from "lucide-react";
import { api } from "../lib/api";
import { money } from "../lib/furniture";
import type { PublicProduct, PublicSettings } from "./types";
import Viewer from "./Viewer";
import { materialLabel, materialBrands } from "./materials";
import { MaterialSwatch } from "./MaterialSwatch";
import { ContactLinks } from "./ContactLinks";
import { useRevealMotion } from "./useRevealMotion";
const Configurator = lazy(() => import("./Configurator"));
const Cart = lazy(() => import("./Cart"));
const Admin = lazy(() => import("./Admin"));
export function Header({ compact = false }: { compact?: boolean }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    api("action=designs")
      .then((d) =>
        setCount(
          d.designs?.reduce(
            (n: number, d: { quantity: number }) => n + d.quantity,
            0,
          ) || 0,
        ),
      )
      .catch(() => {});
  }, []);
  return (
    <>
      <div className="announcement">
        Hecho en Perú. Diseñado para tu espacio. <span>Melamina de 18 mm</span>
      </div>
      <header className="site-header">
        <a className="wordmark" href="/">
          AlRazz<span>®</span>
        </a>
        <nav>
          <a href="/#catalogo">Muebles ⌄</a>
          <a href="/#proceso">Cómo funciona</a>
          <a href="/#materiales">Materiales</a>
          <a href="/#contacto">Hablemos</a>
        </nav>
        <div className="header-actions">
          {!compact && (
            <a href="/configurar" className="header-cta">
              Diseña el tuyo <ArrowUpRight size={18} />
            </a>
          )}
          <a
            className="bag"
            href="/carrito"
            aria-label={"Mis diseños, " + count + " muebles"}
          >
            <ShoppingBag size={22} />
            <span>{count}</span>
          </a>
        </div>
      </header>
    </>
  );
}
export function Footer() {
  return (
    <footer>
      <a className="wordmark" href="/">
        AlRazz<span>®</span>
      </a>
      <p>Muebles para tu forma de vivir.</p>
      <a href="/admin">Administración</a>
      <span>Diseñado y fabricado en Perú · 2026</span>
    </footer>
  );
}
export default function App() {
  const path = window.location.pathname;
  return (
    <Suspense
      fallback={<div className="loading-page">Preparando tu espacio…</div>}
    >
      {path === "/admin" ? (
        <Admin />
      ) : path === "/configurar" ? (
        <Configurator />
      ) : path === "/carrito" ? (
        <Cart />
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
  const [category, setCategory] = useState("Todos");
  const [loading, setLoading] = useState(true);
  function load() {
    setError("");
    setLoading(true);
    api("action=catalog")
      .then((d) => {
        setProducts(d.products);
        setSettings(d.settings);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);
  const shown = products.filter(
    (p) => category === "Todos" || p.category === category,
  );
  useRevealMotion(
    page,
    category + ":" + products.map((product) => product.id).join(","),
  );
  return (
    <>
      <Header />
      <main ref={page}>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">TU ESPACIO. TUS REGLAS.</p>
            <h1>
              No todos los
              <br />
              espacios son iguales.
              <br />
              <em>Tu mueble tampoco.</em>
            </h1>
            <p className="intro">
              Muebles de melamina hechos a tu medida.
              <br />
              Elige un diseño, dale tu forma y hazlo tuyo.
            </p>
            <a className="button cream" href="/configurar">
              Diseñar mi mueble <ArrowUpRight size={21} />
            </a>
            <div className="hero-foot">
              <span>
                <Ruler size={18} /> A tu medida
              </span>
              <span>
                <Layers3 size={18} /> Melamina de 18 mm
              </span>
            </div>
          </div>
          <div className="hero-photo">
            <img
              src="/images/hero.png"
              alt="Estantería modular terracota con puertas inferiores en un espacio cálido"
            />
            <div className="image-caption">
              <span>La forma de habitar tu espacio.</span>
              <span>ALRAZZ · COLECCIÓN MODULAR</span>
            </div>
          </div>
        </section>
        <section id="catalogo" className="section catalog-intro">
          <div data-reveal>
            <p className="eyebrow">UN BUEN PUNTO DE PARTIDA</p>
            <h2>
              Elige el mueble.
              <br />
              <span>El resto lo decides tú.</span>
            </h2>
          </div>
          <a
            className="text-link"
            href="/configurar"
            data-reveal
            data-reveal-delay="90"
          >
            Crear mi combinación <ArrowRight size={21} />
          </a>
          <div className="filter-row" aria-label="Filtrar muebles">
            {["Todos", ...new Set(products.map((p) => p.category))].map((c) => (
              <button
                key={c}
                className={c === category ? "active" : ""}
                onClick={() => setCategory(c)}
                aria-pressed={c === category}
              >
                {c}
              </button>
            ))}
          </div>
          {error && (
            <div className="error-box" role="alert">
              {error}
              <button onClick={load}>Reintentar</button>
            </div>
          )}
          {loading && <p className="muted loading-copy">Cargando colección…</p>}
          {!loading && !error && shown.length === 0 && (
            <p className="muted loading-copy">
              Estamos preparando nuevos modelos para esta colección.
            </p>
          )}
          <div className="product-grid">
            {shown.map((p, index) => (
              <a
                className="product-card"
                key={p.id}
                href={"/configurar?producto=" + p.id}
                data-reveal
                data-reveal-key={category + ":" + p.id}
                data-reveal-delay={index * 65}
              >
                <div className="product-art">
                  <span className="product-label">A tu medida</span>
                  {p.preview && settings ? (
                    <Viewer
                      small
                      panels={p.preview.geometry}
                      materials={settings.materials}
                      {...p.defaults}
                    />
                  ) : (
                    <img src="/images/hero.png" alt={p.name} />
                  )}
                  <span className="product-arrow">
                    <ArrowUpRight size={24} />
                  </span>
                </div>
                <div className="product-title">
                  <h3>{p.name}</h3>
                  <span>Desde {money(p.publicPrice)}</span>
                </div>
                <p>
                  {p.category} · {p.defaults.width / 10} ×{" "}
                  {p.defaults.height / 10} × {p.defaults.depth / 10} cm
                </p>
                <div
                  className="mini-swatches"
                  aria-label="Acabados disponibles"
                >
                  {settings?.materials
                    .filter((m) => m.active)
                    .slice(0, 8)
                    .map((f) => (
                      <MaterialSwatch
                        key={f.id}
                        material={f}
                        title={materialLabel(f)}
                      />
                    ))}
                </div>
              </a>
            ))}
          </div>
          <p className="catalog-note">
            Importes referenciales. Cada diseño se valida antes de fabricar.
          </p>
        </section>
        <section id="proceso" className="process section">
          <p className="eyebrow" data-reveal>
            DE TU IDEA A TU ESPACIO
          </p>
          <h2 data-reveal>Así de tuyo. Así de simple.</h2>
          <div className="steps">
            {[
              [
                "01",
                "Elige tu punto de partida",
                "Encuentra el modelo que encaja con tu día a día.",
              ],
              [
                "02",
                "Dale tus medidas",
                "Prueba medidas, distribución y colores en 3D.",
              ],
              [
                "03",
                "Hagámoslo realidad",
                "Solicita tu cotización. Nuestro equipo valida cada detalle antes de fabricar.",
              ],
            ].map(([n, t, d], index) => (
              <article key={n} data-reveal data-reveal-delay={index * 85}>
                <span>{n}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="materiales" className="material-band section">
          <p className="eyebrow" data-reveal>
            LO ESENCIAL, BIEN HECHO
          </p>
          <h2 data-reveal>18 mm de posibilidades.</h2>
          <p data-reveal>
            Trabajamos principalmente con Hispano, junto a Vesto y Pelikano.
            Melamina de 18 mm y opciones RH para proyectos que requieren mayor
            resistencia a la humedad.
          </p>
          <div className="material-brands">
            {materialBrands(
              settings?.materials.filter((m) => m.active) || [],
            ).map((brand) => (
              <span key={brand}>{brand}</span>
            ))}
          </div>
          <div className="material-samples" data-reveal>
            {settings?.materials
              .filter((m) => m.active)
              .slice(0, 8)
              .map((f) => (
                <a href="/configurar" key={f.id}>
                  <MaterialSwatch material={f} />
                  {f.name}
                  <small>
                    {f.brand}
                    {f.board === "rh" ? " · RH" : ""}
                  </small>
                </a>
              ))}
          </div>
          <p className="small-note">
            Selección de los catálogos de las marcas. Imágenes y tonos de
            pantalla referenciales; confirmamos acabado, disponibilidad local y
            muestra física contigo.
          </p>
          <a className="button dark" href="/configurar">
            Explorar acabados <ArrowUpRight size={20} />
          </a>
        </section>
        <section className="section faq">
          <h2 data-reveal>Antes de empezar.</h2>
          {[
            [
              "¿Qué es la melamina RH?",
              "RH significa resistente a la humedad (moisture-resistant). Ofrece mayor resistencia que un tablero estándar, pero no es impermeable. Te ayudamos a elegir la variante adecuada y sus cuidados.",
            ],
            [
              "¿Qué puedo personalizar?",
              "Ancho, alto, fondo, número de módulos, repisas, puertas y acabados. Las opciones respetan los límites de cada modelo.",
            ],
            [
              "¿El precio es definitivo?",
              "Es una estimación. Confirmamos materiales, medidas, accesorios, transporte y condiciones de instalación antes de enviarte la cotización final.",
            ],
            [
              "¿Cuándo estará listo?",
              "La agenda de fabricación se confirma con nuestro equipo. La disponibilidad mostrada es orientativa y no reserva una fecha.",
            ],
            [
              "¿Puedo guardar mi diseño?",
              "Sí. Guárdalo en Mis diseños y comparte su enlace para retomar exactamente la misma configuración.",
            ],
          ].map(([q, a]) => (
            <details key={q} data-reveal>
              <summary>
                {q}
                <span>+</span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
        {settings && (
          <section id="contacto" className="section home-contact">
            <div data-reveal>
              <p className="eyebrow">CONVERSEMOS SOBRE TU ESPACIO</p>
              <h2>
                Tu idea tiene un lugar.
                <br />
                <span>Vamos a encontrarlo.</span>
              </h2>
              <p className="home-contact-copy">
                Cuéntanos qué tienes en mente. Te ayudamos a elegir las medidas,
                el acabado y los detalles de tu mueble.
              </p>
            </div>
            <div
              className="home-contact-actions"
              data-reveal
              data-reveal-delay="100"
            >
              <ContactLinks settings={settings} />
            </div>
          </section>
        )}
      </main>
      <Footer />
      {settings && <ContactLinks settings={settings} variant="floating" />}
    </>
  );
}
