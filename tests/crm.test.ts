import assert from "node:assert/strict";
import test from "node:test";
import { createQuoteRequestSchema, updateQuoteRequestSchema, quoteRequestStatuses, quoteRequestStatusLabels } from "../lib/crm.ts";

const source = { kind: "design" as const, id: "11111111-1111-4111-8111-111111111111", version: 3 };
const input = {
  op: "create-quote-request", requestId: "22222222-2222-4222-8222-222222222222",
  sources: [source], name: "Persona de prueba", phone: "+51 000 000 000", email: "", city: "Ciudad de prueba", message: "", consent: true,
};
test("CRM requires explicit consent, an actual contact channel and a bounded owned-source reference", () => {
  assert.equal(createQuoteRequestSchema.safeParse(input).success, true);
  for (const changed of [
    { consent: false }, { consent: undefined }, { phone: "", email: "" }, { phone: "abc1234567" },
    { phone: "", email: "invalid" }, { sources: [] }, { sources: Array.from({ length: 21 }, () => source) },
    { sources: [source, source] }, { sources: [{ ...source, version: 0 }] },
  ]) assert.equal(createQuoteRequestSchema.safeParse({ ...input, ...changed }).success, false, JSON.stringify(changed));
  const emailOnly = createQuoteRequestSchema.parse({ ...input, name: "  Persona de prueba  ", phone: "", email: "  TEST@EXAMPLE.TEST  " });
  assert.equal(emailOnly.email, "test@example.test");
  assert.equal(emailOnly.name, "Persona de prueba");
});
test("visitors cannot submit prices, snapshots, workflow fields or source payloads", () => {
  for (const key of ["price", "totalPrice", "status", "assignee", "snapshot", "owner_hash", "version"])
    assert.equal(createQuoteRequestSchema.safeParse({ ...input, [key]: 1 }).success, false, key);
  assert.equal(createQuoteRequestSchema.safeParse({ ...input, sources: [{ ...source, price: 1 }] }).success, false);
  assert.equal(createQuoteRequestSchema.safeParse({ ...input, sources: [{ ...source, id: "' OR 1=1 --" }] }).success, false);
});
test("administrative follow-ups require a known status, CAS version and a reason for loss", () => {
  const update = { op: "update-quote-request", id: input.requestId, version: 1, status: "contacted", assignee: "Equipo de prueba", nextFollowUpAt: "2026-11-01T09:00:00-05:00", notes: "Nota de prueba", lostReason: "" };
  assert.equal(updateQuoteRequestSchema.safeParse(update).success, true);
  for (const changed of [{ status: "paid" }, { version: 0 }, { status: "lost" }, { nextFollowUpAt: "mañana" }, { price: 1 }, { contact: {} }])
    assert.equal(updateQuoteRequestSchema.safeParse({ ...update, ...changed }).success, false);
  assert.equal(updateQuoteRequestSchema.safeParse({ ...update, status: "lost", lostReason: "Fuera de alcance", nextFollowUpAt: null }).success, true);
  assert.deepEqual(Object.keys(quoteRequestStatusLabels), [...quoteRequestStatuses]);
});
