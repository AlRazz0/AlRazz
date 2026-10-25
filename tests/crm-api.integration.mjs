import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID, scryptSync } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Miniflare, createFetchMock, fetch as mockFetch } from "miniflare";
import { defaultSettings } from "../lib/furniture.ts";
import { productTemplate } from "../lib/product-templates.ts";

// Only the compiled Worker, synthetic fixtures and ephemeral D1 are used. No
// .dev.vars, persistent database, local server, real contact or outbound network.
const origin = "https://alrazz-crm.example.test";
const email = "crm-admin@example.test", password = "isolated-crm-password-never-real";
const totpSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const salt = Buffer.from("crm-test-salt-v1!");
const sha256 = value => createHash("sha256").update(value).digest("hex");
const passwordHash = `scrypt$32768$8$3$${salt.toString("base64url")}$${scryptSync(password, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }).toString("base64url")}`;
const bindings = {
  ADMIN_EMAIL: email, ADMIN_PASSWORD_HASH: passwordHash, ADMIN_TOTP_SECRET: totpSecret,
  ADMIN_RECOVERY_HASHES: JSON.stringify([sha256("isolated-crm-recovery-never-real")]),
  SESSION_SECRET: "isolated-crm-secret-never-for-deployment-1234567890",
};
const settings = structuredClone(defaultSettings);
const material = settings.materials.find(material => material.active);
const product = {
  ...productTemplate("kitchen-base"), id: "crm-fixture-base", name: "Mueble de prueba CRM", active: true,
  pricing: { basis: "unit", amount: 123 },
};
product.defaults = { ...product.defaults, width: 600, height: 800, depth: 600, finish: material.id, interior: "same", install: false, transport: false };
const plan = {
  layout: "straight", walls: { a: 3000, b: 2400 }, roomHeight: 2700, wallElevation: 1500,
  install: true, transport: true,
  items: [{ id: "crm-local-module", kind: "furniture", wall: "a", row: "base", productId: product.id, config: product.defaults }],
};
function code() {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hash = createHmac("sha1", "12345678901234567890").update(counter).digest();
  return String((hash.readUInt32BE(hash[19] & 15) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
class Client {
  constructor(mf, ip = "203.0.113.210") { this.mf = mf; this.ip = ip; this.cookies = new Map(); }
  async request(data, path = "/api/store", extraHeaders = {}) {
    const response = await this.mf.dispatchFetch(origin + path, {
      method: data === undefined ? "GET" : "POST",
      headers: { ...(data === undefined ? {} : { "Content-Type": "application/json", Origin: origin }),
        Cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "), "CF-Connecting-IP": this.ip, ...extraHeaders },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0], equal = pair.indexOf("=");
      if (pair.slice(equal + 1)) this.cookies.set(pair.slice(0, equal), pair.slice(equal + 1));
      else this.cookies.delete(pair.slice(0, equal));
    }
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  async save() {
    const response = await this.request({ op: "save-design", productId: product.id, config: product.defaults, quantity: 3, name: "Diseño sintético CRM" });
    assert.equal(response.status, 201, JSON.stringify(response.data));
    return response.data.design;
  }
}
const submission = sources => ({ op: "create-quote-request", requestId: randomUUID(), sources, name: "Contacto sintético", phone: "+51 000 000 000", email: "visitor@example.test", city: "Ciudad de prueba", message: "Consulta sintética", consent: true });
const source = (kind, value) => ({ kind, id: value.id, version: value.version });
function assertReceiptOnly(response) {
  assert.deepEqual(Object.keys(response.data), ["quoteRequest"]);
  assert.deepEqual(Object.keys(response.data.quoteRequest).sort(), ["created", "id", "reference", "status"]);
  assert.equal(response.headers.get("cache-control"), "no-store");
}
function assertCommercialOnly(snapshot) {
  const privateKeys = new Set(["settings", "basePrice", "pricing", "panels", "fixtures", "accessories", "breakdown", "unitCost", "cost", "materialRate", "margin", "owner_hash", "ownerHash"]);
  const visit = value => { if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) { assert.equal(privateKeys.has(key), false, `commercial snapshot exposes ${key}`); visit(child); } };
  visit(snapshot);
}

test("CRM isolated D1: ownership, frozen commercial snapshots, idempotency, MFA and atomic workflow", async t => {
  const fetchMock = createFetchMock(); fetchMock.disableNetConnect();
  const mf = new Miniflare({
    modules: true, scriptPath: process.env.ALRAZZ_CRM_WORKER || fileURLToPath(new URL("../dist/alrazz/index.js", import.meta.url)),
    compatibilityDate: "2026-05-22", compatibilityFlags: ["nodejs_compat"], bindings,
    d1Databases: { DB: "isolated-crm-in-memory" }, d1Persist: false, durableObjectsPersist: false, kvPersist: false, cachePersist: false,
    durableObjects: { ADMIN_PASSWORD_VERIFIER: { className: "AdminPasswordVerifier", useSQLite: true } },
    outboundService: request => mockFetch(request, { dispatcher: fetchMock, redirect: "manual" }),
  });
  t.after(async () => { try { await mf.dispose(); } finally { await fetchMock.close(); } });
  const db = await mf.getD1Database("DB"), directory = new URL("../migrations/", import.meta.url);
  for (const filename of (await readdir(directory)).filter(name => name.endsWith(".sql")).sort()) {
    const sql = await readFile(new URL(filename, directory), "utf8");
    const statements = sql.replace(/^\s*--.*$/gm, "").split(";").map(value => value.trim()).filter(Boolean);
    await db.batch(statements.map(statement => db.prepare(statement)));
  }
  await db.batch([
    db.prepare("INSERT INTO settings(id,data,version) VALUES('initialized','true',1)"),
    db.prepare("INSERT INTO settings(id,data,version) VALUES('business',?,1)").bind(JSON.stringify(settings)),
    db.prepare("INSERT INTO products(id,data,version,active) VALUES(?,?,1,1)").bind(product.id, JSON.stringify(product)),
  ]);
  const owner = new Client(mf), admin = new Client(mf, "203.0.113.211"), stranger = new Client(mf, "203.0.113.212");
  const design = await owner.save(), strangerDesign = await stranger.save();
  const savedKitchen = await owner.request({ op: "save-kitchen", plan, name: "Cocina sintética CRM" });
  assert.equal(savedKitchen.status, 201, JSON.stringify(savedKitchen.data));
  const kitchen = savedKitchen.data.kitchen;
  const originalDesignRow = await db.prepare("SELECT * FROM designs WHERE id=?").bind(design.id).first();
  const originalKitchenRow = await db.prepare("SELECT * FROM kitchens WHERE id=?").bind(kitchen.id).first();
  const count = async table => { assert.ok(["quote_requests", "quote_request_events"].includes(table)); return (await db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n; };
  let publicReceipt, adminDetail;

  await t.test("the public API rejects forged input, missing consent, foreign/stale/deleted/hidden sources and cross-site writes", async () => {
    const input = submission([source("design", design)]), before = await count("quote_requests");
    assert.equal((await new Client(mf).request(input)).status, 403);
    for (const changed of [{ price: 1 }, { status: "accepted" }, { snapshot: {} }, { consent: false }, { phone: "", email: "" }, { sources: [source("design", strangerDesign)] }, { sources: [{ ...source("design", design), version: 999 }] }])
      assert.ok([400, 409].includes((await owner.request({ ...input, ...changed })).status), JSON.stringify(changed));
    assert.equal((await owner.request(input, "/api/store", { Origin: "https://other.example.test" })).status, 403);
    await db.prepare("UPDATE designs SET deleted_at=? WHERE id=?").bind(new Date().toISOString(), design.id).run();
    assert.equal((await owner.request(input)).status, 409);
    await db.prepare("UPDATE designs SET deleted_at=NULL WHERE id=?").bind(design.id).run();
    await db.prepare("UPDATE products SET active=0 WHERE id=?").bind(product.id).run();
    assert.equal((await owner.request(input)).status, 409);
    await db.prepare("UPDATE products SET active=1 WHERE id=?").bind(product.id).run();
    assert.equal(await count("quote_requests"), before);
    assert.equal(await count("quote_request_events"), 0);
  });
  await t.test("server-built commercial snapshots preserve quantities/services and historical totals after tariff changes", async () => {
    await db.prepare("UPDATE products SET data=?,version=2 WHERE id=?").bind(JSON.stringify({ ...product, pricing: { basis: "unit", amount: 999 } }), product.id).run();
    const input = submission([source("design", design), source("kitchen", kitchen)]);
    input.message = "Texto literal '; DROP TABLE designs; -- <script>alert(1)</script>";
    const response = await owner.request(input);
    assert.equal(response.status, 201, JSON.stringify(response.data)); assertReceiptOnly(response);
    publicReceipt = response.data.quoteRequest;
    const row = await db.prepare("SELECT * FROM quote_requests WHERE id=?").bind(publicReceipt.id).first();
    const commercial = JSON.parse(row.snapshot);
    assertCommercialOnly(commercial);
    assert.equal(commercial.items[0].quantity, 3);
    assert.equal(commercial.items[0].unitPrice, design.price);
    assert.equal(commercial.items[0].totalPrice, Math.round(design.price * 3 * 100) / 100);
    assert.equal(commercial.items[1].totalPrice, kitchen.result.price);
    assert.equal(commercial.items[1].furniturePrice, kitchen.result.furniturePrice);
    assert.equal(commercial.items[1].servicesPrice, kitchen.result.servicesPrice);
    assert.ok(commercial.items[1].servicesPrice > 0);
    assert.equal(commercial.totalPrice, Math.round((design.price * 3 + kitchen.result.price) * 100) / 100);
    assert.equal(JSON.parse(row.contact).message, input.message, "SQL-like and HTML-like contact text is stored as literal data");
    assert.equal(row.ip_hash, createHmac("sha256", bindings.SESSION_SECRET).update("crm-ip:" + owner.ip).digest("hex"));
    assert.notEqual(row.ip_hash, owner.ip);
    assert.deepEqual(await db.prepare("SELECT * FROM designs WHERE id=?").bind(design.id).first(), originalDesignRow);
    assert.deepEqual(await db.prepare("SELECT * FROM kitchens WHERE id=?").bind(kitchen.id).first(), originalKitchenRow);
    const retry = await owner.request(input); assert.equal(retry.status, 200); assert.deepEqual(retry.data, response.data);
    assert.equal((await owner.request({ ...input, message: "Otros datos" })).status, 409);
    assert.equal(await count("quote_requests"), 1); assert.equal(await count("quote_request_events"), 1);
  });
  await t.test("only the full MFA session can list/read/update contacts, frozen snapshots and internal notes", async () => {
    for (const client of [owner, stranger, admin]) {
      assert.equal((await client.request(undefined, "/api/store?action=quote-requests")).status, 401);
      assert.equal((await client.request(undefined, `/api/store?action=quote-request&id=${publicReceipt.id}`)).status, 401);
      assert.equal((await client.request({ op: "update-quote-request", id: publicReceipt.id })).status, 401);
    }
    const firstFactor = await admin.request({ op: "login", email, password });
    assert.equal(firstFactor.status, 200, JSON.stringify(firstFactor.data));
    assert.equal((await admin.request(undefined, "/api/store?action=quote-requests")).status, 401, "password challenge alone is not CRM access");
    const secondFactor = await admin.request({ op: "verify-login", method: "totp", code: code() });
    assert.equal(secondFactor.status, 200, JSON.stringify(secondFactor.data));
    const listed = await admin.request(undefined, "/api/store?action=quote-requests");
    assert.equal(listed.status, 200); assert.equal(listed.data.metrics.received, 1);
    assert.equal(listed.data.quoteRequests[0].contact.email, "visitor@example.test");
    const detail = await admin.request(undefined, `/api/store?action=quote-request&id=${publicReceipt.id}`);
    assert.equal(detail.status, 200); adminDetail = detail.data.quoteRequest;
    assert.equal(adminDetail.events.length, 1); assert.equal(adminDetail.events[0].type, "created");
    assert.equal(adminDetail.version, 1); assert.equal(adminDetail.snapshot.items.length, 2);
    assertCommercialOnly(adminDetail.snapshot);
    assert.equal((await admin.request(undefined, "/api/store?action=quote-request&id=%27%20OR%201%3D1")).status, 400);
  });
  await t.test("simultaneous edits use CAS and commit exactly one version/event without mutating commercial data", async () => {
    const update = { op: "update-quote-request", id: publicReceipt.id, version: 1, status: "contacted", assignee: "Equipo sintético", nextFollowUpAt: "2026-01-01T09:00:00-05:00", notes: "Nota interna sintética", lostReason: "" };
    const results = await Promise.all([admin.request(update), admin.request({ ...update, status: "quoted", notes: "Edición competidora" })]);
    assert.deepEqual(results.map(value => value.status).sort(), [200, 409]);
    const conflict = results.find(value => value.status === 409); assert.equal(conflict.data.code, "VERSION_CONFLICT");
    const winner = results.find(value => value.status === 200).data.quoteRequest;
    assert.equal(winner.version, 2); assert.equal(winner.events.length, 2); assert.equal(winner.events[1].version, 2);
    assert.deepEqual(winner.snapshot, adminDetail.snapshot); assert.deepEqual(winner.contact, adminDetail.contact);
    assert.equal((await admin.request({ ...update, version: 2, status: "lost" })).status, 400);
    const lost = await admin.request({ ...update, version: 2, status: "lost", lostReason: "Proyecto suspendido", nextFollowUpAt: null });
    assert.equal(lost.status, 200); assert.equal(lost.data.quoteRequest.events.length, 3);
    assert.equal(lost.data.quoteRequest.status, "lost"); assert.deepEqual(lost.data.quoteRequest.snapshot, adminDetail.snapshot);
    assert.equal((await owner.request(undefined, `/api/store?action=quote-request&id=${publicReceipt.id}`)).status, 401);
  });
  await t.test("current price privacy suppresses all commercial amounts while retaining historical designs", async () => {
    await db.prepare("UPDATE products SET data=?,version=3 WHERE id=?").bind(JSON.stringify({ ...product, showPrice: false }), product.id).run();
    const response = await owner.request(submission([source("design", design), source("kitchen", kitchen)]));
    assert.equal(response.status, 201); assertReceiptOnly(response);
    const detail = await admin.request(undefined, `/api/store?action=quote-request&id=${response.data.quoteRequest.id}`);
    assert.equal(detail.data.quoteRequest.snapshot.totalPrice, null);
    for (const item of detail.data.quoteRequest.snapshot.items) { assert.equal(item.unitPrice, null); assert.equal(item.totalPrice, null); }
    const kitchenItem = detail.data.quoteRequest.snapshot.items[1];
    assert.equal(kitchenItem.furniturePrice, null); assert.equal(kitchenItem.servicesPrice, null);
    assert.ok(kitchenItem.modules.every(module => module.price === null));
    assert.deepEqual(await db.prepare("SELECT * FROM designs WHERE id=?").bind(design.id).first(), originalDesignRow);
    await db.prepare("UPDATE products SET data=?,version=4 WHERE id=?").bind(JSON.stringify(product), product.id).run();
  });
  await t.test("concurrent duplicate creation claims once; retries survive quota exhaustion and later source deletion", async () => {
    const client = new Client(mf, "203.0.113.213"), saved = await client.save(), input = submission([source("design", saved)]);
    const before = await count("quote_requests"), eventsBefore = await count("quote_request_events");
    const results = await Promise.all([client.request(input), client.request(input), client.request(input)]);
    assert.deepEqual(results.map(value => value.status).sort(), [200, 200, 201]);
    assert.equal(new Set(results.map(value => value.data.quoteRequest.id)).size, 1);
    assert.equal(await count("quote_requests"), before + 1); assert.equal(await count("quote_request_events"), eventsBefore + 1);
    const more = await Promise.all(Array.from({ length: 6 }, () => client.request(submission([source("design", saved)]))));
    assert.equal(more.filter(value => value.status === 201).length, 4);
    assert.equal(more.filter(value => value.status === 429).length, 2);
    assert.equal(await count("quote_requests"), before + 5); assert.equal(await count("quote_request_events"), eventsBefore + 5);
    await db.prepare("UPDATE designs SET deleted_at=?,version=version+1 WHERE id=?").bind(new Date().toISOString(), saved.id).run();
    const retry = await client.request(input); assert.equal(retry.status, 200); assert.deepEqual(retry.data, results[0].data);
  });
  await t.test("resetting the owner cookie cannot bypass the shared HMAC IP quota", async () => {
    const ip = "203.0.113.214", ipHash = createHmac("sha256", bindings.SESSION_SECRET).update("crm-ip:" + ip).digest("hex");
    // Fill the quota with synthetic CRM rows directly, not visitor/account data.
    const template = await db.prepare("SELECT * FROM quote_requests LIMIT 1").first();
    const now = new Date().toISOString();
    await db.batch(Array.from({ length: 20 }, () => {
      const id = randomUUID();
      return db.prepare("INSERT INTO quote_requests(id,reference,owner_hash,request_id,payload_hash,ip_hash,contact,snapshot,consent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
        .bind(id, "ISOLATED-" + id, sha256(randomUUID()), randomUUID(), "fixture", ipHash, template.contact, template.snapshot, now, now, now);
    }));
    const client = new Client(mf, ip), saved = await client.save();
    const before = await count("quote_requests");
    const response = await client.request(submission([source("design", saved)]));
    assert.equal(response.status, 429); assert.equal(response.data.code, "RATE_LIMITED");
    assert.equal(await count("quote_requests"), before);
  });
  await t.test("the full twenty-source contract remains inside the D1 parameter budget", async () => {
    const client = new Client(mf, "203.0.113.215"), token = randomUUID();
    client.cookies.set("alrazz_design_owner", token);
    const sources = Array.from({ length: 20 }, () => ({ kind: "design", id: randomUUID(), version: 1 }));
    await db.batch(sources.map(value => db.prepare("INSERT INTO designs(id,owner_hash,snapshot,name,quantity,version,created_at) VALUES(?,?,?,?,?,1,?)")
      .bind(value.id, sha256(token), originalDesignRow.snapshot, "Diseño múltiple sintético", 3, new Date().toISOString())));
    const response = await client.request(submission(sources));
    assert.equal(response.status, 201, JSON.stringify(response.data)); assertReceiptOnly(response);
    const stored = await db.prepare("SELECT snapshot FROM quote_requests WHERE id=?").bind(response.data.quoteRequest.id).first();
    const snapshot = JSON.parse(stored.snapshot);
    assert.equal(snapshot.items.length, 20);
    assert.equal(snapshot.totalPrice, Math.round(design.price * 3 * 20 * 100) / 100);
    assertCommercialOnly(snapshot);
  });
  await t.test("server filters and stable cursors reach an old overdue request beyond the first two hundred rows", async () => {
    const template = await db.prepare("SELECT * FROM quote_requests LIMIT 1").first();
    const prefix = "crm-pagination-fixture", fixtures = Array.from({ length: 206 }, (_, index) => ({
      id: randomUUID(), name: prefix + " " + index + (index === 205 ? " %_\\ literal" : ""),
      updated: index === 205 ? "2000-01-01T00:00:00.000Z" : "2000-01-02T00:00:00.000Z",
      status: index === 205 ? "quoted" : "received", followUp: index === 205 ? "2000-01-01T00:00:00.000Z" : null,
    }));
    const totalBefore = await count("quote_requests");
    await db.batch(fixtures.map(value => db.prepare("INSERT INTO quote_requests(id,reference,owner_hash,request_id,payload_hash,ip_hash,contact,snapshot,consent_at,created_at,updated_at,status,next_follow_up_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(value.id, "PAGE-" + value.id, sha256("pagination-fixture-owner"), randomUUID(), "fixture", sha256("pagination-fixture-ip"),
        JSON.stringify({ ...JSON.parse(template.contact), name: value.name }), template.snapshot, value.updated, value.updated, value.updated, value.status, value.followUp)));
    const url = query => "/api/store?" + new URLSearchParams({ action: "quote-requests", ...query });
    try {
      assert.equal((await owner.request(undefined, url({ q: prefix, overdue: "true", cursor: "invalid" }))).status, 401, "authenticate before decoding private filters");
      const first = await admin.request(undefined, url({ q: prefix }));
      assert.equal(first.status, 200, JSON.stringify(first.data));
      assert.equal(first.data.quoteRequests.length, 50); assert.equal(first.data.matchingCount, 206);
      assert.equal(first.data.metrics.total, totalBefore + 206, "global metrics do not change with server filters");
      assert.ok(first.data.nextCursor);
      const seen = [...first.data.quoteRequests];
      let cursor = first.data.nextCursor;
      while (cursor) {
        const page = await admin.request(undefined, url({ q: prefix, cursor, limit: "100" }));
        assert.equal(page.status, 200, JSON.stringify(page.data)); assert.equal(page.data.matchingCount, 206);
        assert.ok(page.data.quoteRequests.length <= 100); seen.push(...page.data.quoteRequests); cursor = page.data.nextCursor;
      }
      assert.equal(seen.length, 206); assert.equal(new Set(seen.map(value => value.id)).size, 206);
      const expected = [...fixtures].sort((left, right) => right.updated.localeCompare(left.updated) || right.id.localeCompare(left.id));
      assert.deepEqual(seen.map(value => value.id), expected.map(value => value.id), "equal update times are ordered by UUID without duplicate/omitted rows");
      assert.equal(seen.at(-1).id, fixtures[205].id);
      for (const filters of [{ q: prefix, overdue: "true" }, { q: prefix, status: "quoted" }, { q: "%_\\" }]) {
        const result = await admin.request(undefined, url(filters));
        assert.equal(result.status, 200, JSON.stringify(result.data)); assert.equal(result.data.matchingCount, 1);
        assert.deepEqual(result.data.quoteRequests.map(value => value.id), [fixtures[205].id]); assert.equal(result.data.nextCursor, null);
      }
      const noMatch = await admin.request(undefined, url({ q: "' OR 1=1 --" }));
      assert.equal(noMatch.status, 200); assert.equal(noMatch.data.matchingCount, 0); assert.deepEqual(noMatch.data.quoteRequests, []);
      const decoded = JSON.parse(Buffer.from(first.data.nextCursor, "base64url").toString());
      const invalidCursors = ["invalid", Buffer.from(JSON.stringify({ ...decoded, updated: "Infinity" })).toString("base64url"),
        Buffer.from(JSON.stringify({ ...decoded, asOf: "2026-13-01T00:00:00.000Z" })).toString("base64url"),
        Buffer.from(JSON.stringify({ ...decoded, id: "' OR 1=1 --" })).toString("base64url"),
        Buffer.from(JSON.stringify({ ...decoded, extra: true })).toString("base64url")];
      for (const invalid of invalidCursors) {
        const result = await admin.request(undefined, url({ q: prefix, cursor: invalid }));
        assert.equal(result.status, 400); assert.equal(result.data.code, "INVALID_CURSOR");
      }
      const changedFilters = await admin.request(undefined, url({ q: prefix, status: "quoted", cursor: first.data.nextCursor }));
      assert.equal(changedFilters.status, 400); assert.equal(changedFilters.data.code, "INVALID_CURSOR");
      for (const filters of [{ limit: "101" }, { limit: "0" }, { status: "paid" }, { overdue: "1" }, { q: "q".repeat(121) }]) {
        const result = await admin.request(undefined, url(filters)); assert.equal(result.status, 400); assert.equal(result.data.code, "INVALID_FILTERS");
      }
      assert.equal(await count("quote_requests"), totalBefore + 206, "search and pagination never write CRM records");
    } finally {
      await db.batch(fixtures.map(value => db.prepare("DELETE FROM quote_requests WHERE id=?").bind(value.id)));
    }
    assert.equal(await count("quote_requests"), totalBefore, "only the exact ephemeral pagination fixture IDs are cleaned up");
  });
  await t.test("commercial versions preserve an exact public design, require explicit current-version consent and never expose CRM contacts", async () => {
    const client = new Client(mf, "203.0.113.216"), saved = await client.save();
    const lPlan = { ...plan, layout: "l", items: [plan.items[0], { ...plan.items[0], id: "crm-module-b", wall: "b" }] };
    const kitchenResponse = await client.request({ op: "save-kitchen", plan: lPlan, name: "Etiqueta privada de la cocina" });
    assert.equal(kitchenResponse.status, 201, JSON.stringify(kitchenResponse.data));
    const sourceKitchen = kitchenResponse.data.kitchen;
    const created = await client.request({ ...submission([source("design", saved), source("kitchen", sourceKitchen)]), name: "Nombre privado no publicable", message: "Mensaje interno no publicable" });
    assert.equal(created.status, 201);
    const id = created.data.quoteRequest.id;
    const original = await db.prepare("SELECT snapshot FROM quote_requests WHERE id=?").bind(id).first();
    const snapshot = JSON.parse(original.snapshot);
    assert.deepEqual(snapshot.items[0].preview.geometry, saved.result.geometry);
    assert.deepEqual(snapshot.items[1].preview.geometry, sourceKitchen.result.geometry);
    const issue = { op: "issue-commercial-quote", id, version: 1, requestId: randomUUID(), title: "Propuesta sintética revisable", currency: "PEN", lines: [{ description: "Muebles sintéticos", quantity: 3, unitPrice: 100.15 }, { description: "Composición de cocina", quantity: 1, unitPrice: 500 }], terms: "Alcance sintético. Plazos y condiciones de prueba; no es un pago.", services: { installation: true, transport: false }, validUntil: new Date(Date.now() + 7 * 86400000).toISOString() };
    assert.equal((await client.request(issue)).status, 401);
    assert.equal((await client.request(undefined, `/api/store?action=commercial-quotes&id=${id}`)).status, 401);
    const issued = await Promise.all([admin.request(issue), admin.request(issue)]);
    assert.deepEqual(issued.map(value => value.status).sort(), [200, 201]);
    const first = issued[0].data.commercialQuotes[0];
    assert.equal(first.document.total, 800.45); assert.equal(first.version, 1);
    assert.equal(issued[0].data.commercialQuotes.length, 1); assert.equal(issued[0].data.requestVersion, 2);
    assert.equal(issued[1].data.commercialQuotes[0].link, first.link, "idempotent emission can recover the same authorized link without plaintext token storage");
    assert.equal((await admin.request({ ...issue, terms: issue.terms + " Distinto." })).status, 409);
    const token = new URL(first.link).hash.slice(1);
    assert.equal(new URL(first.link).search, ""); assert.equal(new URL(first.link).pathname, "/cotizacion");
    const privateVersion = await db.prepare("SELECT * FROM commercial_quote_versions WHERE id=?").bind(first.id).first();
    assert.equal(privateVersion.token_hash, sha256(token)); assert.notEqual(privateVersion.token_nonce, token);
    assert.equal(JSON.stringify(privateVersion).includes(token), false, "the token/link is not persisted in plaintext");
    const view = await stranger.request({ op: "view-commercial-quote", token });
    assert.equal(view.status, 200); assert.equal(view.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
    assert.equal(view.headers.get("referrer-policy"), "no-referrer");
    assertCommercialOnly(view.data.quote.document);
    for (const forbidden of ["Nombre privado no publicable", "Mensaje interno no publicable", "visitor@example.test", "customerMessage", "token_hash", "token_nonce", "owner_hash", "api-fixture-isolated"])
      assert.equal(JSON.stringify(view.data).includes(forbidden), false, forbidden);
    assert.deepEqual(view.data.quote.document.specifications[0].config, saved.config);
    assert.deepEqual(view.data.quote.document.specifications[0].preview.geometry, saved.result.geometry);
    assert.deepEqual(view.data.quote.document.specifications[1].modules.map(value => value.wall), ["a", "b"]);
    assert.deepEqual(view.data.quote.document.services, { installation: true, transport: false });
    assert.equal((await stranger.request({ op: "view-commercial-quote", token: "z".repeat(43) })).status, 404);
    const accept = { op: "respond-commercial-quote", token, id: first.id, version: 1, requestId: randomUUID(), decision: "accept", consent: true };
    assert.equal((await stranger.request({ ...accept, consent: false })).status, 400);
    assert.equal((await stranger.request({ ...accept, version: 2 })).status, 409);
    const secondIssued = await admin.request({ ...issue, version: 2, requestId: randomUUID(), terms: issue.terms + " Revisión 2." });
    assert.equal(secondIssued.status, 201, JSON.stringify(secondIssued.data));
    const second = secondIssued.data.commercialQuotes[0], secondToken = new URL(second.link).hash.slice(1);
    assert.equal((await stranger.request(accept)).status, 409, "a replaced version cannot be accepted");
    assert.equal((await stranger.request({ op: "view-commercial-quote", token })).data.quote.status, "superseded");
    const changes = { op: "respond-commercial-quote", token: secondToken, id: second.id, version: 2, requestId: randomUUID(), decision: "changes", message: "Cambiar el acabado sintético, por favor." };
    const changed = await stranger.request(changes); assert.equal(changed.status, 200);
    assert.deepEqual((await stranger.request(changes)).data, changed.data);
    assert.equal((await stranger.request({ ...changes, message: "Otros cambios" })).status, 409);
    assert.equal((await stranger.request({ op: "view-commercial-quote", token: secondToken })).data.quote.customerMessage, undefined);
    const detail = (await admin.request(undefined, `/api/store?action=quote-request&id=${id}`)).data.quoteRequest;
    assert.equal(detail.nextAction, null, "customer changes do not invent a responsible person or due date"); assert.equal(detail.status, "contacted");
    const note = await admin.request({ op: "update-quote-request", id, version: detail.version, status: "contacted", assignee: "", nextFollowUpAt: null, nextAction: null, notes: "Revisión pendiente de asignación.", lostReason: "" });
    assert.equal(note.status, 200, "an unassigned change request must not block ordinary CRM notes");
    const thirdIssued = await admin.request({ ...issue, version: note.data.quoteRequest.version, requestId: randomUUID(), terms: issue.terms + " Revisión final." });
    assert.equal(thirdIssued.status, 201);
    const third = thirdIssued.data.commercialQuotes[0], thirdToken = new URL(third.link).hash.slice(1);
    const finalAccept = { ...accept, token: thirdToken, id: third.id, version: 3, requestId: randomUUID() };
    const responses = await Promise.all([stranger.request(finalAccept), stranger.request(finalAccept), stranger.request(finalAccept)]);
    assert.ok(responses.every(value => value.status === 200)); assert.deepEqual(responses[0].data, responses[1].data);
    assert.deepEqual(Object.keys(responses[0].data.response).sort(), ["decision", "id", "respondedAt", "version"]);
    const after = (await admin.request(undefined, `/api/store?action=quote-request&id=${id}`)).data.quoteRequest;
    assert.equal(after.status, "accepted"); assert.equal(after.events.filter(event => event.type === "customer_accepted").length, 1);
    assert.equal((await stranger.request({ ...finalAccept, requestId: randomUUID() })).status, 409);
    assert.equal((await admin.request({ ...issue, version: after.version, requestId: randomUUID() })).status, 409, "accepted commercial documents cannot be silently replaced");
    assert.deepEqual(await db.prepare("SELECT snapshot FROM quote_requests WHERE id=?").bind(id).first(), original);
    assert.equal((await db.prepare("SELECT document FROM commercial_quote_versions WHERE id=?").bind(first.id).first()).document, privateVersion.document);
    await db.prepare("UPDATE commercial_quote_versions SET token_nonce=? WHERE id=?").bind("security-rotation-synthetic", third.id).run();
    assert.equal((await stranger.request({ op: "view-commercial-quote", token: thirdToken })).status, 404, "a token must still match the configured secret/nonce, not only a database hash");
  });
  await t.test("expiry and historical CRM records never trigger a new geometry calculation", async () => {
    const client = new Client(mf, "203.0.113.217"), saved = await client.save();
    const created = await client.request(submission([source("design", saved)])), id = created.data.quoteRequest.id;
    const row = await db.prepare("SELECT snapshot FROM quote_requests WHERE id=?").bind(id).first();
    const snapshot = JSON.parse(row.snapshot); delete snapshot.items[0].preview;
    await db.prepare("UPDATE quote_requests SET snapshot=? WHERE id=?").bind(JSON.stringify(snapshot), id).run();
    const issue = { op: "issue-commercial-quote", id, version: 1, requestId: randomUUID(), title: "Propuesta histórica sintética", currency: "PEN", lines: [{ description: "Mueble sintético", quantity: 1, unitPrice: 300 }], terms: "Condiciones sintéticas para un registro histórico.", services: { installation: false, transport: false }, validUntil: new Date(Date.now() + 86400000).toISOString() };
    const issued = await admin.request(issue); assert.equal(issued.status, 201);
    const quote = issued.data.commercialQuotes[0], token = new URL(quote.link).hash.slice(1);
    assert.equal(quote.document.specifications[0].preview, undefined, "missing historical views are not rebuilt from today's catalogue");
    assert.deepEqual(quote.document.specifications[0].config, saved.config);
    await db.prepare("UPDATE commercial_quote_versions SET valid_until='2000-01-01T00:00:00.000Z' WHERE id=?").bind(quote.id).run();
    assert.equal((await stranger.request({ op: "view-commercial-quote", token })).data.quote.status, "expired");
    const before = await count("quote_request_events");
    assert.equal((await stranger.request({ op: "respond-commercial-quote", token, id: quote.id, version: 1, requestId: randomUUID(), decision: "accept", consent: true })).status, 410);
    assert.equal(await count("quote_request_events"), before);
  });
  await t.test("action agenda and period metrics count real completions/customer decisions separately from manual acceptance", async () => {
    const today = new Date().toISOString().slice(0, 10), metricsPath = `/api/store?action=crm-metrics&from=${today}&to=${today}`;
    assert.equal((await owner.request(undefined, metricsPath)).status, 401);
    assert.equal((await owner.request(undefined, "/api/store?action=crm-agenda")).status, 401);
    const baseline = (await admin.request(undefined, metricsPath)).data.metrics;
    assert.equal(baseline.customerAcceptances, 1); assert.equal(baseline.changeRequests, 1); assert.equal(baseline.quoteVersionsIssued, 4);
    assert.equal(baseline.commercialAcceptedAmount, 800.45); assert.ok(baseline.cohortConversionRate >= 0 && baseline.cohortConversionRate <= 1);
    const client = new Client(mf, "203.0.113.218"), saved = await client.save();
    const created = await client.request(submission([source("design", saved)])), id = created.data.quoteRequest.id;
    const update = { op: "update-quote-request", id, version: 1, status: "contacted", assignee: "Equipo sintético de agenda", nextFollowUpAt: new Date(Date.now() - 86400000).toISOString(), nextAction: "call", notes: "Nota privada", lostReason: "" };
    assert.equal((await admin.request({ ...update, assignee: "" })).status, 400);
    const scheduled = await admin.request(update); assert.equal(scheduled.status, 200);
    const agenda = await admin.request(undefined, "/api/store?action=crm-agenda&" + new URLSearchParams({ from: today, to: today, assignee: update.assignee, includeOverdue: "true" }));
    assert.equal(agenda.status, 200); assert.equal(agenda.data.matchingCount, 1); assert.equal(agenda.data.items[0].nextAction, "call"); assert.equal(agenda.data.items[0].overdue, true);
    const complete = { op: "complete-quote-action", id, version: 2, requestId: randomUUID(), outcome: "Llamada sintética completada." };
    assert.equal((await owner.request(complete)).status, 401);
    const results = await Promise.all([admin.request(complete), admin.request(complete)]);
    assert.ok(results.every(value => value.status === 200));
    assert.equal(results[0].data.quoteRequest.nextFollowUpAt, null); assert.equal(results[0].data.quoteRequest.nextAction, null);
    assert.equal(results[0].data.quoteRequest.events.filter(event => event.type === "action_completed").length, 1);
    const rescheduled = await admin.request({ ...update, version: 3, nextAction: "visit", nextFollowUpAt: new Date(Date.now() + 86400000).toISOString() });
    assert.equal(rescheduled.status, 200);
    const retry = await admin.request(complete); assert.equal(retry.status, 200);
    assert.equal(retry.data.quoteRequest.nextAction, "visit", "retrying the previous completion cannot clear a newer scheduled action");
    const manual = await admin.request({ ...update, version: 4, status: "accepted", nextAction: null, nextFollowUpAt: null }); assert.equal(manual.status, 200);
    const metrics = (await admin.request(undefined, metricsPath)).data.metrics;
    assert.equal(metrics.customerAcceptances, baseline.customerAcceptances, "manual acceptance never fabricates a customer decision/payment");
    assert.equal(metrics.manualAcceptances, baseline.manualAcceptances + 1); assert.equal(metrics.actionsCompleted, baseline.actionsCompleted + 1);
    assert.equal(metrics.commercialAcceptedAmount, baseline.commercialAcceptedAmount);
    const period2000 = await admin.request(undefined, "/api/store?action=crm-metrics&from=2000-01-01&to=2000-01-02");
    assert.equal(period2000.data.metrics.customerAcceptances, 0); assert.equal(period2000.data.metrics.actionsCompleted, 0);
    assert.equal((await admin.request(undefined, "/api/store?action=crm-metrics&from=2026-02-31&to=2026-03-01")).status, 400);
    assert.equal((await admin.request(undefined, "/api/store?action=crm-metrics&from=2000-01-01&to=2026-01-01")).status, 400);
  });
});
