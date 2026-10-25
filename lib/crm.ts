import { z } from "zod";
import type { Config, PublicMaterial } from "./furniture.ts";
import type { KitchenModule, KitchenPlan } from "./kitchen.ts";
import type { VisualPanel } from "./public-geometry.ts";

export const quoteRequestStatuses = ["received", "contacted", "quoted", "accepted", "lost"] as const;
export type QuoteRequestStatus = typeof quoteRequestStatuses[number];
export const quoteRequestStatusLabels: Record<QuoteRequestStatus, string> = {
  received: "Recibida", contacted: "Contactada", quoted: "Cotizada", accepted: "Aceptada", lost: "Perdida",
};
export const quoteActionTypes = ["call", "present_quote", "visit", "revise_quote", "follow_up"] as const;
export type QuoteActionType = typeof quoteActionTypes[number];
export const quoteActionLabels: Record<QuoteActionType, string> = {
  call: "Llamar al cliente", present_quote: "Presentar cotización", visit: "Coordinar visita", revise_quote: "Revisar cambios solicitados", follow_up: "Dar seguimiento",
};
const uuid = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);
const version = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const quoteRequestSourceSchema = z.object({ kind: z.enum(["design", "kitchen"]), id: uuid, version }).strict();
export type QuoteRequestSource = z.infer<typeof quoteRequestSourceSchema>;
const optionalText = (max: number) => z.string().trim().max(max).default("");
export const createQuoteRequestSchema = z.object({
  op: z.literal("create-quote-request"), requestId: uuid,
  sources: z.array(quoteRequestSourceSchema).min(1).max(20).refine(
    sources => new Set(sources.map(source => `${source.kind}:${source.id}`)).size === sources.length,
    "No repitas un diseño en la misma solicitud.",
  ),
  name: z.string().trim().min(2).max(120),
  phone: optionalText(40).refine(value => !value || (/^[+()\d .-]+$/.test(value) && value.replace(/\D/g, "").length >= 7 && value.replace(/\D/g, "").length <= 20), "Revisa el teléfono."),
  email: optionalText(254).refine(value => !value || z.string().email().safeParse(value).success, "Revisa el correo.").transform(value => value.toLowerCase()),
  city: optionalText(120), message: optionalText(2000), consent: z.literal(true),
}).strict().refine(data => !!(data.phone || data.email), "Indica un teléfono o correo para poder contactarte.");
export type CreateQuoteRequestInput = z.infer<typeof createQuoteRequestSchema>;
export const updateQuoteRequestSchema = z.object({
  op: z.literal("update-quote-request"), id: uuid, version,
  status: z.enum(quoteRequestStatuses), assignee: optionalText(120),
  nextFollowUpAt: z.string().datetime({ offset: true }).nullable(),
  nextAction: z.enum(quoteActionTypes).nullable().optional(),
  notes: optionalText(8000), lostReason: optionalText(1000),
}).strict().refine(data => data.status !== "lost" || data.lostReason.length > 0, "Indica el motivo de pérdida.")
  .refine(data => !data.nextAction || !!(data.assignee && data.nextFollowUpAt), "Una próxima acción necesita responsable y fecha.");
export type UpdateQuoteRequestInput = z.infer<typeof updateQuoteRequestSchema>;
export const completeQuoteActionSchema = z.object({
  op: z.literal("complete-quote-action"), id: uuid, version, requestId: uuid, outcome: z.string().trim().min(3).max(2000),
}).strict();
export type QuoteRequestReceipt = { id: string; reference: string; status: QuoteRequestStatus; created: string };
export type QuoteRequestContact = { name: string; phone: string; email: string; city: string; message: string };
export type QuoteRequestSnapshotItem = {
  source: QuoteRequestSource; name: string; quantity: number;
  product?: { id: string; name: string }; config?: Config; plan?: KitchenPlan;
  materials?: PublicMaterial[];
  preview?: { geometry: VisualPanel[]; materials: PublicMaterial[]; handle: Config["handle"] };
  unitPrice: number | null; totalPrice: number | null;
  furniturePrice?: number | null; servicesPrice?: number | null;
  modules?: Pick<KitchenModule, "id" | "name" | "kind" | "row" | "wall" | "price">[];
};
export type QuoteRequestSnapshot = { currency: "PEN"; created: string; items: QuoteRequestSnapshotItem[]; totalPrice: number | null };
export type QuoteRequestEvent = {
  id: string; created: string; type: "created" | "updated" | "commercial_issued" | "customer_accepted" | "customer_changes_requested" | "action_completed"; fromStatus: QuoteRequestStatus | null;
  toStatus: QuoteRequestStatus; version: number; assignee: string; nextFollowUpAt: string | null;
  notes: string; lostReason: string;
  nextAction?: QuoteActionType | null; commercialVersion?: number; customerMessage?: string; outcome?: string;
  operationId?: string; operationHash?: string;
};
export type AdminQuoteRequestSummary = QuoteRequestReceipt & {
  updated: string; version: number; contact: QuoteRequestContact; assignee: string;
  nextFollowUpAt: string | null; notes: string; lostReason: string; sourceCount: number; totalPrice: number | null;
  nextAction: QuoteActionType | null;
};
export type AdminQuoteRequest = AdminQuoteRequestSummary & { consentAt: string; snapshot: QuoteRequestSnapshot; events: QuoteRequestEvent[] };
export type QuoteRequestMetrics = Record<QuoteRequestStatus, number> & { total: number; overdue: number };
export type QuoteRequestList = {
  quoteRequests: AdminQuoteRequestSummary[]; metrics: QuoteRequestMetrics;
  nextCursor: string | null; matchingCount: number;
};
export type CrmAgendaItem = { id: string; reference: string; version: number; name: string; assignee: string; nextAction: QuoteActionType; nextFollowUpAt: string; overdue: boolean };
export type CrmAgenda = { items: CrmAgendaItem[]; nextCursor: string | null; matchingCount: number; from: string; to: string };
export type CrmPeriodMetrics = {
  period: { from: string; to: string; timeZone: "UTC" };
  metrics: {
    requestsReceived: number; contactedRequests: number; quoteVersionsIssued: number; quotedRequests: number;
    customerAcceptances: number; changeRequests: number; actionsCompleted: number; manualAcceptances: number;
    cohortAccepted: number; cohortConversionRate: number | null; commercialAcceptedAmount: number; currency: "PEN";
  };
};
