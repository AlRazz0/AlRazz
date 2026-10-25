import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Copy,
  Download,
  Trash2,
  Plus,
  Minus,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, download } from "../lib/api";
import { money } from "../lib/furniture";
import type { Design, PublicSettings } from "./types";
import { Header, Footer } from "./App";
import Viewer from "./Viewer";
import { ContactLinks } from "./ContactLinks";
import { QuoteRequestForm } from "./QuoteRequestForm";
export default function Cart() {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [settings, setSettings] = useState<PublicSettings>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [remove, setRemove] = useState<Design>();
  const [contactsOpen, setContactsOpen] = useState(false);
  const [quoteSelection,setQuoteSelection] = useState<string[] | null>(null);
  const contactSection = useRef<HTMLDivElement>(null);
  function requestQuote() {
    setContactsOpen(true);
    contactSection.current?.scrollIntoView({ block: "nearest" });
    contactSection.current?.focus({ preventScroll: true });
  }
  function load() {
    setLoading(true);
    setError("");
    Promise.all([api("action=designs"), api("action=catalog")])
      .then(([d, c]) => {
        setDesigns(d.designs);
        setSettings(c.settings);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);
  async function mutate(d: Design, op: string, quantity?: number) {
    setBusy(d.id);
    try {
      if (op === "duplicate")
        await api("", {
          op: "save-design",
          productId: d.product.id,
          config: d.config,
        });
      else await api("", { op, id: d.id, quantity, version: d.version });
      const result = await api("action=designs");
      setDesigns(result.designs);
      if (op === "duplicate")
        toast.success("Copia guardada con la tarifa vigente.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy("");
      setRemove(undefined);
    }
  }
  const selectedDesigns = designs.filter(design => quoteSelection === null || quoteSelection.includes(design.id));
  const total = selectedDesigns.reduce<number | null>(
    (sum, design) =>
      sum === null || design.price == null
        ? null
        : sum + design.price * design.quantity,
    0,
  );
  const needsQuote = total === null;
  const message = [
    "Hola, El capo. Quiero cotizar estos muebles:",
    ...selectedDesigns.map((d) =>
      [
        d.product.name + " · " + d.quantity + " unidad(es)",
        d.config.width +
          " × " +
          d.config.height +
          " × " +
          d.config.depth +
          " mm",
        d.materials.find((m) => m.id === d.config.finish)?.name ||
          d.config.finish,
        d.price == null
          ? "Precio: por cotizar"
          : "Referencia: " + money(d.price * d.quantity),
        location.origin + "/configurar?d=" + encodeURIComponent(d.id),
      ].join("\n"),
    ),
    total === null
      ? "Total: por cotizar. La solicitud incluye muebles sin precio publicado."
      : "Total referencial: " + money(total),
    "Quedo pendiente de la validación técnica, precio final y disponibilidad.",
  ].join("\n\n");
  return (
    <>
      <Header />
      <main className="cart-page section">
        <div className="page-intro">
          <div>
            <p className="eyebrow">TUS IDEAS, EN UN SOLO LUGAR</p>
            <h1>Mis diseños.</h1>
          </div>
          <a className="text-link" href="/#catalogo">
            Añadir otro mueble <Plus size={19} />
          </a>
        </div>
        {loading ? (
          <p>Cargando diseños guardados…</p>
        ) : error ? (
          <div className="error-box" role="alert">
            {error}
            <button onClick={load}>Reintentar</button>
          </div>
        ) : !designs.length ? (
          <div className="empty-page">
            <h2>Tu próximo mueble empieza aquí.</h2>
            <p>Guarda una configuración para cotizarla cuando quieras.</p>
            <a className="button rust" href="/configurar">
              Diseñar mi mueble <ArrowUpRight size={18} />
            </a>
          </div>
        ) : (
          <div className="cart-layout">
            <div className="cart-items">
              {designs.map((d) => (
                <article key={d.id} className="cart-item">
                  <div className="cart-thumb">
                    <Viewer
                      small
                      panels={d.result.geometry}
                      materials={d.materials}
                      {...d.config}
                    />
                  </div>
                  <div className="cart-detail">
                    <label className="cart-quote-selection"><input type="checkbox" checked={quoteSelection === null || quoteSelection.includes(d.id)} onChange={event => {const current=quoteSelection ?? designs.map(design=>design.id);setQuoteSelection(event.target.checked ? [...current,d.id] : current.filter(id=>id!==d.id));}}/> Incluir en la cotización del taller</label>
                    <span className="eyebrow">{d.product.category}</span>
                    <h2>{d.product.name}</h2>
                    <p>
                      {d.config.width / 10} × {d.config.height / 10} ×{" "}
                      {d.config.depth / 10} cm ·{" "}
                      {d.materials.find((f) => f.id === d.config.finish)?.name}
                    </p>
                    {d.price == null ? (
                      <button
                        type="button"
                        className="button chrome-quote"
                        onClick={requestQuote}
                        aria-label={"Cotizar " + d.product.name}
                      >
                        Cotizar <ArrowUpRight size={17} />
                      </button>
                    ) : (
                      <strong>
                        {money(d.price)} <small>por unidad</small>
                      </strong>
                    )}
                    <div className="quantity">
                      <button
                        aria-label={"Quitar una unidad de " + d.product.name}
                        disabled={d.quantity <= 1 || busy === d.id}
                        onClick={() =>
                          mutate(d, "set-quantity", d.quantity - 1)
                        }
                      >
                        <Minus size={14} />
                      </button>
                      <span>{d.quantity}</span>
                      <button
                        aria-label={"Añadir una unidad de " + d.product.name}
                        disabled={d.quantity >= 20 || busy === d.id}
                        onClick={() =>
                          mutate(d, "set-quantity", d.quantity + 1)
                        }
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className="item-actions">
                      <a href={"/configurar?d=" + d.id}>Editar</a>
                      <button
                        disabled={busy === d.id}
                        onClick={() => mutate(d, "duplicate")}
                      >
                        <Copy size={14} /> Duplicar
                      </button>
                      <button
                        disabled={busy === d.id}
                        aria-label={"Eliminar " + d.product.name}
                        onClick={() => setRemove(d)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <aside className="cart-summary">
              <p className="eyebrow">RESUMEN DE TU SOLICITUD</p>
              <h2>Hagámoslo realidad.</h2>
              <div className="total-row">
                <span>
                  {selectedDesigns.reduce((n, d) => n + d.quantity, 0)} muebles seleccionados
                </span>
                <b>{total === null ? "Por cotizar" : money(total)}</b>
              </div>
              <p className="small-note">
                {needsQuote
                  ? "Tu solicitud incluye muebles sin precio publicado. El equipo preparará la cotización completa con las medidas y cantidades guardadas."
                  : "Total referencial. Cada diseño conserva su versión y precio guardados. El equipo confirmará las tarifas y condiciones finales."}
              </p>
              <div className="cart-quote-count"><strong>{selectedDesigns.length} de {designs.length} diseños seleccionados para cotizar</strong>{designs.length > 20 && <button type="button" className="text-link" onClick={() => setQuoteSelection(designs.slice(0,20).map(design=>design.id))}>Elegir los primeros 20</button>}<p>La solicitud al taller incluirá únicamente los diseños marcados, con sus cantidades guardadas.</p></div>
              <QuoteRequestForm sources={selectedDesigns.map(design=>({kind:"design" as const,id:design.id,version:design.version}))} projectTitle={selectedDesigns.length + " diseños seleccionados"}/>
              <div ref={contactSection} tabIndex={-1} id="cart-quote-contacts">
                {needsQuote && (
                  <button
                    type="button"
                    className="button chrome-quote full"
                    onClick={() => setContactsOpen(!contactsOpen)}
                    aria-expanded={contactsOpen}
                    aria-controls="cart-contact-options"
                  >
                    Cotizar mis diseños <ArrowUpRight size={18} />
                  </button>
                )}
                {selectedDesigns.length > 0 && (!needsQuote || contactsOpen) && (
                  <div id="cart-contact-options">
                    {settings && (settings.whatsapp || settings.whatsappSecondary) ? (
                      <ContactLinks settings={settings} message={message} />
                    ) : (
                      <div className="info-box">
                        El canal de WhatsApp aún está por confirmar. Puedes descargar
                        tu solicitud o copiarla para enviarla a El capo.
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                className="button outline full"
                disabled={!selectedDesigns.length}
                onClick={() =>
                  download(
                    "El-capo-solicitud.txt",
                    message,
                    "text/plain;charset=utf-8",
                  )
                }
              >
                Descargar resumen <Download size={18} />
              </button>
              <button
                className="text-link"
                disabled={!selectedDesigns.length}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(message);
                    toast.success("Solicitud copiada.");
                  } catch {
                    toast.error("No se pudo copiar. Descarga el resumen.");
                  }
                }}
              >
                Copiar solicitud <Copy size={16} />
              </button>
              <p className="small-note">
                Tus diseños quedan vinculados a este navegador mediante una
                cookie. Conserva sus enlaces para abrirlos desde otro
                dispositivo.
              </p>
            </aside>
          </div>
        )}
      </main>
      <AlertDialog
        open={!!remove}
        onOpenChange={(v) => {
          if (!v) setRemove(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Quitar este diseño de tu lista?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {remove?.product.name} dejará de aparecer en Mis diseños.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Conservar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => remove && mutate(remove, "remove-design")}
            >
              Quitar diseño
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Footer settings={settings} />
    </>
  );
}
