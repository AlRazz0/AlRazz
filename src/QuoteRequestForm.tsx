import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import type { QuoteRequestReceipt, QuoteRequestSource } from "../lib/crm";
import "./quote-request.css";

export function QuoteRequestForm({ sources, projectTitle = "Tu proyecto", initiallyOpen = false }: {
  sources: readonly QuoteRequestSource[];
  projectTitle?: string;
  initiallyOpen?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(initiallyOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<QuoteRequestReceipt>();
  const [notice,setNotice] = useState("");
  const [fields, setFields] = useState({name:"",phone:"",email:"",city:"",message:""});
  const [consent, setConsent] = useState(false);
  const retry = useRef({signature:"",requestId:""});
  const heading = useRef<HTMLHeadingElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const sourceKey = JSON.stringify(sources);
  const currentSources = useRef(sourceKey);
  currentSources.current = sourceKey;
  useEffect(() => { setReceipt(undefined); setError(""); }, [sourceKey]);
  useEffect(() => { if(initiallyOpen)setOpen(true); }, [initiallyOpen]);
  useEffect(() => { if(open && !receipt)firstField.current?.focus({preventScroll:true}); }, [open,receipt]);
  const canSubmit = sources.length > 0 && sources.length <= 20;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !canSubmit) return;
    if (!fields.phone.trim() && !fields.email.trim()) {
      setError("Indica un teléfono o un correo para que podamos responderte."); return;
    }
    const payload = {op:"create-quote-request",sources:[...sources],...Object.fromEntries(Object.entries(fields).map(([key,value]) => [key,value.trim()])),consent};
    const signature = JSON.stringify(payload);
    const submittedSources = sourceKey;
    if (retry.current.signature !== signature) retry.current = {signature,requestId:crypto.randomUUID()};
    setBusy(true); setError("");
    try {
      const result = await api<{quoteRequest:QuoteRequestReceipt}>("",{...payload,requestId:retry.current.requestId});
      if(submittedSources !== currentSources.current) {
        setNotice(`La solicitud ${result.quoteRequest.reference} se registró con la versión enviada. Tu selección cambió después; puedes enviar una nueva solicitud para estos cambios.`);
        return;
      }
      setReceipt(result.quoteRequest);
      requestAnimationFrame(() => heading.current?.focus({preventScroll:true}));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos registrar tu solicitud. Inténtalo otra vez.");
    } finally { setBusy(false); }
  }
  return <section className="quote-request" aria-labelledby={`${id}-title`}>
    <div className="quote-request-heading"><ClipboardList size={22} aria-hidden="true" /><div>
      <p>Del diseño al taller</p><h3 id={`${id}-title`} ref={heading} tabIndex={-1}>{receipt ? "Tu solicitud quedó registrada." : "Solicita tu cotización."}</h3>
    </div></div>
    {notice && <p className="quote-request-intro" role="status">{notice}</p>}
    {receipt ? <div className="quote-request-success" role="status">
      <CheckCircle2 size={25} aria-hidden="true" /><div><strong>{receipt.reference}</strong>
        <p>El taller revisará tu proyecto y se comunicará por el teléfono o correo que indicaste. Guarda esta referencia.</p>
        <small>Registrar la solicitud no confirma un pedido ni implica un pago.</small>
      </div>
    </div> : <>
      <p className="quote-request-intro">{projectTitle}. Envía al taller las medidas, acabados y cantidades de la versión guardada. Tus datos de contacto se usan para atender esta solicitud.</p>
      {!open ? <button type="button" className="button quote-request-open" onClick={() => setOpen(true)} aria-expanded={false} aria-controls={`${id}-form`} disabled={!canSubmit}>
        Solicitar cotización al taller <ArrowUpRight size={17} aria-hidden="true" />
      </button> : <form id={`${id}-form`} onSubmit={submit}>
        <fieldset disabled={busy}>
          <legend className="quote-request-sr">Datos de contacto para la cotización</legend>
          <label>Tu nombre<input ref={firstField} autoComplete="name" required minLength={2} maxLength={120} value={fields.name} onChange={event => setFields({...fields,name:event.target.value})} /></label>
          <div className="quote-request-pair">
            <label>Teléfono o WhatsApp<input type="tel" inputMode="tel" autoComplete="tel" maxLength={40} placeholder="Incluye el código de país" value={fields.phone} onChange={event => setFields({...fields,phone:event.target.value})} /></label>
            <label>Correo electrónico<input type="email" autoComplete="email" maxLength={254} value={fields.email} onChange={event => setFields({...fields,email:event.target.value})} /></label>
          </div>
          <small>Completa al menos uno de los dos canales de contacto.</small>
          <label>Ciudad o zona de entrega<input autoComplete="address-level2" maxLength={120} value={fields.city} onChange={event => setFields({...fields,city:event.target.value})} /></label>
          <label>¿Qué debemos tener en cuenta?<textarea rows={3} maxLength={2000} placeholder="Cuéntanos sobre el espacio, el acceso o tu fecha deseada." value={fields.message} onChange={event => setFields({...fields,message:event.target.value})} /></label>
          <label className="quote-request-consent"><input type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)} /><span>Autorizo al taller a usar estos datos para responder y dar seguimiento a esta cotización.</span></label>
          {error && <p className="quote-request-error" role="alert">{error}</p>}
          <button className="button quote-request-submit" disabled={busy || !canSubmit || !consent} aria-busy={busy}>
            {busy ? <><Loader2 size={17} className="animate-spin" aria-hidden="true" /> Registrando…</> : <>Registrar mi solicitud <ArrowUpRight size={18} aria-hidden="true" /></>}
          </button>
          <p className="quote-request-note">Revisaremos disponibilidad, entrega e instalación antes de confirmar las condiciones finales. No se envían mensajes automáticos desde este formulario.</p>
        </fieldset>
      </form>}
      {!canSubmit && <p className="quote-request-error">{sources.length > 20 ? "Esta solicitud admite hasta 20 diseños. Divide tu selección en grupos para que podamos revisarlos." : "Guarda una versión del diseño para adjuntarla a tu solicitud."}</p>}
    </>}
  </section>;
}
