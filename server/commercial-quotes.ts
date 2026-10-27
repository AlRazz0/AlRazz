import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { equalStrings, sha256 } from "../lib/admin-crypto.ts";
import { commercialQuoteLines, issueCommercialQuoteSchema, respondCommercialQuoteSchema, viewCommercialQuoteSchema, type AdminCommercialQuote, type CommercialQuoteDocument, type CustomerCommercialQuote } from "../lib/commercial-quotes.ts";
import type { QuoteRequestEvent, QuoteRequestSnapshot, QuoteRequestStatus } from "../lib/crm.ts";
import { requireAdmin, type AdminAuthEnv } from "./admin-auth.ts";
import { CrmError } from "./crm.ts";

type RequestRow = { id: string; reference: string; version: number; snapshot: string; status: QuoteRequestStatus; assignee: string; next_follow_up_at: string | null; next_action: QuoteRequestEvent["nextAction"]; notes: string; lost_reason: string };
type VersionRow = { id: string; request_id: string; number: number; issue_request_id: string; payload_hash: string; token_hash: string; token_nonce: string; document: string; issued_at: string; valid_until: string; state: "issued" | "accepted" | "changes_requested" | "superseded"; response_request_id: string | null; response_payload_hash: string | null; response_kind: "accept" | "changes" | null; responded_at: string | null; customer_message: string; reference: string };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: {
  "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow, noarchive",
} });
function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw new CrmError(400, result.error.issues[0]?.message || "Revisa la cotización.", "INVALID_REQUEST");
  return result.data;
}
function tokenFor(env: AdminAuthEnv, nonce: string) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new CrmError(503, "Las cotizaciones comerciales no están configuradas.", "CRM_NOT_CONFIGURED");
  return createHmac("sha256", env.SESSION_SECRET).update("commercial-quote:v1:" + nonce).digest("base64url");
}
function publicVersion(row: VersionRow): CustomerCommercialQuote {
  return { id: row.id, reference: row.reference + "-C" + row.number, version: row.number,
    status: row.state === "issued" && row.valid_until <= new Date().toISOString() ? "expired" : row.state,
    issuedAt: row.issued_at, validUntil: row.valid_until, respondedAt: row.responded_at, document: JSON.parse(row.document) as CommercialQuoteDocument };
}
function adminVersion(request: Request, env: AdminAuthEnv, row: VersionRow): AdminCommercialQuote {
  const token = tokenFor(env, row.token_nonce);
  return { ...publicVersion(row), customerMessage: row.customer_message,
    link: equalStrings(sha256(token), row.token_hash) ? new URL("/cotizacion", request.url).origin + "/cotizacion#" + token : "" };
}
async function requestRow(env: AdminAuthEnv, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new CrmError(400, "La solicitud no es válida.", "INVALID_REQUEST");
  const row = await env.DB.prepare("SELECT id,reference,version,snapshot,status,assignee,next_follow_up_at,next_action,notes,lost_reason FROM quote_requests WHERE id=?").bind(id).first<RequestRow>();
  if (!row) throw new CrmError(404, "Esta solicitud no está disponible.", "REQUEST_NOT_FOUND");
  return row;
}
async function history(request: Request, env: AdminAuthEnv, id: string) {
  const row = await requestRow(env, id);
  const versions = (await env.DB.prepare("SELECT q.*,r.reference FROM commercial_quote_versions q JOIN quote_requests r ON r.id=q.request_id WHERE q.request_id=? ORDER BY q.number DESC").bind(id).all<VersionRow>()).results;
  return { commercialQuotes: versions.map(version => adminVersion(request, env, version)), requestVersion: row.version };
}
export async function listCommercialQuotes(request: Request, env: AdminAuthEnv, id: string) {
  await requireAdmin(request, env);
  return json(await history(request, env, id));
}
function eventFor(row: RequestRow, id: string, created: string, type: QuoteRequestEvent["type"], status: QuoteRequestStatus, number: number): QuoteRequestEvent {
  return { id, created, type, fromStatus: row.status, toStatus: status, version: row.version + 1,
    assignee: row.assignee, nextFollowUpAt: row.next_follow_up_at, nextAction: row.next_action ?? null,
    notes: row.notes, lostReason: row.lost_reason, commercialVersion: number };
}
export async function issueCommercialQuote(request: Request, env: AdminAuthEnv, data: unknown) {
  await requireAdmin(request, env);
  const input = parse(issueCommercialQuoteSchema, data), payloadHash = sha256(JSON.stringify(input));
  const prior = await env.DB.prepare("SELECT payload_hash FROM commercial_quote_versions WHERE request_id=? AND issue_request_id=?").bind(input.id, input.requestId).first<{ payload_hash: string }>();
  if (prior) {
    if (!equalStrings(prior.payload_hash, payloadHash)) throw new CrmError(409, "Esta emisión ya se usó con otros datos.", "IDEMPOTENCY_CONFLICT");
    return json(await history(request, env, input.id));
  }
  const row = await requestRow(env, input.id);
  if (row.version !== input.version) throw new CrmError(409, "La solicitud cambió. Recarga antes de emitir.", "VERSION_CONFLICT");
  if (row.status === "lost") throw new CrmError(409, "Reabre la solicitud antes de emitir una cotización.", "REQUEST_CLOSED");
  const latest = await env.DB.prepare("SELECT number,state FROM commercial_quote_versions WHERE request_id=? ORDER BY number DESC LIMIT 1").bind(input.id).first<{ number: number; state: string }>();
  if (latest?.state === "accepted") throw new CrmError(409, "La versión aceptada se conserva; no puede sustituirse silenciosamente.", "QUOTE_ALREADY_ACCEPTED");
  const created = new Date().toISOString(), until = new Date(input.validUntil).toISOString();
  if (until <= created || Date.parse(until) - Date.parse(created) > 180 * 86400000) throw new CrmError(400, "La vigencia debe ser futura y no superar 180 días.", "INVALID_VALIDITY");
  let amounts;
  try { amounts = commercialQuoteLines(input.lines); } catch (error) { throw new CrmError(400, error instanceof Error ? error.message : "Revisa los importes.", "INVALID_AMOUNT"); }
  const saved = JSON.parse(row.snapshot) as QuoteRequestSnapshot;
  const document: CommercialQuoteDocument = { title: input.title, currency: "PEN", ...amounts, terms: input.terms, services: input.services,
    specifications: saved.items.map(item => ({ kind: item.source.kind, model: item.product?.name ?? "Composición de cocina", quantity: item.quantity,
      dimensions: item.config ? `${item.config.width} × ${item.config.height} × ${item.config.depth} mm` : item.plan ? `Pared A: ${item.plan.walls.a} mm${item.plan.layout === "l" ? `; pared B: ${item.plan.walls.b} mm` : ""}` : "",
      materials: (item.materials ?? []).map(material => material.name), materialDetails: item.materials ?? [],
      ...(item.config ? { config: item.config } : {}), ...(item.preview ? { preview: item.preview } : {}),
      ...(item.plan ? { modules: item.plan.items.map(part => ({ name: item.modules?.find(module => module.id === part.id)?.name ?? (part.kind === "furniture" ? "Módulo" : "Reserva"),
        kind: part.kind, wall: part.wall, row: part.row, size: part.kind === "furniture" ? [part.config.width, part.config.height, part.config.depth] as [number, number, number] : [part.width, part.height, part.depth] as [number, number, number],
        ...(part.kind === "furniture" ? { config: part.config } : {}) })) } : {}),
    })) };
  const id = crypto.randomUUID(), nonce = randomBytes(32).toString("base64url"), tokenHash = sha256(tokenFor(env, nonce));
  const number = (latest?.number ?? 0) + 1;
  const event = eventFor(row, crypto.randomUUID(), created, "commercial_issued", "quoted", number);
  const results = await env.DB.batch([
    env.DB.prepare("INSERT INTO commercial_quote_versions(id,request_id,number,issue_request_id,payload_hash,token_hash,token_nonce,document,source_snapshot,issued_at,valid_until,state) SELECT ?,?,?,?,?,?,?,?,?,?,?,'issued' WHERE EXISTS(SELECT 1 FROM quote_requests WHERE id=? AND version=? AND status!='lost') AND NOT EXISTS(SELECT 1 FROM commercial_quote_versions WHERE request_id=? AND state='accepted') ON CONFLICT(request_id,issue_request_id) DO NOTHING")
      .bind(id, row.id, number, input.requestId, payloadHash, tokenHash, nonce, JSON.stringify(document), row.snapshot, created, until, row.id, row.version, row.id),
    env.DB.prepare("UPDATE commercial_quote_versions SET state='superseded' WHERE request_id=? AND id!=? AND state IN ('issued','changes_requested') AND EXISTS(SELECT 1 FROM commercial_quote_versions WHERE id=?)").bind(row.id, id, id),
    env.DB.prepare("INSERT INTO quote_request_events(id,request_id,version,created_at,data) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM commercial_quote_versions WHERE id=?)").bind(event.id, row.id, event.version, created, JSON.stringify(event), id),
    env.DB.prepare("UPDATE quote_requests SET status='quoted',version=version+1,updated_at=? WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM commercial_quote_versions WHERE id=?)").bind(created, row.id, row.version, id),
  ]);
  if (!results[0].meta.changes) {
    const retry = await env.DB.prepare("SELECT payload_hash FROM commercial_quote_versions WHERE request_id=? AND issue_request_id=?").bind(input.id, input.requestId).first<{ payload_hash: string }>();
    if (retry && equalStrings(retry.payload_hash, payloadHash)) return json(await history(request, env, row.id));
    throw new CrmError(409, "Otra edición cambió la solicitud. Recarga antes de emitir.", "VERSION_CONFLICT");
  }
  return json(await history(request, env, row.id), 201);
}
async function byToken(env: AdminAuthEnv, token: string) {
  const row = await env.DB.prepare("SELECT q.*,r.reference FROM commercial_quote_versions q JOIN quote_requests r ON r.id=q.request_id WHERE q.token_hash=?").bind(sha256(token)).first<VersionRow>();
  if (!row || !equalStrings(token, tokenFor(env, row.token_nonce))) throw new CrmError(404, "Este enlace de cotización no está disponible.", "QUOTE_UNAVAILABLE");
  return row;
}
export async function viewCommercialQuote(_request: Request, env: AdminAuthEnv, data: unknown) {
  const input = parse(viewCommercialQuoteSchema, data), row = await byToken(env, input.token);
  return json({ quote: publicVersion(row) });
}
export async function respondCommercialQuote(_request: Request, env: AdminAuthEnv, data: unknown) {
  const input = parse(respondCommercialQuoteSchema, data), row = await byToken(env, input.token), payloadHash = sha256(JSON.stringify(input));
  if (input.id !== row.id || input.version !== row.number) throw new CrmError(409, "Revisa la versión exacta que vas a responder.", "QUOTE_VERSION_MISMATCH");
  const responseReceipt = (version: VersionRow) => ({ response: { id: version.id, version: version.number, decision: version.response_kind, respondedAt: version.responded_at } });
  if (row.response_request_id === input.requestId) {
    if (!row.response_payload_hash || !equalStrings(row.response_payload_hash, payloadHash)) throw new CrmError(409, "Esta respuesta ya se usó con otros datos.", "IDEMPOTENCY_CONFLICT");
    return json(responseReceipt(row));
  }
  if (row.state === "superseded") throw new CrmError(409, "Esta versión fue sustituida. Pide el enlace de la versión vigente.", "QUOTE_SUPERSEDED");
  if (row.state !== "issued") throw new CrmError(409, "Esta versión ya tiene una respuesta registrada.", "QUOTE_ALREADY_RESPONDED");
  const created = new Date().toISOString();
  if (row.valid_until <= created) throw new CrmError(410, "La vigencia terminó. Pide una nueva versión antes de aceptar.", "QUOTE_EXPIRED");
  const parent = await requestRow(env, row.request_id);
  if (parent.status === "lost") throw new CrmError(409, "La solicitud está cerrada. Contacta al equipo para revisarla.", "REQUEST_CLOSED");
  const status = input.decision === "accept" ? "accepted" : "contacted";
  const event = eventFor(parent, crypto.randomUUID(), created, input.decision === "accept" ? "customer_accepted" : "customer_changes_requested", status, row.number);
  if (input.decision === "changes") event.customerMessage = input.message;
  event.nextAction = input.decision === "changes" && parent.assignee && parent.next_follow_up_at ? "revise_quote" : null;
  event.nextFollowUpAt = input.decision === "accept" ? null : parent.next_follow_up_at;
  const results = await env.DB.batch([
    env.DB.prepare("INSERT INTO quote_request_events(id,request_id,version,created_at,data) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM quote_requests WHERE id=? AND version=? AND status!='lost') AND EXISTS(SELECT 1 FROM commercial_quote_versions WHERE id=? AND state='issued' AND valid_until>?) AND NOT EXISTS(SELECT 1 FROM commercial_quote_versions WHERE request_id=? AND number>?) ON CONFLICT(request_id,version) DO NOTHING")
      .bind(event.id, parent.id, event.version, created, JSON.stringify(event), parent.id, parent.version, row.id, created, parent.id, row.number),
    env.DB.prepare("UPDATE commercial_quote_versions SET state=?,response_request_id=?,response_payload_hash=?,response_kind=?,responded_at=?,customer_message=? WHERE id=? AND state='issued' AND EXISTS(SELECT 1 FROM quote_request_events WHERE id=?)")
      .bind(input.decision === "accept" ? "accepted" : "changes_requested", input.requestId, payloadHash, input.decision, created, input.decision === "changes" ? input.message : "", row.id, event.id),
    env.DB.prepare("UPDATE quote_requests SET status=?,next_action=?,next_follow_up_at=?,version=version+1,updated_at=? WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM quote_request_events WHERE id=?)")
      .bind(status, event.nextAction, event.nextFollowUpAt, created, parent.id, parent.version, event.id),
  ]);
  const stored = await byToken(env, input.token);
  if (stored.response_request_id === input.requestId && stored.response_payload_hash && equalStrings(stored.response_payload_hash, payloadHash)) return json(responseReceipt(stored));
  if (!results[1].meta.changes) throw new CrmError(409, "La cotización cambió mientras respondías. Recarga y revisa su estado.", "VERSION_CONFLICT");
  return json(responseReceipt(stored));
}
