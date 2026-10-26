import { lazy, Suspense, useEffect, useRef, useState, type RefObject } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Layers3, Ruler, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { Header, Footer } from "./App";
import { ContactLinks } from "./ContactLinks";
import { MaterialSwatch } from "./MaterialSwatch";
import { materialLabel } from "./materials";
import { useRevealMotion } from "./useRevealMotion";
import type { PublicProduct, PublicSettings } from "./types";
import "./editorial-home.css";

const ProductRoom = lazy(() => import("./ProductRoom"));
const CompletedProjects = lazy(() => import("./CompletedProjects"));
type Catalog = { products: PublicProduct[]; settings: PublicSettings };

function useNearViewport(target: RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = target.current;
    if (!element) return;
    let frame: number | undefined;
    const activateHashTarget = () => {
      if (!element.id || window.location.hash !== `#${element.id}`) return;
      setVisible(true);
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => element.scrollIntoView({ block: "start" }));
    };
    activateHashTarget();
    window.addEventListener("hashchange", activateHashTarget);
    const observer = "IntersectionObserver" in window ? new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer?.disconnect(); }
    }, { rootMargin: "400px" }) : undefined;
    if (observer) observer.observe(element); else setVisible(true);
    return () => {
      observer?.disconnect(); window.removeEventListener("hashchange", activateHashTarget);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [target]);
  return visible;
}

function EditorialImage({ scene, alt, hero = false }: { scene: string; alt: string; hero?: boolean }) {
  return <img src={`/images/editorial/${scene}-1600.webp`} srcSet={`/images/editorial/${scene}-800.webp 800w, /images/editorial/${scene}-1600.webp 1600w`}
    sizes={hero ? "100vw" : "(max-width: 760px) 100vw, 50vw"} alt={alt} width="1600" height="900"
    loading={hero ? "eager" : "lazy"} fetchPriority={hero ? "high" : "auto"} decoding="async" />;
}

export default function Home() {
  const page = useRef<HTMLElement>(null);
  const feature = useRef<HTMLElement>(null);
  const portfolio = useRef<HTMLDivElement>(null);
  const featureVisible = useNearViewport(feature);
  const portfolioVisible = useNearViewport(portfolio);
  const [catalog, setCatalog] = useState<Catalog>();
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState(0);
  const [finishId, setFinishId] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    document.title = "El capo · Tu casa, tu forma de vivir";
    let active = true;
    setError(false);
    void api<Catalog>("action=catalog").then(data => { if (active) setCatalog(data); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [attempt]);
  const products = catalog?.products ?? [];
  const materials = catalog?.settings.materials.filter(material => material.active) ?? [];
  const activeFinish = materials.find(material => material.id === finishId) ?? materials[0];
  // An editorial selection comes from the live catalog, never a second set of products.
  const featured = products.filter(product => !/cocina/i.test(product.category)).slice(0, 4);
  const choices = featured.length ? featured : products.slice(0, 4);
  const product = choices[selected % Math.max(choices.length, 1)];
  const roomLink = (match: RegExp) => {
    const category = products.find(candidate => match.test(candidate.category))?.category;
    return category ? `/coleccion?categoria=${encodeURIComponent(category)}` : "/coleccion";
  };
  useRevealMotion(page, `${product?.id}:${materials.length}`);

  return <div className="editorial-shell"><Header />
    <main id="main-content" className="editorial-home" ref={page} tabIndex={-1}>
      <section className="editorial-hero" aria-labelledby="editorial-title">
        <div className="editorial-hero-visual"><EditorialImage scene="living" hero alt="Ambiente de inspiración con luz natural, tonos cálidos y una composición de almacenaje en acabado madera." /></div>
        <div className="editorial-hero-content">
          <p className="editorial-kicker"><span /> Muebles a medida · Hecho en Perú</p>
          <h1 id="editorial-title">Se siente<br/>a <em>casa.</em></h1>
          <p className="editorial-hero-intro">Hay muebles que llenan un espacio.<br/>Y otros que lo hacen tuyo.</p>
          <a className="editorial-button editorial-button--light" href="#ambientes">Encuentra tu ambiente <ArrowUpRight size={20} aria-hidden="true" /></a>
          <a className="editorial-hero-assistant" href="/asistente">¿Ya tienes una idea? Diseñamos contigo <ArrowRight size={16} aria-hidden="true" /></a>
        </div>
        <div className="editorial-hero-bottom"><a href="#historia" aria-label="Descubrir cómo diseñamos"><ArrowDown size={19} aria-hidden="true" /><span>Hecho para tu manera de vivir</span></a><span>01 / Inspiración<br/><small>Ambiente creado digitalmente</small></span></div>
      </section>

      <section id="historia" className="editorial-intro editorial-section" aria-labelledby="intro-title">
        <p className="editorial-kicker" data-reveal>Lo cotidiano, bien pensado.</p>
        <div data-reveal><h2 id="intro-title">Un lugar para tus cosas.<br/><span>Más espacio para ti.</span></h2>
          <div className="editorial-intro-bottom"><p>Ese rincón que espera una idea. Los libros que siguen creciendo. Una cocina donde todo encuentra su lugar. Partimos de cómo vives para encontrar un mueble que tenga sentido en tu casa.</p><a className="editorial-link" href="/asistente">Cuéntanos tu idea <ArrowUpRight size={19} aria-hidden="true" /></a></div>
        </div>
      </section>

      <section id="ambientes" className="editorial-rooms editorial-section" aria-labelledby="rooms-title">
        <div className="editorial-section-head" data-reveal><div><p className="editorial-kicker">Empieza por lo que quieres sentir.</p><h2 id="rooms-title">Cada espacio.<br/>Una forma de vivirlo.</h2></div><p>Primero imagínalo.<br/>Después lo hacemos a tu medida.</p></div>
        <div className="editorial-room-grid">
          <a href={roomLink(/estanter|librer|almacen|modular/i)} className="editorial-room-card editorial-room-card--living" data-reveal>
            <div className="editorial-room-image"><EditorialImage scene="living" alt="Sala de inspiración con estantería en acabado madera y luz de mañana." /><span className="editorial-room-number">01 / Habitar</span><span className="editorial-room-arrow"><ArrowUpRight size={23} aria-hidden="true" /></span></div>
            <div className="editorial-room-copy"><h3>Tu sala. Tu ritmo.</h3><p>Un lugar para lo que te gusta tener cerca.</p><span>Descubrir muebles <ArrowRight size={16} aria-hidden="true" /></span></div>
          </a>
          <a href={roomLink(/ropero|dormitorio|armario/i)} className="editorial-room-card editorial-room-card--bedroom" data-reveal data-reveal-delay="60">
            <div className="editorial-room-image"><EditorialImage scene="bedroom" alt="Dormitorio de inspiración en tonos arena con ropero de líneas rectas." /><span className="editorial-room-number">02 / Descansar</span><span className="editorial-room-arrow"><ArrowUpRight size={23} aria-hidden="true" /></span></div>
            <div className="editorial-room-copy"><h3>Que el día termine en calma.</h3><p>Orden para tus mañanas. Calma para tus noches.</p><span>Explorar roperos <ArrowRight size={16} aria-hidden="true" /></span></div>
          </a>
          <a href={roomLink(/cocina/i)} className="editorial-room-card editorial-room-card--kitchen" data-reveal>
            <div className="editorial-room-image"><EditorialImage scene="kitchen" alt="Cocina de inspiración con módulos rectilíneos en tonos cálidos y una distribución en L." /><span className="editorial-room-number">03 / Compartir</span><span className="editorial-room-arrow"><ArrowUpRight size={23} aria-hidden="true" /></span></div>
            <div className="editorial-room-copy"><h3>Aquí pasan las mejores cosas.</h3><p>Una cocina pensada alrededor de tu día a día.</p><span>Conocer los módulos <ArrowRight size={16} aria-hidden="true" /></span></div>
          </a>
        </div>
        <div className="editorial-room-foot"><p>Ambientes ilustrativos creados digitalmente. Descubre las medidas, acabados y opciones de cada modelo antes de personalizarlo.</p><a className="editorial-link" href="/coleccion">Ver toda la colección <ArrowUpRight size={18} aria-hidden="true" /></a></div>
      </section>

      <section id="catalogo" className="editorial-feature" aria-labelledby="feature-title" ref={feature}>
        <div className="editorial-feature-copy" data-reveal><p className="editorial-kicker">Una pieza. Muchas posibilidades.</p><h2 id="feature-title">La forma es<br/>el comienzo.</h2><p>Conoce cada modelo en su ambiente. Cuando encuentres el tuyo, podrás ajustar las medidas, la distribución y los acabados que admite.</p><a className="editorial-link" href="/coleccion">Descubrir la colección <ArrowUpRight size={19} aria-hidden="true" /></a>
          <div className="editorial-feature-selection" aria-live="polite">{product ? <><span>{product.category}</span><h3>{product.name}</h3><p>{product.description}</p><a className="editorial-button" href={`/mueble?producto=${encodeURIComponent(product.id)}`}>Conocer este mueble <ArrowUpRight size={18} aria-hidden="true" /></a></> : error ? <><p>No pudimos cargar los modelos en este momento.</p><button className="editorial-link" onClick={() => setAttempt(value => value + 1)}>Volver a intentar <ArrowRight size={16}/></button></> : <p>{catalog ? "Estamos preparando la colección del taller." : "Preparando una selección del taller…"}</p>}</div>
          {choices.length > 1 && <div className="editorial-feature-controls"><span>{String(selected % choices.length + 1).padStart(2,"0")} <span>/ {String(choices.length).padStart(2,"0")}</span></span><button type="button" aria-label="Ver mueble anterior" onClick={() => setSelected(value => (value - 1 + choices.length) % choices.length)}><ChevronLeft size={20}/></button><button type="button" aria-label="Ver siguiente mueble" onClick={() => setSelected(value => (value + 1) % choices.length)}><ChevronRight size={20}/></button></div>}
        </div>
        <div className="editorial-feature-scene">{product && catalog && featureVisible ? <Suspense fallback={<div className="editorial-scene-placeholder"/>}><ProductRoom product={product} materials={catalog.settings.materials} sizes="(max-width:760px) 100vw, 62vw"/></Suspense> : <div className="editorial-scene-placeholder"><span>Diseñamos a partir de tu espacio.</span></div>}</div>
      </section>

      <section id="materiales" className="editorial-materials editorial-section" aria-labelledby="editorial-material-title">
        <div className="editorial-material-copy" data-reveal><p className="editorial-kicker">El carácter está en los detalles.</p><h2 id="editorial-material-title">Un mismo diseño.<br/><em>Otra sensación.</em></h2><p>La calidez de un acabado madera. La serenidad de un tono claro. Encuentra el lenguaje que acompaña tu casa.</p><div className="editorial-material-spec"><Layers3 size={21} strokeWidth={1.4}/><span>Melamina de <strong>18 mm</strong><br/><small>Acabados del catálogo del taller</small></span></div>
          <a className="editorial-link" href={activeFinish ? `/coleccion?acabado=${encodeURIComponent(activeFinish.id)}` : "/coleccion"}>Encontrar un mueble con este acabado <ArrowUpRight size={18} aria-hidden="true" /></a></div>
        <div className="editorial-material-stage" data-reveal>{materials.length ? <>
          <div className="editorial-material-stack" aria-hidden="true">{materials.slice(0,4).map((material,index) => <div className={`editorial-material-board editorial-material-board--${index}`} key={material.id}><MaterialSwatch material={index === 3 && activeFinish ? activeFinish : material}/></div>)}</div>
          <div className="editorial-material-picker"><p aria-live="polite">{activeFinish && materialLabel(activeFinish)}</p><div role="group" aria-label="Explorar acabados">{materials.slice(0,8).map(material => <button type="button" key={material.id} aria-label={materialLabel(material)} aria-pressed={material.id === activeFinish?.id} onClick={() => setFinishId(material.id)}><MaterialSwatch material={material}/></button>)}</div><small>El color en pantalla es referencial. Confirmamos la muestra y su disponibilidad contigo.</small></div>
        </> : <p>Los acabados disponibles aparecerán al cargar la colección.</p>}</div>
      </section>

      <section id="proceso" className="editorial-process editorial-section" aria-labelledby="editorial-process-title">
        <div className="editorial-section-head" data-reveal><div><p className="editorial-kicker">Cerca, de principio a fin.</p><h2 id="editorial-process-title">De «lo imagino»<br/>a «aquí me quedo».</h2></div><a className="editorial-link" href="/asistente">Empezar mi proyecto <ArrowUpRight size={19}/></a></div>
        <div className="editorial-process-grid">{[
          ["01", "Encuentra una idea", "Recorre los ambientes y conoce los muebles. Nuestro asistente también puede proponerte un punto de partida.", Sparkles],
          ["02", "Dale tu medida", "Cuando lo decidas, abre el configurador. Prueba las opciones del modelo y mira tu diseño en 3D mientras lo ajustas.", Ruler],
          ["03", "Lo revisamos contigo", "Envía tu diseño al taller. Confirmamos medidas, materiales, entrega e instalación antes de fabricar.", Layers3],
        ].map(([number,title,description,Icon]) => { const StepIcon = Icon as typeof Ruler; return <article key={number as string} data-reveal><div><span>{number as string}</span><StepIcon size={26} strokeWidth={1.2} aria-hidden="true" /></div><h3>{title as string}</h3><p>{description as string}</p></article>; })}</div>
      </section>
      <div id="trabajos" ref={portfolio}>{portfolioVisible && <Suspense fallback={null}><CompletedProjects limit={3}/></Suspense>}</div>
      <section className="editorial-questions editorial-section" aria-labelledby="questions-title"><div data-reveal><p className="editorial-kicker">Con las cosas claras.</p><h2 id="questions-title">Antes de hacerlo tuyo.</h2></div><div>{[
        ["¿Tengo que saber diseñar?", "No. Empieza por un modelo o cuéntale al asistente para qué necesitas el mueble. Puedes explorar sin cambiar medidas; la personalización se abre cuando la eliges."],
        ["¿El ambiente incluye todos los objetos?", "Los ambientes son ilustraciones para ayudarte a imaginar. La propuesta corresponde al mueble y a los servicios expresamente incluidos; la decoración y los electrodomésticos no se incluyen por aparecer en una imagen."],
        ["¿Puedo encargarlo directamente?", "Primero revisamos tu diseño y te enviamos una propuesta. Los importes y el despiece iniciales son referenciales hasta la validación del taller. La agenda de entrega se confirma contigo."],
      ].map(([question,answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
      <section id="contacto" className="editorial-contact editorial-section" aria-labelledby="editorial-contact-title"><div data-reveal><p className="editorial-kicker">La próxima historia empieza en tu casa.</p><h2 id="editorial-contact-title">Hagamos<br/>espacio para ti.</h2><a href="/asistente" className="editorial-button editorial-button--light">Diseñamos contigo <ArrowUpRight size={21}/></a></div><div className="editorial-contact-side"><p>Trae una idea, las medidas de tu espacio<br/>o esa duda que todavía no resuelves.</p>{catalog && <ContactLinks settings={catalog.settings}/>}<a className="editorial-contact-collection" href="/coleccion">Seguir explorando los muebles <ArrowRight size={18}/></a></div></section>
    </main><Footer settings={catalog?.settings}/></div>;
}
