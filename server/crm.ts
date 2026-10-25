import { createHmac } from "node:crypto";
import { z } from "zod";
import { sha256 } from "../lib/admin-crypto.ts";
import { configSchema, productSchema, publicMaterials, type Config, type Product, type Result, type Settings } from "../lib/furniture.ts";
import { kitchenPlanSchema, publicKitchenQuote, type KitchenSnapshot } from "../lib/kitchen.ts";
import { publicPrice } from "../lib/public-product.ts";
import { publicGeometry } from "../lib/public-geometry.ts";
import {
  createQuoteRequestSchema, updateQuoteRequestSchema, completeQuoteActionSchema, quoteRequestStatuses, quoteActionTypes,
  type AdminQuoteRequest, type AdminQuoteRequestSummary, type QuoteRequestContact,
  type QuoteRequestEvent, type QuoteRequestMetrics, type QuoteRequestReceipt,
  type QuoteRequestSnapshot, type QuoteRequestSnapshotItem, type QuoteRequestSource, type QuoteRequestStatus,
} from "../lib/crm.ts";
import { requireAdmin, type AdminAuthEnv } from "./admin-auth.ts";

export class CrmError extends Error {
  constructor(public status: number, message: string, public code: string) { super(message); }
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SOURCE_ERROR = "Un diseño cambió o ya no está disponible. Actualiza tu selección.";
const OWNER_MAX = 5, IP_MAX = 20;
type Row = {
  id: string; reference: string; owner_hash: string; request_id: string; payload_hash: string;
  contact: string; snapshot: string; consent_at: string; status: QuoteRequestStatus; assignee: string;
  next_follow_up_at: string | null; notes: string; lost_reason: string; version: number;
  next_action: QuoteRequestEvent["nextAction"];
  created_at: string; updated_at: string;
};
type SavedRow = { id: string; name: string; quantity?: number; snapshot: string; version: number };
type SummaryRow = Pick<Row, "id" | "reference" | "status" | "created_at" | "updated_at" | "version" | "contact" | "assignee" | "next_follow_up_at" | "next_action" | "notes" | "lost_reason"> & { source_count: number; total_price: number | null };
type ProductRow = { id: string; data: string; version: number; active: number };
type Guard = { kind: "design" | "kitchen" | "product"; id: string; version: number; quantity?: number };
const cursorDate = z.string().datetime().refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
const cursorSchema = z.object({
  v: z.literal(1), updated: cursorDate, id: z.string().regex(uuid),
  filterHash: z.string().regex(/^[a-f0-9]{64}$/), asOf: cursorDate,
}).strict();
function listSelection(request: Request) {
  const params = new URL(request.url).searchParams;
  for (const key of ["status", "q", "overdue", "limit", "cursor"])
    if (params.getAll(key).length > 1) throw new CrmError(400, "No repitas los filtros de la lista.", "INVALID_FILTERS");
  const result = z.object({
    status: z.enum(quoteRequestStatuses).optional(), q: z.string().trim().max(120),
    overdue: z.enum(["true", "false"]), limit: z.string().regex(/^\d{1,3}$/).transform(Number).pipe(z.number().int().min(1).max(100)),
  }).safeParse({ status: params.get("status") ?? undefined, q: params.get("q") ?? "", overdue: params.get("overdue") ?? "false", limit: params.get("limit") ?? "50" });
  if (!result.success) throw new CrmError(400, "Revisa los filtros de solicitudes.", "INVALID_FILTERS");
  const selection = result.data;
  const filterHash = sha256(JSON.stringify({ status: selection.status ?? null, q: selection.q, overdue: selection.overdue === "true" }));
  let cursor: z.infer<typeof cursorSchema> | null = null;
  const encoded = params.get("cursor");
  if (encoded !== null) {
    try {
      if (encoded.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error("Invalid encoding");
      const decoded = Buffer.from(encoded, "base64url");
      if (decoded.toString("base64url") !== encoded) throw new Error("Noncanonical encoding");
      cursor = cursorSchema.parse(JSON.parse(decoded.toString("utf8")));
      if (cursor.filterHash !== filterHash) throw new Error("Different filters");
    } catch { throw new CrmError(400, "La página de resultados ya no coincide con los filtros. Vuelve al inicio de la lista.", "INVALID_CURSOR"); }
  }
  return { ...selection, filterHash, cursor, asOf: cursor?.asOf ?? new Date().toISOString() };
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
  } });
}
function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw new CrmError(400, result.error.issues[0]?.message || "Revisa los datos de la solicitud.", "INVALID_REQUEST");
  return result.data;
}
function ownerHash(request: Request): string {
  const owner = (request.headers.get("cookie") || "").split(";").map(value => value.trim())
    .find(value => value.startsWith("alrazz_design_owner="))?.slice("alrazz_design_owner=".length);
  if (!owner || !uuid.test(owner)) throw new CrmError(403, "Guarda tus diseños en este navegador antes de solicitar una cotización.", "OWNER_REQUIRED");
  return sha256(owner);
}
function receipt(row: Pick<Row, "id" | "reference" | "status" | "created_at">): QuoteRequestReceipt {
  return { id: row.id, reference: row.reference, status: row.status, created: row.created_at };
}
function summary(row: Row | SummaryRow): AdminQuoteRequestSummary {
  const snapshot = "snapshot" in row ? JSON.parse(row.snapshot) as QuoteRequestSnapshot : null;
  return { ...receipt(row), updated: row.updated_at, version: row.version,
    contact: JSON.parse(row.contact) as QuoteRequestContact, assignee: row.assignee,
    nextFollowUpAt: row.next_follow_up_at, notes: row.notes, lostReason: row.lost_reason,
    nextAction: row.next_action ?? null,
    sourceCount: snapshot ? snapshot.items.length : (row as SummaryRow).source_count, totalPrice: snapshot ? snapshot.totalPrice : (row as SummaryRow).total_price };
}
function amount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Invalid historical amount");
  return value;
}
function total(items: QuoteRequestSnapshotItem[]): number | null {
  if (items.some(item => item.totalPrice === null)) return null;
  return amount(Math.round(items.reduce((sum, item) => sum + item.totalPrice!, 0) * 100) / 100);
}

async function commercialSnapshot(env: AdminAuthEnv, hash: string, sources: QuoteRequestSource[], created: string) {
  const guards: Guard[] = [], items: QuoteRequestSnapshotItem[] = [];
  const productRows = (await env.DB.prepare("SELECT id,data,version,active FROM products").all<ProductRow>()).results;
  const rowsById = new Map(productRows.map(row => [row.id, row]));
  const products = new Map<string, Product>();
  const currentProduct = (id: string) => {
    const row = rowsById.get(id);
    if (!row || row.active !== 1) throw new CrmError(409, SOURCE_ERROR, "SOURCE_CHANGED");
    let product = products.get(id);
    if (!product) {
      product = productSchema.parse(JSON.parse(row.data));
      if (!product.active) throw new CrmError(409, SOURCE_ERROR, "SOURCE_CHANGED");
      products.set(id, product);
      guards.push({ kind: "product", id, version: row.version });
    }
    return product;
  };
  for (const source of sources) {
    // Table names are selected only from this closed enum; all visitor data is bound.
    const table = source.kind === "design" ? "designs" : "kitchens";
    const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id=? AND owner_hash=? AND deleted_at IS NULL AND version=?`)
      .bind(source.id, hash, source.version).first<SavedRow>();
    if (!row) throw new CrmError(409, SOURCE_ERROR, "SOURCE_CHANGED");
    guards.push({ kind: source.kind, id: source.id, version: source.version, ...(source.kind === "design" ? { quantity: row.quantity } : {}) });
    try {
      if (source.kind === "design") {
        const saved = JSON.parse(row.snapshot) as { product: Product; config: Config; result: Result; settings: Settings };
        const current = currentProduct(saved.product.id);
        const config = configSchema.parse(saved.config);
        const quantity = row.quantity!;
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error("Invalid saved quantity");
        const price = publicPrice(saved.product, amount(saved.result.price), current);
        const materialIds = new Set(saved.result.panels.map(panel => panel.material));
        const materials = publicMaterials(saved.settings).filter(material => materialIds.has(material.id));
        items.push({ source, name: row.name, quantity, product: { id: saved.product.id, name: saved.product.name }, config,
          materials, preview: { geometry: publicGeometry(saved.result.panels, saved.result.fixtures), materials, handle: config.handle },
          unitPrice: price, totalPrice: price === null ? null : amount(Math.round(price * quantity * 100) / 100) });
      } else {
        const saved = JSON.parse(row.snapshot) as KitchenSnapshot;
        const current = saved.modules.map(module => currentProduct(module.product.id));
        const plan = kitchenPlanSchema.parse(saved.plan);
        const quote = publicKitchenQuote(saved, current);
        const materialIds = new Set(quote.geometry.map(panel => panel.material));
        for (const value of [saved.result.price, saved.result.furniturePrice, saved.result.servicesPrice]) amount(value);
        const materials = quote.materials.filter(material => materialIds.has(material.id));
        items.push({ source, name: row.name, quantity: 1, plan, materials, preview: { geometry: quote.geometry, materials, handle: "push" },
          unitPrice: quote.price, totalPrice: quote.price, furniturePrice: quote.furniturePrice, servicesPrice: quote.servicesPrice,
          modules: quote.modules.map(module => ({ id: module.id, name: module.name, kind: module.kind, row: module.row, wall: module.wall, price: module.price })) });
      }
    } catch (error) {
      if (error instanceof CrmError) throw error;
      throw new CrmError(409, SOURCE_ERROR, "SOURCE_CHANGED");
    }
  }
  return { snapshot: { currency: "PEN", created, items, totalPrice: total(items) } satisfies QuoteRequestSnapshot, guards };
}

async function previous(env: AdminAuthEnv, hash: string, requestId: string, payloadHash: string) {
  const row = await env.DB.prepare("SELECT * FROM quote_requests WHERE owner_hash=? AND request_id=?").bind(hash, requestId).first<Row>();
  if (row && row.payload_hash !== payloadHash) throw new CrmError(409, "Esta solicitud ya se envió con otros datos. Inicia una solicitud nueva.", "IDEMPOTENCY_CONFLICT");
  return row;
}

export async function createQuoteRequest(request: Request, env: AdminAuthEnv, data: unknown): Promise<Response> {
  const input = parse(createQuoteRequestSchema, data);
  const hash = ownerHash(request), payloadHash = sha256(JSON.stringify(input));
  const existing = await previous(env, hash, input.requestId, payloadHash);
  // A lost response can be retried even after source edits or quota exhaustion.
  if (existing) return json({ quoteRequest: receipt(existing) });
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new CrmError(503, "Las solicitudes de cotización aún no están configuradas.", "CRM_NOT_CONFIGURED");
  const ipHash = createHmac("sha256", env.SESSION_SECRET).update("crm-ip:" + (request.headers.get("CF-Connecting-IP") || "unknown")).digest("hex");
  const created = new Date().toISOString(), since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { snapshot, guards } = await commercialSnapshot(env, hash, input.sources, created);
  const id = crypto.randomUUID(), reference = "AR-" + id.replaceAll("-", "").slice(0, 16).toUpperCase();
  const contact: QuoteRequestContact = { name: input.name, phone: input.phone, email: input.email, city: input.city, message: input.message };
  const event: QuoteRequestEvent = { id: crypto.randomUUID(), created, type: "created", fromStatus: null, toStatus: "received", version: 1, assignee: "", nextFollowUpAt: null, notes: "", lostReason: "" };
  // One serialized D1 transaction claims idempotency, applies quotas and verifies
  // source/catalog versions. A concurrent retry cannot consume another quota.
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO quote_requests(id,reference,owner_hash,request_id,payload_hash,ip_hash,contact,snapshot,consent_at,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE
      (SELECT count(*) FROM quote_requests WHERE owner_hash=? AND created_at>?)<? AND
      (SELECT count(*) FROM quote_requests WHERE ip_hash=? AND created_at>?)<? AND
      NOT EXISTS(SELECT 1 FROM json_each(?) guard WHERE
        (json_extract(guard.value,'$.kind')='design' AND NOT EXISTS(SELECT 1 FROM designs d WHERE d.id=json_extract(guard.value,'$.id') AND d.owner_hash=? AND d.version=json_extract(guard.value,'$.version') AND d.quantity=json_extract(guard.value,'$.quantity') AND d.deleted_at IS NULL)) OR
        (json_extract(guard.value,'$.kind')='kitchen' AND NOT EXISTS(SELECT 1 FROM kitchens k WHERE k.id=json_extract(guard.value,'$.id') AND k.owner_hash=? AND k.version=json_extract(guard.value,'$.version') AND k.deleted_at IS NULL)) OR
        (json_extract(guard.value,'$.kind')='product' AND NOT EXISTS(SELECT 1 FROM products p WHERE p.id=json_extract(guard.value,'$.id') AND p.version=json_extract(guard.value,'$.version') AND p.active=1)))
      ON CONFLICT(owner_hash,request_id) DO NOTHING`)
      .bind(id, reference, hash, input.requestId, payloadHash, ipHash, JSON.stringify(contact), JSON.stringify(snapshot), created, created, created,
        hash, since, OWNER_MAX, ipHash, since, IP_MAX, JSON.stringify(guards), hash, hash),
    env.DB.prepare("INSERT INTO quote_request_events(id,request_id,version,created_at,data) SELECT ?,?,1,?,? WHERE EXISTS(SELECT 1 FROM quote_requests WHERE id=?)")
      .bind(event.id, id, created, JSON.stringify(event), id),
  ]);
  const stored = await previous(env, hash, input.requestId, payloadHash);
  if (stored) return json({ quoteRequest: receipt(stored) }, results[0].meta.changes ? 201 : 200);
  const counts = await env.DB.prepare("SELECT (SELECT count(*) FROM quote_requests WHERE owner_hash=? AND created_at>?) AS owner_count,(SELECT count(*) FROM quote_requests WHERE ip_hash=? AND created_at>?) AS ip_count")
    .bind(hash, since, ipHash, since).first<{ owner_count: number; ip_count: number }>();
  if (counts && (counts.owner_count >= OWNER_MAX || counts.ip_count >= IP_MAX)) throw new CrmError(429, "Ya recibimos varias solicitudes. Espera una hora antes de enviar otra.", "RATE_LIMITED");
  throw new CrmError(409, SOURCE_ERROR, "SOURCE_CHANGED");
}

export async function listQuoteRequests(request: Request, env: AdminAuthEnv): Promise<Response> {
  await requireAdmin(request, env);
  const selection = listSelection(request), clauses: string[] = [], values: unknown[] = [];
  if (selection.status) { clauses.push("status=?"); values.push(selection.status); }
  if (selection.q) {
    const pattern = "%" + selection.q.replace(/[\\%_]/g, value => "\\" + value) + "%";
    const columns = ["reference", "json_extract(contact,'$.name')", "json_extract(contact,'$.phone')", "json_extract(contact,'$.email')", "json_extract(contact,'$.city')", "assignee"];
    clauses.push("(" + columns.map(column => `${column} LIKE ? ESCAPE '\\'`).join(" OR ") + ")");
    values.push(...columns.map(() => pattern));
  }
  if (selection.overdue === "true") {
    clauses.push("next_follow_up_at<? AND status NOT IN ('accepted','lost')"); values.push(selection.asOf);
  }
  const where = clauses.length ? clauses.join(" AND ") : "1=1";
  const matchingCount = (await env.DB.prepare(`SELECT count(*) AS n FROM quote_requests WHERE ${where}`).bind(...values).first<{ n: number }>())?.n || 0;
  const position = selection.cursor;
  const rows = (await env.DB.prepare(`SELECT id,reference,status,created_at,updated_at,version,contact,assignee,next_follow_up_at,next_action,notes,lost_reason,json_array_length(snapshot,'$.items') AS source_count,json_extract(snapshot,'$.totalPrice') AS total_price FROM quote_requests WHERE ${where}${position ? " AND (updated_at<? OR (updated_at=? AND id<?))" : ""} ORDER BY updated_at DESC,id DESC LIMIT ?`)
    .bind(...values, ...(position ? [position.updated, position.updated, position.id] : []), selection.limit + 1).all<SummaryRow>()).results;
  const page = rows.slice(0, selection.limit), last = page.at(-1);
  const nextCursor = rows.length > selection.limit && last ? Buffer.from(JSON.stringify({
    v: 1, updated: last.updated_at, id: last.id, filterHash: selection.filterHash, asOf: selection.asOf,
  } satisfies z.infer<typeof cursorSchema>)).toString("base64url") : null;
  const grouped = (await env.DB.prepare("SELECT status,count(*) AS n FROM quote_requests GROUP BY status").all<{ status: QuoteRequestStatus; n: number }>()).results;
  const metrics: QuoteRequestMetrics = { total: 0, received: 0, contacted: 0, quoted: 0, accepted: 0, lost: 0, overdue: 0 };
  for (const group of grouped) if (quoteRequestStatuses.includes(group.status)) { metrics[group.status] = group.n; metrics.total += group.n; }
  metrics.overdue = (await env.DB.prepare("SELECT count(*) AS n FROM quote_requests WHERE next_follow_up_at<? AND status NOT IN ('accepted','lost')").bind(new Date().toISOString()).first<{ n: number }>())?.n || 0;
  return json({ quoteRequests: page.map(summary), metrics, nextCursor, matchingCount });
}
async function detail(env: AdminAuthEnv, id: string): Promise<AdminQuoteRequest> {
  if (!uuid.test(id)) throw new CrmError(400, "La referencia no es válida.", "INVALID_REQUEST");
  const row = await env.DB.prepare("SELECT * FROM quote_requests WHERE id=?").bind(id).first<Row>();
  if (!row) throw new CrmError(404, "Esta solicitud ya no está disponible.", "REQUEST_NOT_FOUND");
  const events = (await env.DB.prepare("SELECT data FROM quote_request_events WHERE request_id=? ORDER BY version").bind(id).all<{ data: string }>()).results;
  return { ...summary(row), consentAt: row.consent_at, snapshot: JSON.parse(row.snapshot) as QuoteRequestSnapshot, events: events.map(event => JSON.parse(event.data) as QuoteRequestEvent) };
}
export async function readQuoteRequest(request: Request, env: AdminAuthEnv, id: string): Promise<Response> {
  await requireAdmin(request, env);
  return json({ quoteRequest: await detail(env, id) });
}
export async function updateQuoteRequest(request: Request, env: AdminAuthEnv, data: unknown): Promise<Response> {
  await requireAdmin(request, env);
  const input = parse(updateQuoteRequestSchema, data);
  const row = await env.DB.prepare("SELECT * FROM quote_requests WHERE id=?").bind(input.id).first<Row>();
  if (!row) throw new CrmError(404, "Esta solicitud ya no está disponible.", "REQUEST_NOT_FOUND");
  if (row.version !== input.version) throw new CrmError(409, "Otra edición cambió esta solicitud. Recarga antes de guardar.", "VERSION_CONFLICT");
  const created = new Date().toISOString(), nextFollowUpAt = input.nextFollowUpAt === null ? null : new Date(input.nextFollowUpAt).toISOString();
  const nextAction = input.nextAction === undefined ? row.next_action ?? null : input.nextAction;
  if (nextAction && (!nextFollowUpAt || !input.assignee)) throw new CrmError(400, "Una próxima acción necesita responsable y fecha.", "INVALID_ACTION");
  const event: QuoteRequestEvent = { id: crypto.randomUUID(), created, type: "updated", fromStatus: row.status, toStatus: input.status, version: row.version + 1,
    assignee: input.assignee, nextFollowUpAt, nextAction, notes: input.notes, lostReason: input.lostReason };
  // Inserting the conditional event first also gives the UPDATE a transaction
  // specific claim, instead of relying on timestamps or connection changes().
  const results = await env.DB.batch([
    env.DB.prepare("INSERT INTO quote_request_events(id,request_id,version,created_at,data) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM quote_requests WHERE id=? AND version=?) ON CONFLICT(request_id,version) DO NOTHING")
      .bind(event.id, input.id, event.version, created, JSON.stringify(event), input.id, input.version),
    env.DB.prepare("UPDATE quote_requests SET status=?,assignee=?,next_follow_up_at=?,next_action=?,notes=?,lost_reason=?,version=version+1,updated_at=? WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM quote_request_events WHERE id=?)")
      .bind(input.status, input.assignee, nextFollowUpAt, nextAction, input.notes, input.lostReason, created, input.id, input.version, event.id),
  ]);
  if (!results[1].meta.changes) throw new CrmError(409, "Otra edición cambió esta solicitud. Recarga antes de guardar.", "VERSION_CONFLICT");
  return json({ quoteRequest: await detail(env, input.id) });
}

export async function completeQuoteAction(request: Request, env: AdminAuthEnv, data: unknown): Promise<Response> {
  await requireAdmin(request, env);
  const input = parse(completeQuoteActionSchema, data), operationHash = sha256(JSON.stringify(input));
  const eventId = sha256("complete-quote-action:" + input.id + ":" + input.requestId);
  const prior = await env.DB.prepare("SELECT data FROM quote_request_events WHERE id=?").bind(eventId).first<{ data: string }>();
  if (prior) {
    if ((JSON.parse(prior.data) as QuoteRequestEvent).operationHash !== operationHash) throw new CrmError(409, "Esta acción ya se completó con otros datos.", "IDEMPOTENCY_CONFLICT");
    return json({ quoteRequest: await detail(env, input.id) });
  }
  const row = await env.DB.prepare("SELECT * FROM quote_requests WHERE id=?").bind(input.id).first<Row>();
  if (!row) throw new CrmError(404, "La solicitud no está disponible.", "REQUEST_NOT_FOUND");
  if (row.version !== input.version) throw new CrmError(409, "La solicitud cambió. Recarga antes de completar la acción.", "VERSION_CONFLICT");
  if (!row.next_follow_up_at || ["accepted", "lost"].includes(row.status)) throw new CrmError(409, "No hay una acción pendiente que completar.", "NO_PENDING_ACTION");
  const created = new Date().toISOString();
  const event: QuoteRequestEvent = { id: eventId, created, type: "action_completed", fromStatus: row.status, toStatus: row.status, version: row.version + 1,
    assignee: row.assignee, nextFollowUpAt: null, nextAction: null, notes: row.notes, lostReason: row.lost_reason, outcome: input.outcome, operationId: input.requestId, operationHash };
  const results = await env.DB.batch([
    env.DB.prepare("INSERT INTO quote_request_events(id,request_id,version,created_at,data) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM quote_requests WHERE id=? AND version=? AND next_follow_up_at IS NOT NULL AND status NOT IN ('accepted','lost')) ON CONFLICT DO NOTHING")
      .bind(eventId, row.id, event.version, created, JSON.stringify(event), row.id, row.version),
    env.DB.prepare("UPDATE quote_requests SET next_action=NULL,next_follow_up_at=NULL,version=version+1,updated_at=? WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM quote_request_events WHERE id=?)")
      .bind(created, row.id, row.version, eventId),
  ]);
  if (!results[1].meta.changes) {
    const retry = await env.DB.prepare("SELECT data FROM quote_request_events WHERE id=?").bind(eventId).first<{ data: string }>();
    if (!retry || (JSON.parse(retry.data) as QuoteRequestEvent).operationHash !== operationHash) throw new CrmError(409, "La solicitud cambió. Recarga antes de completar la acción.", "VERSION_CONFLICT");
  }
  return json({ quoteRequest: await detail(env, input.id) });
}
const DAY = 86400000;
function periodOf(request: Request, pastDays = 29, aheadDays = 0) {
  const params = new URL(request.url).searchParams, today = Date.parse(new Date().toISOString().slice(0, 10));
  const from = params.get("from") ?? new Date(today - pastDays * DAY).toISOString().slice(0, 10);
  const to = params.get("to") ?? new Date(today + aheadDays * DAY).toISOString().slice(0, 10);
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(from) || !valid(to) || from > to || Date.parse(to) - Date.parse(from) > 365 * DAY || params.getAll("from").length > 1 || params.getAll("to").length > 1)
    throw new CrmError(400, "Elige un período válido de hasta 366 días (UTC).", "INVALID_PERIOD");
  return { from, to, start: from + "T00:00:00.000Z", end: new Date(Date.parse(to) + DAY).toISOString() };
}
export async function readCrmMetrics(request: Request, env: AdminAuthEnv): Promise<Response> {
  await requireAdmin(request, env);
  const period = periodOf(request);
  const values = [period.start, period.end];
  const queries = await Promise.all([
    env.DB.prepare("SELECT count(*) AS n FROM quote_requests WHERE created_at>=? AND created_at<?").bind(...values).first<{ n: number }>(),
    env.DB.prepare("SELECT count(DISTINCT request_id) AS n FROM quote_request_events WHERE created_at>=? AND created_at<? AND json_extract(data,'$.type')='updated' AND json_extract(data,'$.toStatus')='contacted' AND json_extract(data,'$.fromStatus')!='contacted'").bind(...values).first<{ n: number }>(),
    env.DB.prepare("SELECT count(*) AS n,count(DISTINCT request_id) AS requests FROM commercial_quote_versions WHERE issued_at>=? AND issued_at<?").bind(...values).first<{ n: number; requests: number }>(),
    env.DB.prepare("SELECT response_kind,count(*) AS n,coalesce(sum(round(json_extract(document,'$.total')*100))/100.0,0) AS amount FROM commercial_quote_versions WHERE responded_at>=? AND responded_at<? GROUP BY response_kind").bind(...values).all<{ response_kind: string; n: number; amount: number }>(),
    env.DB.prepare("SELECT count(*) AS n FROM quote_request_events WHERE created_at>=? AND created_at<? AND json_extract(data,'$.type')='action_completed'").bind(...values).first<{ n: number }>(),
    env.DB.prepare("SELECT count(DISTINCT request_id) AS n FROM quote_request_events WHERE created_at>=? AND created_at<? AND json_extract(data,'$.type')='updated' AND json_extract(data,'$.toStatus')='accepted' AND json_extract(data,'$.fromStatus')!='accepted'").bind(...values).first<{ n: number }>(),
    env.DB.prepare("SELECT count(*) AS n FROM quote_requests r WHERE created_at>=? AND created_at<? AND EXISTS(SELECT 1 FROM commercial_quote_versions q WHERE q.request_id=r.id AND q.response_kind='accept' AND q.responded_at<?)").bind(...values, period.end).first<{ n: number }>(),
  ]);
  const accepted = queries[3].results.find(row => row.response_kind === "accept"), changes = queries[3].results.find(row => row.response_kind === "changes");
  const received = queries[0]?.n ?? 0, cohortAccepted = queries[6]?.n ?? 0;
  return json({ period: { from: period.from, to: period.to, timeZone: "UTC" }, metrics: {
    requestsReceived: received, contactedRequests: queries[1]?.n ?? 0, quoteVersionsIssued: queries[2]?.n ?? 0, quotedRequests: queries[2]?.requests ?? 0,
    customerAcceptances: accepted?.n ?? 0, changeRequests: changes?.n ?? 0, actionsCompleted: queries[4]?.n ?? 0, manualAcceptances: queries[5]?.n ?? 0,
    cohortAccepted, cohortConversionRate: received ? cohortAccepted / received : null, commercialAcceptedAmount: accepted?.amount ?? 0, currency: "PEN",
  } });
}
export async function listCrmAgenda(request: Request, env: AdminAuthEnv): Promise<Response> {
  await requireAdmin(request, env);
  const period = periodOf(request, 0, 6), params = new URL(request.url).searchParams;
  const assignee = (params.get("assignee") ?? "").trim(), action = params.get("nextAction"), includeOverdue = params.get("includeOverdue") ?? "true";
  if (assignee.length > 120 || (action && !quoteActionTypes.includes(action as typeof quoteActionTypes[number])) || !["true", "false"].includes(includeOverdue))
    throw new CrmError(400, "Revisa los filtros de agenda.", "INVALID_FILTERS");
  const filterHash = sha256(JSON.stringify([period.from, period.to, assignee, action, includeOverdue]));
  const schema = z.object({ due: cursorDate, id: z.string().regex(uuid), filterHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
  let cursor: z.infer<typeof schema> | null = null;
  if (params.has("cursor")) try {
    const raw = params.get("cursor")!;
    if (raw.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error();
    const decoded = Buffer.from(raw, "base64url"); if (decoded.toString("base64url") !== raw) throw new Error();
    cursor = schema.parse(JSON.parse(decoded.toString("utf8"))); if (cursor.filterHash !== filterHash) throw new Error();
  } catch { throw new CrmError(400, "La página de agenda no coincide con sus filtros.", "INVALID_CURSOR"); }
  const clauses = ["next_follow_up_at IS NOT NULL", "next_follow_up_at<?", "status NOT IN ('accepted','lost')"], values: unknown[] = [period.end];
  if (includeOverdue === "false") { clauses.push("next_follow_up_at>=?"); values.push(period.start); }
  if (assignee) { clauses.push("assignee=?"); values.push(assignee); }
  if (action) { clauses.push("coalesce(next_action,'follow_up')=?"); values.push(action); }
  const where = clauses.join(" AND ");
  const matchingCount = (await env.DB.prepare(`SELECT count(*) AS n FROM quote_requests WHERE ${where}`).bind(...values).first<{ n: number }>())?.n ?? 0;
  const rows = (await env.DB.prepare(`SELECT id,reference,version,json_extract(contact,'$.name') AS name,assignee,coalesce(next_action,'follow_up') AS nextAction,next_follow_up_at AS nextFollowUpAt FROM quote_requests WHERE ${where}${cursor ? " AND (next_follow_up_at>? OR (next_follow_up_at=? AND id>?))" : ""} ORDER BY next_follow_up_at,id LIMIT 51`)
    .bind(...values, ...(cursor ? [cursor.due, cursor.due, cursor.id] : [])).all<{ id: string; reference: string; version: number; name: string; assignee: string; nextAction: string; nextFollowUpAt: string }>()).results;
  const page = rows.slice(0, 50), last = page.at(-1);
  return json({ items: page.map(row => ({ ...row, overdue: row.nextFollowUpAt < new Date().toISOString() })), matchingCount, from: period.from, to: period.to,
    nextCursor: rows.length > 50 && last ? Buffer.from(JSON.stringify({ due: last.nextFollowUpAt, id: last.id, filterHash })).toString("base64url") : null });
}
