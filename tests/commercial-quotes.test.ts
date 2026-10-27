import assert from "node:assert/strict";
import test from "node:test";
import { commercialQuoteLines, issueCommercialQuoteSchema, respondCommercialQuoteSchema } from "../lib/commercial-quotes.ts";
const id = "11111111-1111-4111-8111-111111111111";
test("commercial cents remain exact across quantities without recalculating furniture", () => {
  const result = commercialQuoteLines([{ description: "Servicio sintético", quantity: 3, unitPrice: 0.1 }, { description: "Mueble sintético", quantity: 7, unitPrice: 123.45 }]);
  assert.deepEqual(result.lines.map(line => line.lineTotal), [0.3, 864.15]);
  assert.equal(result.total, 864.45);
  assert.throws(() => commercialQuoteLines([{ description: "Sin importe", quantity: 1, unitPrice: 0 }]));
  assert.throws(() => commercialQuoteLines([{ description: "Fuera de límite", quantity: 10000, unitPrice: 10000000 }]));
});
test("commercial issuance validates money, terms and strict inputs; acceptance is explicit", () => {
  const issue = { op: "issue-commercial-quote", id, version: 1, requestId: id, title: "Propuesta sintética", currency: "PEN", lines: [{ description: "Mueble sintético", quantity: 1, unitPrice: 123.45 }], terms: "Términos sintéticos de prueba.", services: { installation: true, transport: false }, validUntil: "2026-12-01T23:59:59.999Z" };
  assert.equal(issueCommercialQuoteSchema.safeParse(issue).success, true);
  for (const changed of [{ total: 1 }, { currency: "USD" }, { lines: [{ ...issue.lines[0], unitPrice: 1.005 }] }, { lines: [{ ...issue.lines[0], quantity: 0 }] }, { terms: "" }, { validUntil: "mañana" }])
    assert.equal(issueCommercialQuoteSchema.safeParse({ ...issue, ...changed }).success, false);
  const response = { op: "respond-commercial-quote", token: "a".repeat(43), id, version: 2, requestId: id, decision: "accept", consent: true };
  assert.equal(respondCommercialQuoteSchema.safeParse(response).success, true);
  assert.equal(respondCommercialQuoteSchema.safeParse({ ...response, consent: false }).success, false);
  assert.equal(respondCommercialQuoteSchema.safeParse({ ...response, total: 1 }).success, false);
  assert.equal(respondCommercialQuoteSchema.safeParse({ ...response, consent: undefined, decision: "changes", message: "Cambiar acabado." }).success, false, "changes do not accept a stray consent field");
  const { consent: _consent, ...base } = response;
  assert.equal(respondCommercialQuoteSchema.safeParse({ ...base, decision: "changes", message: "Cambiar acabado." }).success, true);
});
