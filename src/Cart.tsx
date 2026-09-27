import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Copy,
  Download,
  MessageCircle,
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
import { exportCuts } from "./Configurator";
export default function Cart() {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [settings, setSettings] = useState<PublicSettings>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [remove, setRemove] = useState<Design>();
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
  const total = designs.reduce((n, d) => n + d.price * d.quantity, 0);
  const message = [
    "Hola, quiero cotizar estos muebles AlRazz:",
    ...designs.map((d) =>
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
        "Referencia: " + money(d.price * d.quantity),
        location.origin + "/configurar?d=" + encodeURIComponent(d.id),
      ].join("\n"),
    ),
    "Total referencial: " + money(total),
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
                      panels={d.result.panels}
                      materials={d.materials}
                      {...d.config}
                    />
                  </div>
                  <div className="cart-detail">
                    <span className="eyebrow">{d.product.category}</span>
                    <h2>{d.product.name}</h2>
                    <p>
                      {d.config.width / 10} × {d.config.height / 10} ×{" "}
                      {d.config.depth / 10} cm ·{" "}
                      {d.materials.find((f) => f.id === d.config.finish)?.name}
                    </p>
                    <strong>
                      {money(d.price)} <small>por unidad</small>
                    </strong>
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
                      <button onClick={() => exportCuts(d.result, d.id)}>
                        <Download size={14} /> Despiece
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
                  {designs.reduce((n, d) => n + d.quantity, 0)} muebles
                </span>
                <b>{money(total)}</b>
              </div>
              <p className="small-note">
                Total referencial. Cada diseño conserva su versión y precio
                guardados. El equipo confirmará las tarifas y condiciones
                finales.
              </p>
              {settings?.whatsapp ? (
                <a
                  className="button rust full"
                  target="_blank"
                  rel="noreferrer"
                  href={
                    "https://wa.me/" +
                    settings.whatsapp +
                    "?text=" +
                    encodeURIComponent(message)
                  }
                >
                  Cotizar por WhatsApp <MessageCircle size={20} />
                </a>
              ) : (
                <div className="info-box">
                  El canal de WhatsApp aún está por confirmar. Puedes descargar
                  tu solicitud o copiarla para enviarla a AlRazz.
                </div>
              )}
              <button
                className="button outline full"
                onClick={() =>
                  download(
                    "AlRazz-solicitud.txt",
                    message,
                    "text/plain;charset=utf-8",
                  )
                }
              >
                Descargar resumen <Download size={18} />
              </button>
              <button
                className="text-link"
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
      <Footer />
    </>
  );
}
