import { z } from "zod";
import type { Config, PublicMaterial } from "./furniture.ts";
import type { VisualPanel } from "./public-geometry.ts";
const uuid = z.string().uuid();
const positiveVersion = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1);
const lineSchema = z.object({
  description: z.string().trim().min(2).max(240), quantity: z.number().int().min(1).max(10000),
  unitPrice: z.number().finite().min(0).max(10000000).multipleOf(0.01),
}).strict();
export const issueCommercialQuoteSchema = z.object({
  op: z.literal("issue-commercial-quote"), id: uuid, version: positiveVersion, requestId: uuid,
  title: z.string().trim().min(3).max(160), currency: z.literal("PEN"),
  lines: z.array(lineSchema).min(1).max(60), terms: z.string().trim().min(10).max(8000),
  services: z.object({ installation: z.boolean(), transport: z.boolean() }).strict(),
  validUntil: z.string().datetime({ offset: true }),
}).strict();
export type IssueCommercialQuoteInput = z.infer<typeof issueCommercialQuoteSchema>;
export const commercialTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const viewCommercialQuoteSchema = z.object({ op: z.literal("view-commercial-quote"), token: commercialTokenSchema }).strict();
const responseBase = { token: commercialTokenSchema, id: uuid, version: positiveVersion, requestId: uuid };
export const respondCommercialQuoteSchema = z.discriminatedUnion("decision", [
  z.object({ op: z.literal("respond-commercial-quote"), ...responseBase, decision: z.literal("accept"), consent: z.literal(true) }).strict(),
  z.object({ op: z.literal("respond-commercial-quote"), ...responseBase, decision: z.literal("changes"), message: z.string().trim().min(3).max(2000) }).strict(),
]);
export type CommercialQuoteSpecification = {
  kind: "design" | "kitchen"; model: string; quantity: number; dimensions: string; materials: string[];
  config?: Config; materialDetails: PublicMaterial[];
  modules?: { name: string; kind: string; wall: "a" | "b"; row: string; size: [number, number, number]; config?: Config }[];
  preview?: { geometry: VisualPanel[]; materials: PublicMaterial[]; handle: Config["handle"] };
};
export type CommercialQuoteDocument = {
  title: string; currency: "PEN"; lines: { description: string; quantity: number; unitPrice: number; lineTotal: number }[];
  total: number; terms: string; services: { installation: boolean; transport: boolean }; specifications: CommercialQuoteSpecification[];
};
export type CommercialQuoteStatus = "issued" | "accepted" | "changes_requested" | "superseded" | "expired";
export type CustomerCommercialQuote = {
  id: string; reference: string; version: number; status: CommercialQuoteStatus; issuedAt: string; validUntil: string;
  respondedAt: string | null; document: CommercialQuoteDocument;
};
export type AdminCommercialQuote = CustomerCommercialQuote & { customerMessage: string; link: string };
export type CommercialQuoteList = { commercialQuotes: AdminCommercialQuote[]; requestVersion: number };
export type CommercialQuoteResponseReceipt = { id: string; version: number; decision: "accept" | "changes"; respondedAt: string };

/** Retail arithmetic is validated on the server; this does not recalculate saved furniture. */
export function commercialQuoteLines(lines: z.infer<typeof lineSchema>[]) {
  const result = lines.map(line => ({ ...line, lineTotal: Math.round(line.unitPrice * 100) * line.quantity / 100 }));
  const total = result.reduce((sum, line) => sum + Math.round(line.lineTotal * 100), 0) / 100;
  if (!Number.isFinite(total) || total <= 0 || total > 1000000000) throw new Error("El importe comercial debe ser mayor que cero y no superar S/ 1 000 000 000.");
  return { lines: result, total };
}
