import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Miniflare, createFetchMock, fetch as mockFetch } from "miniflare";
import { defaultSettings } from "../lib/furniture.ts";
import { productTemplate } from "../lib/product-templates.ts";

// Compiled Worker + ephemeral D1 only. Never load .dev.vars, credentials,
// .wrangler persistence, customer fixtures, a localhost server or the network.
const origin = "https://alrazz-kitchen-fit.example.test";
const settings = structuredClone(defaultSettings);
const activeMaterials = settings.materials.filter(material => material.active);
assert.ok(activeMaterials.length >= 2, "isolated geometry fixtures need two distinct finishes");
const base = {
  ...productTemplate("kitchen-base"), id: "fit-api-base", name: "Base de prueba", active: true,
  pricing: { basis: "unit", amount: 100 },
};
base.defaults = { ...base.defaults, finish: activeMaterials[0].id, interior: "same" };
const upper = {
  ...productTemplate("cabinet"), id: "fit-api-upper", name: "Alacena de prueba", category: "Cocina", active: true,
  pricing: { basis: "unit", amount: 200 },
  limits: { width: { min: 300, max: 1200 }, height: { min: 500, max: 1000 }, depth: { min: 250, max: 450 } },
  defaults: { ...base.defaults, width: 600, height: 700, depth: 300, modules: 1 },
};
const tall = {
  ...productTemplate("cabinet"), id: "fit-api-tall", name: "Columna de prueba", category: "Cocina", active: true,
  pricing: { basis: "unit", amount: 300 },
  limits: { width: { min: 400, max: 1200 }, height: { min: 1600, max: 2200 }, depth: { min: 500, max: 650 } },
  defaults: { ...base.defaults, width: 600, height: 2000, depth: 600, shelves: 3, modules: 1, doors: "none" },
};
const products = [base, upper, tall];
const furniture = (id, product, row = "base", overrides = {}) => ({ id, kind: "furniture", wall: "a", row, productId: product.id, config: { ...product.defaults, ...overrides } });
const makePlan = items => ({ layout: "straight", walls: { a: 3000, b: 2400 }, roomHeight: 2700, wallElevation: 1500, install: false, transport: false, items });
const space = { id: "air-50", kind: "space", wall: "a", row: "base", width: 50, height: 900, depth: 600 };
const spacedPlan = makePlan([
  furniture("left", base), space,
  furniture("right", base, "base", { finish: activeMaterials[1].id }),
]);

class Client {
  constructor(mf) { this.mf = mf; this.cookies = new Map(); }
  async request(path, data) {
    const response = await this.mf.dispatchFetch(origin + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        ...(data === undefined ? {} : { "Content-Type": "application/json", Origin: origin }),
        Cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
        "CF-Connecting-IP": "203.0.113.170",
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(";")[0], equal = pair.indexOf("=");
      const name = pair.slice(0, equal), token = pair.slice(equal + 1);
      if (token) this.cookies.set(name, token); else this.cookies.delete(name);
    }
    return { status: response.status, data: await response.json() };
  }
  quote(plan) { return this.request("/api/kitchen-quote", { plan }); }
  save(plan, name = "Cocina de prueba aislada") { return this.request("/api/store", { op: "save-kitchen", plan, name, price: 1 }); }
}

function publicOnly(value) {
  const privateKeys = new Set(["snapshot", "owner_hash", "settings", "basePrice", "amount", "panels", "fixtures", "accessories", "breakdown", "unitCost", "cost", "materialRate", "margin"]);
  const visit = node => {
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      assert.equal(privateKeys.has(key), false, `public preflight exposes ${key}`);
      visit(child);
    }
  };
  visit(value);
}

test("isolated kitchen preflight validates exact spacing and collisions before any draft is stored", async t => {
  const fetchMock = createFetchMock();
  fetchMock.disableNetConnect();
  const mf = new Miniflare({
    modules: true,
    scriptPath: fileURLToPath(new URL("../dist/alrazz/index.js", import.meta.url)),
    compatibilityDate: "2026-05-22", compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "isolated-kitchen-fit-in-memory" }, d1Persist: false,
    durableObjectsPersist: false, kvPersist: false, cachePersist: false,
    outboundService: request => mockFetch(request, { dispatcher: fetchMock, redirect: "manual" }),
  });
  t.after(async () => { try { await mf.dispose(); } finally { await fetchMock.close(); } });
  const db = await mf.getD1Database("DB");
  const migrationDirectory = new URL("../migrations/", import.meta.url);
  for (const filename of (await readdir(migrationDirectory)).filter(name => name.endsWith(".sql")).sort()) {
    const sql = await readFile(new URL(filename, migrationDirectory), "utf8");
    const statements = sql.replace(/^\s*--.*$/gm, "").split(";").map(statement => statement.trim()).filter(Boolean);
    await db.batch(statements.map(statement => db.prepare(statement)));
  }
  await db.batch([
    db.prepare("INSERT INTO settings(id,data,version) VALUES('initialized','true',1)"),
    db.prepare("INSERT INTO settings(id,data,version) VALUES('business',?,1)").bind(JSON.stringify(settings)),
    ...products.map(product => db.prepare("INSERT INTO products(id,data,version,active) VALUES(?,?,1,1)").bind(product.id, JSON.stringify(product))),
  ]);
  const client = new Client(mf);
  const snapshotTables = async () => {
    const snapshot = {};
    for (const table of ["products", "settings", "kitchens", "designs"])
      snapshot[table] = (await db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()).results;
    return snapshot;
  };

  await t.test("a 50 mm space retains exact geometry, moves only the expected neighbour offset and adds no charge", async () => {
    const before = await snapshotTables();
    const withAir = await client.quote(spacedPlan);
    assert.equal(withAir.status, 200, JSON.stringify(withAir.data));
    const withoutAir = await client.quote({ ...spacedPlan, items: spacedPlan.items.filter(item => item.kind !== "space") });
    assert.equal(withoutAir.status, 200);
    assert.equal(withAir.data.plan.items[1].width, 50);
    const air = withAir.data.modules.find(module => module.id === "air-50");
    assert.deepEqual(air.size, [50, 900, 600]);
    assert.equal(air.kind, "space");
    assert.equal(air.price, 0);
    assert.equal(withAir.data.price, withoutAir.data.price);
    assert.equal(withAir.data.servicesPrice, 0);
    assert.equal(withAir.data.geometry.length, withoutAir.data.geometry.length);
    const rightPanels = quote => quote.geometry.filter(panel => panel.material === activeMaterials[1].id);
    const spaced = rightPanels(withAir.data), unspaced = rightPanels(withoutAir.data);
    assert.ok(spaced.length > 0);
    assert.equal(spaced.length, unspaced.length);
    for (let index = 0; index < spaced.length; index++) {
      assert.deepEqual(spaced[index].size, unspaced[index].size);
      assert.equal(spaced[index].position[0] + withAir.data.envelope.width / 2, unspaced[index].position[0] + withoutAir.data.envelope.width / 2 + 50);
      assert.deepEqual(spaced[index].position.slice(1), unspaced[index].position.slice(1));
    }
    publicOnly(withAir.data);
    assert.deepEqual(await snapshotTables(), before, "preflight is read-only even when it succeeds");
  });

  await t.test("tall/upper overlap and wall overflow fail both preflight and saving without mutating D1", async () => {
    const overlap = makePlan([furniture("tall", tall, "tall"), furniture("upper", upper, "wall")]);
    const overflow = { ...spacedPlan, walls: { a: 1000, b: 2400 } };
    for (const [plan, message] of [[overlap, /cruza/i], [overflow, /superan su longitud/i]]) {
      const before = await snapshotTables();
      const preflight = await client.quote(plan);
      assert.equal(preflight.status, 400, JSON.stringify(preflight.data));
      assert.match(preflight.data.error, message);
      assert.equal((await client.save(plan)).status, 400);
      assert.deepEqual(await snapshotTables(), before);
    }
    const reservedAppliance = makePlan([furniture("base", base), { ...space, kind: "fridge", row: "tall" }]);
    const before = await snapshotTables();
    assert.equal((await client.quote(reservedAppliance)).status, 400, "50 mm is an air gap, never a valid appliance reservation");
    assert.deepEqual(await snapshotTables(), before);
  });

  await t.test("a valid saved kitchen keeps its original snapshot after fixture tariffs change", async () => {
    const originalQuote = await client.quote(spacedPlan);
    assert.equal(originalQuote.status, 200);
    const saved = await client.save(spacedPlan);
    assert.equal(saved.status, 201, JSON.stringify(saved.data));
    publicOnly(saved.data);
    assert.deepEqual(saved.data.kitchen.result, originalQuote.data);
    assert.notEqual(saved.data.kitchen.result.price, 1, "the server ignores a visitor-supplied price");
    const id = saved.data.kitchen.id;
    const originalRow = await db.prepare("SELECT snapshot,version FROM kitchens WHERE id=?").bind(id).first();
    const changed = { ...base, version: 2, pricing: { basis: "unit", amount: 900 } };
    await db.prepare("UPDATE products SET data=?,version=2 WHERE id=?").bind(JSON.stringify(changed), base.id).run();
    const fresh = await client.quote(spacedPlan);
    assert.equal(fresh.status, 200);
    assert.ok(fresh.data.price > originalQuote.data.price);
    const shared = await client.request(`/api/store?action=kitchen&id=${encodeURIComponent(id)}`);
    assert.equal(shared.status, 200);
    assert.deepEqual(shared.data.kitchen, saved.data.kitchen);
    assert.deepEqual(await db.prepare("SELECT snapshot,version FROM kitchens WHERE id=?").bind(id).first(), originalRow);
    const listing = await client.request("/api/store?action=kitchens");
    assert.equal(listing.status, 200);
    assert.deepEqual(listing.data.kitchens.find(kitchen => kitchen.id === id), saved.data.kitchen);
    assert.equal((await db.prepare("SELECT count(*) AS n FROM kitchens").first()).n, 1);
  });
});
