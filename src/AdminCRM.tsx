import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, CalendarClock, Clock3, FileText, Inbox, Loader2, LockKeyhole, Mail, Phone, RefreshCw, Save, Search, UserRound, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { api, ApiError } from "../lib/api";
import { money } from "../lib/format-price";
import { quoteRequestStatuses, quoteRequestStatusLabels, quoteActionLabels, quoteActionTypes, type QuoteActionType, type QuoteRequestEvent, type AdminQuoteRequest, type AdminQuoteRequestSummary, type QuoteRequestMetrics, type QuoteRequestSnapshotItem, type QuoteRequestStatus } from "../lib/crm";
import { AdminCommercialQuote } from "./AdminCommercialQuote";
import { CrmOperations } from "./CrmOperations";
import "./admin-crm.css";

type Draft = { status: QuoteRequestStatus; assignee: string; followUp: string; nextAction: QuoteActionType | ""; notes: string; lostReason: string };
type ListResponse = { quoteRequests: AdminQuoteRequestSummary[]; metrics: QuoteRequestMetrics; nextCursor: string | null; matchingCount: number };
async function fetchList(parameters: URLSearchParams, signal: AbortSignal): Promise<ListResponse> {
  const response = await fetch(`/api/store?${parameters}`, { cache: "no-store", signal });
  let data: ListResponse & { error?: string };
  try { data = await response.json(); }
  catch { throw new ApiError("No se pudo conectar al servidor. Inténtalo otra vez.", response.status); }
  if (!response.ok) throw new ApiError(data.error || "No pudimos consultar las solicitudes.", response.status);
  return data;
}
const dateFormatter = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" });
const readableDate = (value: string | null | undefined) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? dateFormatter.format(date) : "Sin programar";
};
const localDateInput = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const draftFor = (request: AdminQuoteRequest): Draft => ({ status: request.status, assignee: request.assignee,
  followUp: localDateInput(request.nextFollowUpAt), nextAction: request.nextAction ?? "", notes: request.notes, lostReason: request.lostReason });
const forbidden = (cause: unknown) => cause instanceof ApiError && (cause.status === 401 || cause.status === 403);
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "No pudimos completar la operación.";
const isOverdue = (request: Pick<AdminQuoteRequestSummary, "nextFollowUpAt" | "status">) =>
  !!request.nextFollowUpAt && !["accepted", "lost"].includes(request.status) && new Date(request.nextFollowUpAt).getTime() < Date.now();
function Price({ value }: { value: number | null | undefined }) {
  return <>{value === null ? "Por cotizar" : typeof value === "number" && Number.isFinite(value) ? money(value) : "Importe no disponible"}</>;
}
function titleForEvent(event: QuoteRequestEvent) {
  if (event.type === "created") return "Solicitud recibida";
  if (event.type === "commercial_issued") return `Versión comercial ${event.commercialVersion} emitida`;
  if (event.type === "customer_accepted") return `Cliente aceptó la versión ${event.commercialVersion}`;
  if (event.type === "customer_changes_requested") return `Cliente solicitó cambios en la versión ${event.commercialVersion}`;
  if (event.type === "action_completed") return "Acción completada";
  return event.fromStatus !== event.toStatus ? `${event.fromStatus ? quoteRequestStatusLabels[event.fromStatus] : "Solicitud"} → ${quoteRequestStatusLabels[event.toStatus]} · gestión manual` : "Seguimiento actualizado";
}
function SnapshotItem({ item }: { item: QuoteRequestSnapshotItem }) {
  const sourceLink = item.source.kind === "kitchen" ? `/cocinas?cocina=${encodeURIComponent(item.source.id)}` : `/configurar?d=${encodeURIComponent(item.source.id)}`;
  const finishName = (materialId: string) => {
    const material = item.materials?.find((value) => value.id === materialId);
    return material ? [material.brand, material.name, material.code].filter(Boolean).join(" · ") : materialId;
  };
  return <article className="crm-snapshot-item">
    <div className="crm-snapshot-item-heading"><div><small>{item.source.kind === "kitchen" ? "Cocina guardada" : "Diseño guardado"} · versión {item.source.version}</small><h5>{item.name}</h5></div><a href={sourceLink} target="_blank" rel="noopener noreferrer" aria-label={`Abrir origen de ${item.name} en otra pestaña`}>Ver origen <ArrowUpRight size={15} aria-hidden="true" /></a></div>
    <div className="crm-snapshot-prices"><span>Cantidad <strong>{item.quantity}</strong></span><span>Por unidad <strong><Price value={item.unitPrice} /></strong></span><span>Importe guardado <strong><Price value={item.totalPrice} /></strong></span></div>
    {item.config && <dl className="crm-snapshot-dimensions"><div><dt>Ancho × alto × fondo</dt><dd>{item.config.width} × {item.config.height} × {item.config.depth} mm</dd></div><div><dt>Distribución</dt><dd>{item.config.modules} columnas · {item.config.shelves} repisas por columna de almacenaje</dd></div><div><dt>Puertas</dt><dd>{{ none: "Sin puertas", lower: "Inferiores", full: "Completas" }[item.config.doors]}</dd></div><div><dt>Acabados guardados</dt><dd>Exterior: {finishName(item.config.finish)} · Interior: {item.config.interior === "same" ? "Igual al exterior" : finishName(item.config.interior)}</dd></div></dl>}
    {item.plan && <dl className="crm-snapshot-dimensions"><div><dt>Composición</dt><dd>{item.plan.layout === "l" ? "En L" : "Lineal"} · {item.plan.items.length} elementos</dd></div><div><dt>Paredes</dt><dd>A: {item.plan.walls.a} mm{item.plan.layout === "l" ? ` · B: ${item.plan.walls.b} mm` : ""}</dd></div>{item.furniturePrice !== undefined && <div><dt>Muebles</dt><dd><Price value={item.furniturePrice} /></dd></div>}{item.servicesPrice !== undefined && <div><dt>Servicios guardados</dt><dd><Price value={item.servicesPrice} /></dd></div>}</dl>}
    {!!item.modules?.length && <details className="crm-snapshot-modules"><summary>Ver módulos y reservas ({item.modules.length})</summary><ul>{item.modules.map((module) => <li key={module.id}><span>{module.name}<small>Pared {module.wall.toUpperCase()} · {module.row === "wall" ? "Alacena" : module.row === "tall" ? "Columna" : "Fila inferior"}</small></span><strong>{module.kind === "furniture" ? <Price value={module.price} /> : "Reserva · equipo no incluido"}</strong></li>)}</ul></details>}
  </article>;
}

export function AdminCRM({ active = true }: { active?: boolean }) {
  const id = useId();
  const [requests, setRequests] = useState<AdminQuoteRequestSummary[]>([]);
  const [metrics, setMetrics] = useState<QuoteRequestMetrics>();
  const [detail, setDetail] = useState<AdminQuoteRequest>();
  const [draft, setDraft] = useState<Draft>();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState<"all" | QuoteRequestStatus>("all");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [matchingCount, setMatchingCount] = useState<number | null>(null);
  const [listFilterKey, setListFilterKey] = useState("");
  const [failedCursor, setFailedCursor] = useState<string>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [merged, setMerged] = useState(false);
  const [commercialDirty, setCommercialDirty] = useState(false);
  const [actionOutcome, setActionOutcome] = useState("");
  const actionOperation = useRef<{ signature: string; id: string } | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{ id: string | null }>();
  const listGeneration = useRef(0), detailGeneration = useRef(0);
  const listController = useRef<AbortController | undefined>(undefined);
  const listRef = useRef<AdminQuoteRequestSummary[]>([]);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const selectedTrigger = useRef<HTMLButtonElement>(null);
  const filterKey = JSON.stringify([status, debouncedQuery, onlyOverdue]);
  const currentFilterKey = useRef(filterKey);
  currentFilterKey.current = filterKey;
  const currentFilters = useRef({ active, status, query: debouncedQuery, inputQuery: query.trim(), onlyOverdue, key: filterKey });
  currentFilters.current = { active, status, query: debouncedQuery, inputQuery: query.trim(), onlyOverdue, key: filterKey };
  listRef.current = requests;
  const queryPending = query.trim() !== debouncedQuery;
  const changingFilters = queryPending || listFilterKey !== filterKey;
  const hasFilters = status !== "all" || !!debouncedQuery || onlyOverdue;
  const followUpDirty = !!detail && !!draft && JSON.stringify(draft) !== JSON.stringify(draftFor(detail));
  const actionDraftDirty = actionOutcome.trim().length > 0;
  const dirty = followUpDirty || commercialDirty || actionDraftDirty;
  const remoteChanged = !!detail && requests.some((request) => request.id === detail.id && request.version > detail.version);

  function requireLogin() {
    setCommercialDirty(false); setActionOutcome(""); actionOperation.current = null;
    setAuthRequired(true); setRequests([]); setMetrics(undefined); setDetail(undefined); setDraft(undefined);
    setNextCursor(null); setMatchingCount(null); setFailedCursor(undefined);
    setListError(""); setDetailError(""); setNotice(""); setConflict(false); setMerged(false);
    listGeneration.current++; detailGeneration.current++;
    listController.current?.abort(); setLoading(false); setLoadingMore(false); setDetailLoading(false);
  }
  async function loadList(cursor?: string) {
    const filters = currentFilters.current;
    if (!filters.active || filters.query !== filters.inputQuery) return;
    listController.current?.abort();
    const controller = new AbortController();
    listController.current = controller;
    const generation = ++listGeneration.current;
    const requestedFilterKey = filters.key;
    const previous = cursor ? listRef.current : [];
    const parameters = new URLSearchParams({ action: "quote-requests", limit: "50" });
    if (filters.status !== "all") parameters.set("status", filters.status);
    if (filters.query) parameters.set("q", filters.query);
    if (filters.onlyOverdue) parameters.set("overdue", "true");
    if (cursor) parameters.set("cursor", cursor);
    setLoading(!cursor); setLoadingMore(!!cursor); setListError(""); setFailedCursor(undefined);
    if (!cursor) { setRequests([]); setNextCursor(null); setMatchingCount(null); setListFilterKey(requestedFilterKey); }
    try {
      const result = await fetchList(parameters, controller.signal);
      if (controller.signal.aborted || generation !== listGeneration.current || requestedFilterKey !== currentFilterKey.current || filters.query !== currentFilters.current.inputQuery) return;
      const byId = new Map(previous.map((request) => [request.id, request]));
      for (const request of result.quoteRequests) {
        const existing = byId.get(request.id);
        if (!existing || request.version >= existing.version) byId.set(request.id, request);
      }
      setRequests([...byId.values()]); setMetrics(result.metrics); setNextCursor(result.nextCursor);
      setMatchingCount(result.matchingCount); setListFilterKey(requestedFilterKey); setAuthRequired(false);
      if (cursor) {
        const firstNew = result.quoteRequests.find((request) => !previous.some((existing) => existing.id === request.id));
        if (firstNew) requestAnimationFrame(() => {
          if (controller.signal.aborted || generation !== listGeneration.current || requestedFilterKey !== currentFilterKey.current || filters.query !== currentFilters.current.inputQuery) return;
          const target = document.getElementById(`${id}-request-${firstNew.id}`);
          target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "nearest" });
        });
      }
    } catch (cause) {
      if (controller.signal.aborted || generation !== listGeneration.current || requestedFilterKey !== currentFilterKey.current || filters.query !== currentFilters.current.inputQuery) return;
      if (forbidden(cause)) requireLogin(); else { setListError(errorText(cause)); setFailedCursor(cursor); }
    } finally { if (generation === listGeneration.current) { setLoading(false); setLoadingMore(false); } }
  }
  async function loadDetail(requestId: string, keepDraft = false, resetFollowUp = false) {
    const generation = ++detailGeneration.current;
    setDetailLoading(true); setDetailError(""); setNotice("");
    if (!keepDraft) { setDetail(undefined); setDraft(undefined); setConflict(false); setMerged(false); setCommercialDirty(false); setActionOutcome(""); actionOperation.current = null; }
    try {
      const { quoteRequest } = await api<{ quoteRequest: AdminQuoteRequest }>(`action=quote-request&id=${encodeURIComponent(requestId)}`);
      if (generation !== detailGeneration.current) return;
      setDetail(quoteRequest);
      if (!keepDraft || resetFollowUp) { setDraft(draftFor(quoteRequest)); setMerged(false); }
      else { setMerged(true); setNotice("Versión actual cargada. Tu borrador se conserva; compara los valores antes de guardarlo."); }
      setConflict(false); setAuthRequired(false);
      requestAnimationFrame(() => {
        detailHeading.current?.focus({ preventScroll: true });
        detailHeading.current?.scrollIntoView({ block: "nearest" });
      });
    } catch (cause) {
      if (generation !== detailGeneration.current) return;
      if (forbidden(cause)) requireLogin(); else setDetailError(errorText(cause));
    } finally { if (generation === detailGeneration.current) setDetailLoading(false); }
  }
  function selectRequest(requestId: string | null) {
    if (saving || detailLoading) return;
    if (requestId === detail?.id) { detailHeading.current?.focus(); return; }
    if (dirty) { setPendingSelection({ id: requestId }); return; }
    if (requestId) void loadDetail(requestId);
    else { detailGeneration.current++; setDetail(undefined); setDraft(undefined); setDetailError(""); setNotice(""); setCommercialDirty(false); setActionOutcome(""); requestAnimationFrame(() => selectedTrigger.current?.focus()); }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (active && !queryPending) void loadList();
    else { listGeneration.current++; listController.current?.abort(); setLoading(false); setLoadingMore(false); }
    return () => { listGeneration.current++; listController.current?.abort(); };
  }, [active, filterKey, queryPending]);
  useEffect(() => () => { listGeneration.current++; detailGeneration.current++; listController.current?.abort(); }, []);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  const firstContact = detail?.events.filter((event) => event.toStatus === "contacted" && event.fromStatus !== "contacted")
    .sort((left, right) => left.created.localeCompare(right.created))[0];
  const contactMinutes = detail && firstContact ? Math.round((new Date(firstContact.created).getTime() - new Date(detail.created).getTime()) / 60000) : null;
  const responseMinutes = contactMinutes !== null && Number.isFinite(contactMinutes) && contactMinutes >= 0 ? contactMinutes : null;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!detail || !draft || saving || !followUpDirty || commercialDirty) return;
    const followUp = draft.followUp ? new Date(draft.followUp) : null;
    if (followUp && !Number.isFinite(followUp.getTime())) { setDetailError("Revisa la fecha del próximo seguimiento."); return; }
    if (draft.status === "lost" && !draft.lostReason.trim()) { setDetailError("Indica el motivo de pérdida antes de guardar."); return; }
    const generation = detailGeneration.current;
    setSaving(true); setDetailError(""); setNotice("");
    try {
      const { quoteRequest } = await api<{ quoteRequest: AdminQuoteRequest }>("", { op: "update-quote-request", id: detail.id, version: detail.version,
        status: draft.status, assignee: draft.assignee, nextFollowUpAt: followUp?.toISOString() ?? null, nextAction: draft.nextAction || null, notes: draft.notes, lostReason: draft.lostReason });
      if (generation !== detailGeneration.current) return;
      setDetail(quoteRequest); setDraft(draftFor(quoteRequest)); setConflict(false); setMerged(false);
      setRequests((previous) => previous.map((request) => request.id === quoteRequest.id ? quoteRequest : request));
      setNotice("Seguimiento guardado. La composición y los importes de la solicitud se conservan.");
      void loadList();
    } catch (cause) {
      if (generation !== detailGeneration.current) return;
      if (forbidden(cause)) requireLogin();
      else if (cause instanceof ApiError && cause.status === 409) { setConflict(true); setDetailError("Otra sesión actualizó esta solicitud. Tu borrador sigue aquí; carga la versión actual para comparar."); }
      else setDetailError(errorText(cause));
    } finally { setSaving(false); }
  }
  async function completeAction() {
    if (!detail || followUpDirty || commercialDirty || saving || actionOutcome.trim().length < 3) return;
    const intent = { op: "complete-quote-action", id: detail.id, version: detail.version, outcome: actionOutcome.trim() };
    const signature = JSON.stringify(intent); if (actionOperation.current?.signature !== signature) actionOperation.current = { signature, id: crypto.randomUUID() };
    const generation = detailGeneration.current; setSaving(true); setDetailError("");
    try {
      const { quoteRequest } = await api<{ quoteRequest: AdminQuoteRequest }>("", { ...intent, requestId: actionOperation.current.id });
      if (generation !== detailGeneration.current) return;
      setDetail(quoteRequest); setDraft(draftFor(quoteRequest)); setActionOutcome(""); setNotice("Acción completada y resultado guardado en el historial."); void loadList();
    } catch (cause) { if (generation !== detailGeneration.current) return; if (forbidden(cause)) requireLogin(); else { setDetailError(errorText(cause)); if (cause instanceof ApiError && cause.status === 409) setConflict(true); } }
    finally { setSaving(false); }
  }
  if (authRequired) return <section className="admin-crm crm-locked" aria-labelledby={`${id}-locked`}><LockKeyhole size={30} strokeWidth={1.4} aria-hidden="true" /><h2 id={`${id}-locked`}>Vuelve a verificar tu acceso.</h2><p>La sesión administrativa terminó o no tiene permiso para consultar solicitudes. Los datos de contacto se han retirado de esta vista.</p><a className="crm-primary" href="/admin">Entrar con contraseña y segundo factor <ArrowUpRight size={16} aria-hidden="true" /></a></section>;
  return <section className="admin-crm" aria-labelledby={`${id}-heading`}>
    <div className="crm-heading"><div><p className="crm-eyebrow">AlRazz / Seguimiento del taller</p><h2 id={`${id}-heading`}>Cada proyecto, en su momento.</h2><p>Solicitudes guardadas, próximos pasos y una conversación con contexto.</p></div><button className="crm-secondary" type="button" onClick={() => void loadList()} disabled={loading || loadingMore || queryPending}><RefreshCw size={16} aria-hidden="true" />{loading ? "Actualizando…" : "Actualizar lista"}</button></div>
    <div className="crm-metrics" aria-label="Indicadores de solicitudes"><article><span>Recibidas</span><strong>{metrics?.total ?? "—"}</strong><small>Solicitudes registradas</small></article><article><span>Cotizadas</span><strong>{metrics?.quoted ?? "—"}</strong><small>Actualmente en estado Cotizada</small></article><article><span>Aceptadas</span><strong>{metrics?.accepted ?? "—"}</strong><small>Aceptación comercial; no acredita pago</small></article><article><span>Seguimientos vencidos</span><strong>{metrics?.overdue ?? "—"}</strong><small>Solicitudes abiertas con fecha pendiente</small></article></div>
    <CrmOperations active={active} revision={detail?.updated ?? "initial"} onSelect={requestId => selectRequest(requestId)} onUnauthorized={requireLogin} />
    <div className="crm-pipeline" role="group" aria-label="Filtrar solicitudes por etapa">{quoteRequestStatuses.map((value, index) => <button type="button" key={value} className={`crm-pipeline-stage stage-${value}${status === value ? " is-selected" : ""}`} aria-pressed={status === value} onClick={() => setStatus(status === value ? "all" : value)}><span><small>{String(index + 1).padStart(2, "0")}</small>{quoteRequestStatusLabels[value]}</span><strong>{metrics?.[value] ?? "—"}</strong></button>)}</div>
    <div className="crm-toolbar"><label className="crm-search"><Search size={18} aria-hidden="true" /><span className="crm-sr-only">Buscar por referencia, nombre, contacto, ciudad o responsable</span><input type="search" maxLength={120} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar una solicitud…" /></label><label className="crm-filter">Estado<select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">Todos los estados</option>{quoteRequestStatuses.map((value) => <option key={value} value={value}>{quoteRequestStatusLabels[value]}</option>)}</select></label><label className="crm-overdue-filter"><input type="checkbox" checked={onlyOverdue} onChange={(event) => setOnlyOverdue(event.target.checked)} />Solo seguimiento vencido</label></div>
    {listError && !changingFilters && <div className="crm-message is-error" role="alert">{listError}<button type="button" onClick={() => void loadList(failedCursor)}>Volver a cargar</button></div>}
    <div className={`crm-workspace${detail || detailLoading ? " has-detail" : ""}`}>
      <div className="crm-list-panel" aria-busy={loading || loadingMore || changingFilters}>
        <div className="crm-list-caption"><h3>Solicitudes</h3><span role="status">{changingFilters || loading ? "Consultando…" : `${requests.length} de ${matchingCount ?? 0}${loadingMore ? " · Cargando…" : ""}`}</span></div>
        {changingFilters || (loading && !requests.length) ? <p className="crm-empty"><Loader2 size={23} className="crm-spin" aria-hidden="true" />Cargando solicitudes privadas…</p> : requests.length ? <ul className="crm-request-list">{requests.map((request) => <li key={request.id}><button id={`${id}-request-${request.id}`} type="button" className={`crm-request${detail?.id === request.id ? " is-selected" : ""}`} aria-pressed={detail?.id === request.id} onClick={(event) => { selectedTrigger.current = event.currentTarget; selectRequest(request.id); }} disabled={saving || detailLoading}><span className="crm-request-top"><strong>{request.reference}</strong><span className={`crm-status stage-${request.status}`}>{quoteRequestStatusLabels[request.status]}</span></span><span className="crm-request-name">{request.contact.name}</span><span className="crm-request-meta">{request.contact.city || "Ciudad sin indicar"} · {request.sourceCount} {request.sourceCount === 1 ? "diseño" : "diseños"}</span><span className="crm-request-bottom"><span><Price value={request.totalPrice} /></span><time dateTime={request.created}>{readableDate(request.created)}</time></span>{request.nextFollowUpAt && <span className={`crm-request-followup${isOverdue(request) ? " is-overdue" : ""}`}><CalendarClock size={14} aria-hidden="true" />{readableDate(request.nextFollowUpAt)}{request.assignee ? ` · ${request.assignee}` : ""}</span>}</button></li>)}</ul> : <div className="crm-empty"><Inbox size={30} strokeWidth={1.3} aria-hidden="true" /><h4>{listError ? "No pudimos cargar la lista." : hasFilters ? "No hay solicitudes con estos filtros." : "Las próximas ideas empiezan aquí."}</h4><p>{listError ? "Vuelve a intentarlo para consultar las solicitudes del taller." : hasFilters ? "Prueba otra búsqueda o vuelve a ver todos los estados." : "Cuando un cliente envíe una solicitud desde un diseño guardado, aparecerá en esta lista."}</p>{hasFilters && <button className="crm-secondary" type="button" onClick={() => { setQuery(""); setStatus("all"); setOnlyOverdue(false); }}>Limpiar filtros</button>}</div>}
        {!changingFilters && nextCursor && <div className="crm-pagination"><p>Se muestran {requests.length} de {matchingCount ?? 0} solicitudes que coinciden con los filtros.</p><button className="crm-secondary" type="button" disabled={loading || loadingMore} onClick={() => void loadList(nextCursor)}>{loadingMore && <Loader2 size={16} className="crm-spin" aria-hidden="true" />}{loadingMore ? "Cargando más…" : "Cargar más solicitudes"}</button></div>}
      </div>
      <div className="crm-detail-panel" aria-busy={detailLoading}>
        {detailLoading && !detail ? <div className="crm-empty" role="status"><Loader2 size={26} className="crm-spin" aria-hidden="true" />Abriendo la ficha…</div> : detail && draft ? <>
          <div className="crm-detail-heading"><div><p className="crm-eyebrow">Ficha privada / versión de seguimiento {detail.version}</p><h3 ref={detailHeading} tabIndex={-1}>{detail.reference}</h3><p>Recibida el {readableDate(detail.created)}</p></div><button type="button" className="crm-icon-button" onClick={() => selectRequest(null)} disabled={saving || detailLoading} aria-label="Cerrar ficha de solicitud"><X size={19} aria-hidden="true" /></button></div>
          <section className="crm-contact" aria-labelledby={`${id}-contact`}><h4 id={`${id}-contact`}>La persona detrás del proyecto</h4><p className="crm-contact-name"><UserRound size={18} aria-hidden="true" />{detail.contact.name}</p><div className="crm-contact-links">{detail.contact.phone && <a href={`tel:${detail.contact.phone.replace(/[^+\d]/g, "")}`}><Phone size={16} aria-hidden="true" />{detail.contact.phone}</a>}{detail.contact.email && <a href={`mailto:${encodeURIComponent(detail.contact.email)}`}><Mail size={16} aria-hidden="true" />{detail.contact.email}</a>}</div>{detail.contact.city && <p>Ciudad: {detail.contact.city}</p>}{detail.contact.message && <blockquote>{detail.contact.message}</blockquote>}<small>Consentimiento registrado: {readableDate(detail.consentAt)}</small></section>
          <form className="crm-followup-form" onSubmit={save}><div className="crm-section-heading"><h4>El siguiente paso</h4><span className={dirty ? "crm-unsaved" : "crm-saved"}>{dirty ? "Cambios sin guardar" : "Seguimiento guardado"}</span></div>
            {(conflict || remoteChanged) && <div className="crm-conflict" role="alert"><strong>Hay una versión más reciente.</strong><p>Tu borrador permanece intacto. Carga el seguimiento actual, compáralo y decide qué guardar.</p><button className="crm-secondary" type="button" disabled={saving || detailLoading} onClick={() => void loadDetail(detail.id, true)}><RefreshCw size={15} aria-hidden="true" />Cargar versión actual sin perder mi borrador</button></div>}
            {merged && <details className="crm-current-values" open><summary>Valores de la versión actual · {detail.version}</summary><dl><div><dt>Estado</dt><dd>{quoteRequestStatusLabels[detail.status]}</dd></div><div><dt>Responsable</dt><dd>{detail.assignee || "Sin asignar"}</dd></div><div><dt>Próximo seguimiento</dt><dd>{readableDate(detail.nextFollowUpAt)}</dd></div><div><dt>Notas actuales</dt><dd>{detail.notes || "Sin notas"}</dd></div>{detail.lostReason && <div><dt>Motivo de pérdida actual</dt><dd>{detail.lostReason}</dd></div>}</dl><p>Los campos de abajo conservan tu borrador.</p></details>}
            <fieldset disabled={saving || detailLoading || commercialDirty || actionDraftDirty}><div className="crm-form-grid"><label>Estado<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as QuoteRequestStatus })}>{quoteRequestStatuses.map((value) => <option key={value} value={value}>{quoteRequestStatusLabels[value]}</option>)}</select></label><label>Responsable<input value={draft.assignee} maxLength={120} placeholder="Nombre del responsable" onChange={(event) => setDraft({ ...draft, assignee: event.target.value })} /></label><label className="crm-form-wide">Próximo seguimiento<input type="datetime-local" value={draft.followUp} onChange={(event) => setDraft({ ...draft, followUp: event.target.value })} /><small>Hora local de este navegador. Deja vacío para quitar la fecha.</small></label><label className="crm-form-wide">Notas de seguimiento<textarea rows={5} value={draft.notes} maxLength={8000} placeholder="Qué se conversó y qué falta revisar…" onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>{draft.status === "lost" && <label className="crm-form-wide">Motivo de pérdida<textarea rows={3} required value={draft.lostReason} maxLength={1000} placeholder="Registra el motivo sin borrar el historial." onChange={(event) => setDraft({ ...draft, lostReason: event.target.value })} /></label>}</div></fieldset>
            {draft.status === "accepted" && <p className="crm-commercial-note">Aceptada registra una aceptación comercial. No acredita un pago, una venta cobrada ni autorización de fabricación.</p>}
            {detailError && <p className="crm-message is-error" role="alert">{detailError}</p>}{notice && <p className="crm-message" role="status">{notice}</p>}
            <div className="crm-save-row"><span><Clock3 size={15} aria-hidden="true" />{responseMinutes !== null && Number.isFinite(responseMinutes) ? `${responseMinutes < 60 ? `${responseMinutes} min` : `${Math.round(responseMinutes / 60 * 10) / 10} h`} hasta el primer contacto registrado` : "Primer contacto aún no registrado"}</span><button className="crm-primary" type="submit" disabled={!followUpDirty || commercialDirty || saving || detailLoading || conflict || remoteChanged}>{saving ? <Loader2 size={17} className="crm-spin" aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}{saving ? "Guardando…" : "Guardar seguimiento"}</button></div>
          </form>
          <section className="crm-commercial"><h4>Próxima acción</h4><label>Tipo de gestión<select value={draft.nextAction} onChange={event => setDraft({ ...draft, nextAction: event.target.value as Draft["nextAction"] })} disabled={saving || detailLoading || commercialDirty || actionDraftDirty}><option value="">Sin tipo asignado</option>{quoteActionTypes.map(action => <option key={action} value={action}>{quoteActionLabels[action]}</option>)}</select></label><p>Guarda el tipo junto con responsable y fecha en el seguimiento.</p>{detail.nextFollowUpAt && !["accepted", "lost"].includes(detail.status) && <><p>Pendiente: {quoteActionLabels[detail.nextAction ?? "follow_up"]} · {readableDate(detail.nextFollowUpAt)}</p><label>Resultado de la gestión<textarea value={actionOutcome} onChange={event => setActionOutcome(event.target.value)} maxLength={2000} rows={3} disabled={saving || followUpDirty || commercialDirty} placeholder="Anota qué se hizo y cuál fue el resultado." /></label><button type="button" className="crm-secondary" disabled={saving || followUpDirty || commercialDirty || conflict || remoteChanged || actionOutcome.trim().length < 3} onClick={() => void completeAction()}>Marcar acción como completada</button></>}</section>
          <AdminCommercialQuote key={detail.id} request={detail} disabled={followUpDirty || actionDraftDirty || saving || detailLoading || conflict || remoteChanged} onChanged={() => { void loadDetail(detail.id); void loadList(); }} onRefresh={() => { void loadDetail(detail.id, true, true); void loadList(); }} onUnauthorized={requireLogin} onDirtyChange={setCommercialDirty} />
          <section className="crm-snapshot" aria-labelledby={`${id}-snapshot`}><div className="crm-section-heading"><h4 id={`${id}-snapshot`}>Lo que se solicitó</h4><FileText size={18} aria-hidden="true" /></div><p>Composición e importes conservados al recibir la solicitud. El seguimiento no los recalcula.</p><div className="crm-snapshot-total"><span>Total guardado · PEN</span><strong><Price value={detail.snapshot.totalPrice} /></strong></div><small>Snapshot del {readableDate(detail.snapshot.created)}. El enlace de origen consulta el diseño disponible; esta ficha conserva la versión indicada.</small>{detail.snapshot.items.map((item) => <SnapshotItem key={`${item.source.kind}:${item.source.id}`} item={item} />)}</section>
          <section className="crm-timeline" aria-labelledby={`${id}-timeline`}><div className="crm-section-heading"><h4 id={`${id}-timeline`}>Historia del seguimiento</h4><span>Solo lectura</span></div><ol>{[...detail.events].sort((left, right) => right.created.localeCompare(left.created)).map((event) => <li key={event.id}><span className="crm-timeline-dot" aria-hidden="true" /><div><strong>{titleForEvent(event)}</strong><p><time dateTime={event.created}>{readableDate(event.created)}</time> · versión {event.version}</p><details><summary>Ver lo registrado</summary><dl><div><dt>Responsable</dt><dd>{event.assignee || "Sin asignar"}</dd></div><div><dt>Próximo seguimiento</dt><dd>{readableDate(event.nextFollowUpAt)}</dd></div>{event.nextAction && <div><dt>Próxima acción</dt><dd>{quoteActionLabels[event.nextAction]}</dd></div>}{event.commercialVersion && <div><dt>Versión comercial</dt><dd>{event.commercialVersion}</dd></div>}{event.customerMessage && <div><dt>Cambios del cliente</dt><dd>{event.customerMessage}</dd></div>}{event.outcome && <div><dt>Resultado de la acción</dt><dd>{event.outcome}</dd></div>}{event.notes && <div><dt>Notas</dt><dd>{event.notes}</dd></div>}{event.lostReason && <div><dt>Motivo de pérdida</dt><dd>{event.lostReason}</dd></div>}</dl></details></div></li>)}</ol></section>
        </> : <div className="crm-empty crm-detail-empty"><FileText size={34} strokeWidth={1.2} aria-hidden="true" /><h3>Una ficha para cada proyecto.</h3><p>Elige una solicitud para consultar su diseño guardado y organizar el próximo contacto.</p>{detailError && <p className="crm-message is-error" role="alert">{detailError}</p>}</div>}
      </div>
    </div>
    <p className="crm-privacy-note"><LockKeyhole size={14} aria-hidden="true" />Datos privados del taller. No se registran pagos ni se envían mensajes automáticamente desde esta pantalla.</p>
    <AlertDialog open={!!pendingSelection} onOpenChange={(open) => { if (!open) setPendingSelection(undefined); }}><AlertDialogContent className="admin-dialog crm-discard-dialog"><AlertDialogHeader><AlertDialogTitle>Tu ficha tiene cambios pendientes.</AlertDialogTitle><AlertDialogDescription>Puedes seguir editando o descartar los borradores de seguimiento, acción y cotización antes de abrir otra ficha. Las versiones guardadas se conservan.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Seguir editando</AlertDialogCancel><AlertDialogAction onClick={() => { const destination = pendingSelection?.id; setPendingSelection(undefined); if (destination) void loadDetail(destination); else { setDetail(undefined); setDraft(undefined); setDetailError(""); setNotice(""); setCommercialDirty(false); setActionOutcome(""); } }}>Descartar borrador</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
export default AdminCRM;
