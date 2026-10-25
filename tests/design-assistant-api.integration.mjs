import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Miniflare, createFetchMock, fetch as mockFetch } from "miniflare";
import { defaultSettings } from "../lib/furniture.ts";
import { productTemplate } from "../lib/product-templates.ts";

// Only the compiled Worker and ephemeral, synthetic D1 fixtures are used. No
// .dev.vars, .wrangler persistence, real accounts, local server or network.
const origin = "https://alrazz-assistant.example.test";
const settings = structuredClone(defaultSettings);
const material = settings.materials.find(entry => entry.active);
assert.ok(material);
settings.materials.push({ ...material, id: "assistant-inactive-finish", name: "Acabado inactivo de prueba", active: false });
const fixture = (kind, id, overrides = {}) => {
  const template = productTemplate(kind);
  return { ...template, id, name: `Modelo de prueba ${id}`, active: true,
    defaults: { ...template.defaults, finish: material.id, interior: "same" },
    pricing: { basis: "unit", amount: 320 }, ...overrides };
};
const storage = fixture("cabinet", "assistant-api-storage");
const hidden = fixture("wardrobe", "assistant-api-hidden", { showPrice: false, pricing: { basis: "unit", amount: 73173 } });
const inactive = fixture("wardrobe", "assistant-api-inactive", { active: false, pricing: { basis: "unit", amount: 1 } });
const base = fixture("kitchen-base", "assistant-api-base", { pricing: { basis: "unit", amount: 200 } });
const upper = fixture("cabinet", "assistant-api-upper", {
  category: "Cocina", pricing: { basis: "unit", amount: 100 },
  limits: { width: { min: 300, max: 1200 }, height: { min: 500, max: 1000 }, depth: { min: 250, max: 450 } },
  defaults: { ...base.defaults, width: 600, height: 700, depth: 300, modules: 1 },
});
const products = [storage, hidden, inactive, base, upper];
const input = extra => ({ purpose: "storage", width: 1900, height: 2400, depth: 600, ...extra });
function publicOnly(value) {
  const denied = new Set(["snapshot", "owner_hash", "settings", "basePrice", "amount", "panels", "fixtures", "accessories", "breakdown", "unitCost", "cost", "materialRate", "edgeRate", "doorHardware", "margin"]);
  const visit = node => {
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      assert.equal(denied.has(key), false, `public assistant exposes ${key}`);
      visit(child);
    }
  };
  visit(value);
}

test("isolated public assistant validates real recommendations without exposing tariffs or writing drafts", async t => {
  const fetchMock = createFetchMock();
  fetchMock.disableNetConnect();
  const mf = new Miniflare({
    modules: true, scriptPath: fileURLToPath(new URL("../dist/alrazz/index.js", import.meta.url)),
    compatibilityDate: "2026-05-22", compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "isolated-design-assistant-in-memory" }, d1Persist: false,
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
    ...products.map(product => db.prepare("INSERT INTO products(id,data,version,active) VALUES(?,?,1,?)").bind(product.id, JSON.stringify(product), Number(product.active))),
  ]);
  const post = async (path, body) => {
    const response = await mf.dispatchFetch(origin + path, { method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin, "CF-Connecting-IP": "203.0.113.173" },
      body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  const recommend = selection => post("/api/store", { op: "design-assistant", input: selection });
  const snapshot = async () => {
    const state = {};
    for (const table of ["products", "settings", "designs", "kitchens", "quote_requests"])
      state[table] = (await db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()).results;
    return state;
  };
  const original = await snapshot();

  await t.test("public furniture options match authoritative quotes and include only active published models", async () => {
    const response = await recommend(input({ budget: 500, install: true, transport: true }));
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.ok(response.data.options.length > 0 && response.data.options.length <= 3);
    for (const option of response.data.options) {
      assert.equal(option.kind, "furniture");
      assert.notEqual(option.product.id, inactive.id);
      assert.equal(option.product.active, true);
      assert.ok(option.config.width <= 1900 && option.config.height <= 2400 && option.config.depth <= 600);
      assert.equal(option.config.install, true);
      assert.equal(option.config.transport, true);
      const quote = await post("/api/quote", { productId: option.product.id, config: option.config });
      assert.equal(quote.status, 200);
      assert.equal(option.price, quote.data.price);
      assert.deepEqual(option.product.preview, quote.data);
      assert.equal(option.withinBudget, option.price <= 500);
    }
    publicOnly(response.data);
    assert.deepEqual(await snapshot(), original, "recommendations and quotes are read-only");
  });

  await t.test("hidden selling rates never become a price or an assertion that a budget is met", async () => {
    const response = await recommend(input({ purpose: "wardrobe", budget: 1 }));
    assert.equal(response.status, 200);
    assert.ok(response.data.options.length > 0);
    assert.equal(response.data.budgetState, "quote-required");
    for (const option of response.data.options) {
      assert.equal(option.product.id, hidden.id);
      assert.equal(option.price, null);
      assert.equal(option.withinBudget, null);
      assert.equal(option.budgetState, "quote-required");
      assert.equal(option.product.publicPrice, null);
      assert.equal(option.product.preview.price, null);
    }
    assert.equal(JSON.stringify(response.data).includes("73173"), false);
    publicOnly(response.data);
    assert.deepEqual(await snapshot(), original);
  });

  await t.test("strict measurements, active finishes, explicit second walls and request shape are validated", async () => {
    for (const selection of [input({ width: 1901 }), input({ width: "1900" }), input({ budget: -1 }), input({ finish: "assistant-inactive-finish" }), input({ extra: "=1+1" }), input({ purpose: "kitchen", layout: "l", height: 2700 })]) {
      const response = await recommend(selection);
      assert.equal(response.status, 400, JSON.stringify(response.data));
      assert.equal(response.data.code, "VALIDATION_ERROR");
    }
    assert.equal((await post("/api/store", { op: "design-assistant", input: input(), config: {} })).status, 400);
    assert.deepEqual(await snapshot(), original, "rejected requests do not mutate any persisted table");
  });

  await t.test("L plans use the declared walls and pass the ordinary kitchen preflight with the same price", async () => {
    const response = await recommend(input({ purpose: "kitchen", layout: "l", width: 3000, wallB: 2400, height: 2700, budget: 1 }));
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.options.length, 3);
    assert.equal(response.data.budgetState, "over");
    for (const option of response.data.options) {
      assert.equal(option.kind, "kitchen");
      assert.deepEqual(option.plan.walls, { a: 3000, b: 2400 });
      assert.ok(option.plan.items.some(item => item.wall === "b"));
      assert.ok(option.plan.items.every(item => item.kind === "furniture"));
      const quote = await post("/api/kitchen-quote", { plan: option.plan });
      assert.equal(quote.status, 200, JSON.stringify(quote.data));
      assert.deepEqual(option.result, quote.data);
      assert.equal(option.price, quote.data.price);
      assert.equal(option.withinBudget, false);
    }
    publicOnly(response.data);
    assert.deepEqual(await snapshot(), original);
  });
});
