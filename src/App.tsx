import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import {
  ArrowUpRight,
  ShoppingBag,
  Menu,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import type { PublicSettings } from "./types";
import { Brand } from "./Brand";
import { nextLogoTap } from "./footer-access";
import "./chrome-quote.css";
import "./home-redesign.css";
import "./alrazz-identity.css";
import { startMeasurements } from "../lib/measurement-client";
import { MeasurementPreferences } from "./MeasurementPreferences";
import "./measurements.css";
import "./editorial-chrome.css";
import Home from "./Home";
const Collection = lazy(() => import("./Collection"));
const ProductStory = lazy(() => import("./ProductStory"));
const DesignAssistant = lazy(() => import("./DesignAssistant"));
const CustomerQuote = lazy(() => import("./CustomerQuote"));
const Configurator = lazy(() => import("./Configurator"));
const Cart = lazy(() => import("./Cart"));
const Admin = lazy(() => import("./Admin"));
const KitchenPlanner = lazy(() => import("./KitchenPlanner"));
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
      <header className="site-header site-header--branded site-header--redesign" ref={header}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
        }}>
        <a className="brand-link" href="/" aria-label="El capo, ir al inicio">
          <Brand />
        </a>
        <nav className={`site-nav${menuOpen ? " is-open" : ""}`} id={navigationId}
          aria-label="Navegación principal" ref={navigation} onClick={() => setMenuOpen(false)}>
          <a href="/#ambientes">Ambientes</a>
          <a href="/coleccion">Muebles</a>
          <a href="/#materiales">Materiales</a>
          <a href="/#proceso">Nuestro proceso</a>
          <a className="site-nav-design" href="/asistente">Encontrar mi diseño <ArrowUpRight size={20} aria-hidden="true" /></a>
        </nav>
        <div className="header-actions">
          {!compact && (
            <a href="/asistente" className="header-cta">
              Diseñamos contigo <ArrowUpRight size={18} aria-hidden="true" />
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
    <footer className="site-footer editorial-footer">
      <div className="editorial-footer-brand">
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
      <p className="editorial-footer-note">Tu espacio, pensado contigo.<br/>Hecho en Perú.</p>
      </div>
      <nav aria-label="Explorar AlRazz" className="editorial-footer-links"><p>Encuentra tu lugar</p><a href="/#ambientes">Ambientes</a><a href="/coleccion">Nuestros muebles</a><a href="/asistente">Asistente de diseño</a><a href="/cocinas">Diseñar una cocina</a></nav>
      <nav aria-label="Información del taller" className="editorial-footer-links"><p>De la idea a tu casa</p><a href="/#proceso">Cómo trabajamos</a><a href="/#materiales">Materiales y acabados</a><a href="/#contacto">Conversemos</a>
      {settings?.facebook && (
        <a href={settings.facebook} target="_blank" rel="noopener noreferrer">
          Facebook ↗
        </a>
      )}
      </nav>
      <div className="editorial-footer-bottom"><span>El capo · {new Date().getFullYear()}</span><span>Diseños a medida · Melamina de 18 mm</span>
      <MeasurementPreferences />
      </div>
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
      ) : path === "/coleccion" ? (
        <Collection />
      ) : path === "/mueble" ? (
        <ProductStory />
      ) : (
        <Home />
      )}
    </Suspense>
  );
}
