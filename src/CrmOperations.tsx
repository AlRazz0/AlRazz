import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { money } from "../lib/format-price";
import { quoteActionLabels, type CrmAgenda, type CrmPeriodMetrics } from "../lib/crm";
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
export function CrmOperations({ active, revision, onSelect, onUnauthorized }: { active: boolean; revision: string; onSelect: (id: string) => void; onUnauthorized: () => void }) {
  const [from, setFrom] = useState(() => day(-29)), [to, setTo] = useState(() => day(0));
  const [agendaFrom, setAgendaFrom] = useState(() => day(0)), [agendaTo, setAgendaTo] = useState(() => day(6));
  const [assignee, setAssignee] = useState(""), [includeOverdue, setIncludeOverdue] = useState(true);
  const [period, setPeriod] = useState<CrmPeriodMetrics>(), [agenda, setAgenda] = useState<CrmAgenda>();
  const [metricsError, setMetricsError] = useState(""), [agendaError, setAgendaError] = useState("");
  const [metricsBusy, setMetricsBusy] = useState(false), [agendaBusy, setAgendaBusy] = useState(false);
  const [appliedAgenda, setAppliedAgenda] = useState("");
  const metricSequence = useRef(0), agendaSequence = useRef(0);
  const agendaSignature = JSON.stringify([agendaFrom, agendaTo, assignee.trim(), includeOverdue]);
  function failure(cause: unknown, target: (value: string) => void) { if (cause instanceof ApiError && [401, 403].includes(cause.status)) onUnauthorized(); else target(cause instanceof Error ? cause.message : "No pudimos consultar los registros."); }
  async function loadMetrics() {
    const current = ++metricSequence.current; setMetricsBusy(true); setMetricsError("");
    try { const result = await api<CrmPeriodMetrics>("action=crm-metrics&" + new URLSearchParams({ from, to })); if (current === metricSequence.current) setPeriod(result); }
    catch (cause) { if (current === metricSequence.current) failure(cause, setMetricsError); }
    finally { if (current === metricSequence.current) setMetricsBusy(false); }
  }
  async function loadAgenda(cursor?: string | null) {
    const current = ++agendaSequence.current, signature = agendaSignature; setAgendaBusy(true); setAgendaError("");
    try {
      const result = await api<CrmAgenda>("action=crm-agenda&" + new URLSearchParams({ from: agendaFrom, to: agendaTo, assignee: assignee.trim(), includeOverdue: String(includeOverdue), ...(cursor ? { cursor } : {}) }));
      if (current !== agendaSequence.current) return;
      setAgenda(previous => cursor && previous ? { ...result, items: [...previous.items, ...result.items.filter(item => !previous.items.some(old => old.id === item.id))] } : result); setAppliedAgenda(signature);
    } catch (cause) { if (current === agendaSequence.current) failure(cause, setAgendaError); }
    finally { if (current === agendaSequence.current) setAgendaBusy(false); }
  }
  useEffect(() => { if (active) { void loadMetrics(); void loadAgenda(); } return () => { metricSequence.current++; agendaSequence.current++; }; }, [active, revision]);
  function metricSubmit(event: FormEvent) { event.preventDefault(); void loadMetrics(); }
  function agendaSubmit(event: FormEvent) { event.preventDefault(); void loadAgenda(); }
  return <section className="crm-operations"><details><summary>Agenda de próximas acciones</summary><form className="commercial-filter-row" onSubmit={agendaSubmit}><label>Desde<input type="date" required value={agendaFrom} onChange={event => setAgendaFrom(event.target.value)} /></label><label>Hasta<input type="date" required value={agendaTo} onChange={event => setAgendaTo(event.target.value)} /></label><label>Responsable exacto<input value={assignee} maxLength={120} onChange={event => setAssignee(event.target.value)} placeholder="Todos" /></label><label className="commercial-consent"><input type="checkbox" checked={includeOverdue} onChange={event => setIncludeOverdue(event.target.checked)} /><span>Incluir pendientes anteriores</span></label><button type="submit" className="crm-secondary" disabled={agendaBusy}>{agendaBusy ? "Consultando…" : "Consultar agenda"}</button></form>{agendaError && <p role="alert" className="crm-message is-error">{agendaError}</p>}{agenda && <><p>Fechas de agenda: {agenda.from} a {agenda.to} (UTC). {agenda.matchingCount} acciones pendientes; las solicitudes cerradas no aparecen.</p><ul className="commercial-agenda">{agenda.items.map(item => <li key={item.id}><div><strong>{quoteActionLabels[item.nextAction]}</strong><p>{item.reference} · {item.name} · {item.assignee || "Sin asignar"}</p><time dateTime={item.nextFollowUpAt}>{new Date(item.nextFollowUpAt).toLocaleString("es-PE")}{item.overdue ? " · Vencida" : ""}</time></div><button type="button" className="crm-secondary" onClick={() => onSelect(item.id)}>Abrir ficha</button></li>)}</ul>{!agenda.items.length && <p>No hay acciones pendientes con estos filtros.</p>}{agenda.nextCursor && <button className="crm-secondary" type="button" disabled={agendaBusy || appliedAgenda !== agendaSignature} onClick={() => void loadAgenda(agenda.nextCursor)}>Cargar más acciones</button>}</>}</details>
    <details><summary>Métricas por período</summary><form className="commercial-filter-row" onSubmit={metricSubmit}><label>Desde<input type="date" required value={from} onChange={event => setFrom(event.target.value)} /></label><label>Hasta<input type="date" required value={to} onChange={event => setTo(event.target.value)} /></label><button className="crm-secondary" type="submit" disabled={metricsBusy}>{metricsBusy ? "Consultando…" : "Consultar período"}</button></form>{metricsError && <p role="alert" className="crm-message is-error">{metricsError}</p>}{period && <><p>Del {period.period.from} al {period.period.to}, inclusive · UTC. Los conteos se basan en registros y eventos, no en el estado actual del embudo.</p><div className="commercial-period-metrics">{[
      ["Solicitudes recibidas", period.metrics.requestsReceived], ["Solicitudes contactadas", period.metrics.contactedRequests], ["Versiones comerciales emitidas", period.metrics.quoteVersionsIssued], ["Solicitudes con emisión", period.metrics.quotedRequests], ["Aceptaciones explícitas del cliente", period.metrics.customerAcceptances], ["Cambios pedidos por el cliente", period.metrics.changeRequests], ["Acciones completadas", period.metrics.actionsCompleted], ["Aceptaciones manuales", period.metrics.manualAcceptances],
    ].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div><p><strong>Conversión de la cohorte: {period.metrics.cohortConversionRate === null ? "Sin solicitudes" : `${Math.round(period.metrics.cohortConversionRate * 1000) / 10}%`}</strong> · {period.metrics.cohortAccepted} solicitudes recibidas en este período tuvieron aceptación explícita del cliente antes del cierre del período.</p><p>Importe aceptado por clientes en el período: <strong>{money(period.metrics.commercialAcceptedAmount)}</strong>. Es aceptación comercial, no dinero cobrado. Las aceptaciones manuales se muestran aparte y no cuentan como aceptación del cliente ni como pago.</p></>}</details>
  </section>;
}
