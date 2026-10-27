import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { money } from "../lib/format-price";
import type { CommercialQuoteResponseReceipt, CustomerCommercialQuote } from "../lib/commercial-quotes";
import type { Config, PublicMaterial } from "../lib/furniture";
import { CatalogThumbnail } from "./CatalogThumbnail";
import "./commercial-quotes.css";

const statusLabels = { issued: "Pendiente de revisión", accepted: "Aceptada por el cliente", changes_requested: "Cambios solicitados", superseded: "Versión sustituida", expired: "Vigencia terminada" };
const date = (value: string) => new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
function Configuration({ config, materials }: { config: Config; materials: PublicMaterial[] }) {
  const finish = (id: string) => materials.find(material => material.id === id)?.name ?? id;
  return <dl className="commercial-config"><dt>Medidas</dt><dd>{config.width} × {config.height} × {config.depth} mm</dd><dt>Distribución</dt><dd>{config.modules} columnas · {config.shelves} repisas por columna de almacenaje</dd><dt>Frentes</dt><dd>{{ none: "Sin puertas", lower: "Puertas inferiores", full: "Puertas completas" }[config.doors]} · {{ melamine: "Melamina", glass: "Vidrio", "aluminum-glass": "Aluminio y vidrio" }[config.front ?? "melamine"]}</dd><dt>Acabados</dt><dd>{finish(config.finish)} · interior {config.interior === "same" ? "igual al exterior" : finish(config.interior)}</dd><dt>Jalador</dt><dd>{{ push: "Push", exterior: "Exterior", embutido: "Embutido" }[config.handle]}</dd>{!!config.extras?.length && <><dt>Opciones guardadas</dt><dd>{config.extras.map(extra => `${extra.id} × ${extra.quantity}`).join(" · ")}</dd></>}</dl>;
}
export default function CustomerQuote() {
  const [token, setToken] = useState(() => window.location.hash.slice(1));
  const [quote, setQuote] = useState<CustomerCommercialQuote>();
  const [loading, setLoading] = useState(true), [sending, setSending] = useState(false);
  const [error, setError] = useState(""), [consent, setConsent] = useState(false), [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<CommercialQuoteResponseReceipt>();
  const [now, setNow] = useState(Date.now());
  const generation = useRef(0), operation = useRef<{ signature: string; id: string } | null>(null);
  useEffect(() => {
    const changed = () => setToken(window.location.hash.slice(1)); window.addEventListener("hashchange", changed);
    const oldTitle = document.title; document.title = "Revisar cotización · AlRazz";
    const robots = document.createElement("meta"); robots.name = "robots"; robots.content = "noindex,nofollow,noarchive"; document.head.appendChild(robots);
    const referrer = document.createElement("meta"); referrer.name = "referrer"; referrer.content = "no-referrer"; document.head.appendChild(referrer);
    const timer = window.setInterval(() => setNow(Date.now()), 10000);
    return () => { window.removeEventListener("hashchange", changed); window.clearInterval(timer); document.title = oldTitle; robots.remove(); referrer.remove(); generation.current++; };
  }, []);
  useEffect(() => {
    const current = ++generation.current; setQuote(undefined); setReceipt(undefined); setConsent(false); setMessage(""); setError(""); setLoading(true); setSending(false); operation.current = null;
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { setError("Abre el enlace completo que te compartió el taller."); setLoading(false); return; }
    api<{ quote: CustomerCommercialQuote }>("", { op: "view-commercial-quote", token })
      .then(value => { if (current === generation.current) setQuote(value.quote); })
      .catch(cause => { if (current === generation.current) setError(cause instanceof Error ? cause.message : "No pudimos abrir la cotización."); })
      .finally(() => { if (current === generation.current) setLoading(false); });
    return () => { generation.current++; };
  }, [token]);
  const canRespond = quote?.status === "issued" && new Date(quote.validUntil).getTime() > now && !receipt;
  async function respond(decision: "accept" | "changes") {
    if (!quote || !canRespond || sending || (decision === "accept" ? !consent : message.trim().length < 3)) return;
    const current = generation.current;
    const intent = { op: "respond-commercial-quote", token, id: quote.id, version: quote.version, decision,
      ...(decision === "accept" ? { consent: true } : { message: message.trim() }) };
    const signature = JSON.stringify(intent);
    if (operation.current?.signature !== signature) operation.current = { signature, id: crypto.randomUUID() };
    setSending(true); setError("");
    try {
      const result = await api<{ response: CommercialQuoteResponseReceipt }>("", { ...intent, requestId: operation.current.id });
      if (current !== generation.current) return;
      setReceipt(result.response);
      setQuote(previous => previous ? { ...previous, status: decision === "accept" ? "accepted" : "changes_requested", respondedAt: result.response.respondedAt } : previous);
    } catch (cause) {
      if (current !== generation.current) return;
      setError(cause instanceof Error ? cause.message : "No pudimos registrar tu respuesta. Puedes reintentar.");
      if (cause instanceof ApiError && [409, 410].includes(cause.status)) {
        try { const latest = await api<{ quote: CustomerCommercialQuote }>("", { op: "view-commercial-quote", token }); if (current === generation.current) setQuote(latest.quote); } catch {}
      }
    } finally { if (current === generation.current) setSending(false); }
  }
  function askChanges(event: FormEvent) { event.preventDefault(); void respond("changes"); }
  return <main className="customer-quote"><header><a href="/" className="commercial-brand">AlRazz</a><span>Cotización comercial privada</span></header>
    {loading ? <p role="status">Abriendo tu cotización…</p> : !quote ? <section className="commercial-card"><h1>No pudimos abrir este enlace.</h1><p role="alert">{error}</p><p>Solicita al taller el enlace de la versión vigente.</p></section> : <>
      <section className="commercial-card"><p className="commercial-eyebrow">{quote.reference} · versión {quote.version}</p><h1>{quote.document.title}</h1><p className="commercial-status">{statusLabels[quote.status]}</p><p>Emitida el {date(quote.issuedAt)}. Válida hasta el <strong>{date(quote.validUntil)}</strong>.</p>
        <div className="commercial-table-wrap"><table><thead><tr><th>Concepto</th><th>Cantidad</th><th>Por unidad</th><th>Importe</th></tr></thead><tbody>{quote.document.lines.map((line, index) => <tr key={index}><td>{line.description}</td><td>{line.quantity}</td><td>{money(line.unitPrice)}</td><td>{money(line.lineTotal)}</td></tr>)}</tbody></table></div><div className="commercial-total"><span>Total · PEN</span><strong>{money(quote.document.total)}</strong></div>
        <h2>Diseño conservado para esta versión</h2><div className="commercial-specifications">{quote.document.specifications.map((specification, index) => <article key={index}><h3>{specification.model}</h3><p>{specification.quantity} {specification.quantity === 1 ? "unidad" : "unidades"} · {specification.dimensions}</p>{specification.preview ? <CatalogThumbnail name={specification.model} geometry={specification.preview.geometry} materials={specification.preview.materials} handle={specification.preview.handle} /> : <p className="commercial-note">Esta solicitud histórica no conserva una vista visual. Revisa la configuración y los módulos siguientes con el taller antes de aceptar.</p>}<p>{specification.materials.join(" · ")}</p>{specification.config && <Configuration config={specification.config} materials={specification.materialDetails} />}{specification.modules?.map((module, moduleIndex) => <details key={moduleIndex}><summary>Pared {module.wall.toUpperCase()} · {module.name} · {module.row === "wall" ? "Alacena" : module.row === "tall" ? "Columna" : "Fila inferior"}</summary><p>{module.size.join(" × ")} mm{module.kind !== "furniture" ? " · Reserva; equipo no incluido" : ""}</p>{module.config && <Configuration config={module.config} materials={specification.materialDetails} />}</details>)}</article>)}</div>
        <h2>Servicios incluidos y excluidos</h2><p>Instalación: <strong>{quote.document.services.installation ? "incluida" : "no incluida"}</strong>. Transporte: <strong>{quote.document.services.transport ? "incluido" : "no incluido"}</strong>. Las reservas de equipos representan espacio libre; no incluyen electrodomésticos.</p>
        <h2>Condiciones de esta versión</h2><p className="commercial-terms">{quote.document.terms}</p><p className="commercial-note">La aceptación corresponde a esta versión e importe. No registra un pago; la fabricación y entrega se coordinan con el taller.</p>
      </section>
      {receipt && <section className="commercial-card commercial-confirmation" role="status"><h2>{receipt.decision === "accept" ? "Tu aceptación quedó registrada." : "Recibimos tu solicitud de cambios."}</h2><p>Versión {receipt.version} · {date(receipt.respondedAt)}. El taller continuará el seguimiento.</p></section>}
      {canRespond && <section className="commercial-card"><h2>Tu respuesta</h2><label className="commercial-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={sending} /><span>He revisado la versión {quote.version}, su importe de {money(quote.document.total)} y sus condiciones, y quiero aceptarla.</span></label><button type="button" className="crm-primary" disabled={!consent || sending} onClick={() => void respond("accept")}>{sending ? "Registrando…" : `Aceptar versión ${quote.version}`}</button><form onSubmit={askChanges} className="commercial-change-form"><label>¿Qué necesitas cambiar?<textarea value={message} onChange={event => setMessage(event.target.value)} rows={4} minLength={3} maxLength={2000} disabled={sending} placeholder="Describe las medidas, acabados o condiciones que quieres revisar." /></label><button type="submit" className="crm-secondary" disabled={sending || message.trim().length < 3}>Solicitar cambios</button></form></section>}
      {!canRespond && !receipt && <section className="commercial-card"><p>{quote.status === "superseded" ? "Esta versión fue sustituida. Solicita al taller el enlace vigente." : quote.status === "accepted" ? "Esta versión ya tiene una aceptación registrada." : quote.status === "changes_requested" ? "Los cambios ya están en revisión con el taller." : "La vigencia terminó. Solicita una nueva versión antes de aceptar."}</p></section>}
      {error && <p className="crm-message is-error" role="alert">{error}</p>}
    </>}
  </main>;
}
