import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { totp } from "../lib/admin-crypto.ts";
import { productTemplate } from "../lib/product-templates.ts";

const base = process.env.API_TEST_URL || "http://127.0.0.1:5173";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname)) throw new Error("Las pruebas de cocina solo escriben en localhost.");
const localVars = await readFile(new URL("../.dev.vars", import.meta.url), "utf8");
const value = (key) => {
  const raw = localVars.split(/\r?\n/).find((line) => line.startsWith(key + "="))?.slice(key.length + 1);
  return raw?.startsWith('"') ? JSON.parse(raw) : raw;
};
const credentials = await readFile(new URL("../.admin-credentials.txt", import.meta.url), "utf8");
const password = process.env.ADMIN_PASSWORD || /^Contraseña: (.+)$/m.exec(credentials)?.[1];
const email = value("ADMIN_EMAIL"), secret = value("ADMIN_TOTP_SECRET");
class Client {
  constructor(ip) { this.ip = ip; this.cookies = new Map(); }
  async request(path, data, extraHeaders = {}) {
    const response = await fetch(base + path, {
      method: data === undefined ? "GET" : "POST",
      headers: { ...(data === undefined ? {} : { "Content-Type": "application/json", Origin: base }), Cookie: [...this.cookies].map(([key, val]) => `${key}=${val}`).join("; "), "CF-Connecting-IP": this.ip, ...extraHeaders },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    for (const entry of response.headers.getSetCookie()) {
      const pair = entry.split(";")[0], position = pair.indexOf("=");
      this.cookies.set(pair.slice(0, position), pair.slice(position + 1));
    }
    return { status: response.status, data: await response.json() };
  }
  get(action) { return this.request("/api/store?action=" + action); }
  post(data) { return this.request("/api/store", data); }
  quote(plan) { return this.request("/api/kitchen-quote", { plan }); }
}
function publicOnly(object) {
  const denied = new Set(["snapshot", "owner_hash", "settings", "basePrice", "amount", "panels", "fixtures", "accessories", "breakdown", "frontRates", "unitCost", "cost", "materialRate", "doorHardware", "margin"]);
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      assert.ok(!denied.has(key), `Respuesta pública contiene ${key}`);
      visit(item);
    }
  };
  visit(object);
}
async function cleanup(products, kitchens) {
  for (const id of products) assert.match(id, /^api-test-kitchen-[a-f0-9-]{36}$/);
  for (const id of kitchens) assert.match(id, /^[a-f0-9-]{36}$/);
  const statements = [];
  if (products.length) statements.push(`DELETE FROM products WHERE id IN (${products.map((id) => `'${id}'`).join(",")})`);
  if (kitchens.length) statements.push(`DELETE FROM kitchens WHERE id IN (${kitchens.map((id) => `'${id}'`).join(",")})`);
  if (!statements.length) return;
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url)), "d1", "execute", "alrazz-db", "--local", "--command", statements.join(";"), "--json"], { cwd: fileURLToPath(new URL("../", import.meta.url)), windowsHide: true, timeout: 30000 });
}

test("kitchen API validates the plan, protects fabrication, saves immutable snapshots and isolates owners", async (t) => {
  const productIds = [], kitchenIds = [];
  const staff = new Client("203.0.113.181"), owner = new Client("203.0.113.182"), other = new Client("203.0.113.183");
  t.after(async () => { await staff.post({ op: "logout" }); await cleanup(productIds, kitchenIds); });
  assert.equal((await other.post({ op: "kitchen-cut-list", kitchenId: "invalid" })).status, 401);
  assert.equal((await other.get("admin-kitchens")).status, 401);
  const challenge = await staff.post({ op: "login", email, password });
  assert.equal(challenge.status, 200);
  assert.equal(challenge.data.admin, false);
  assert.equal((await staff.post({ op: "kitchen-cut-list", kitchenId: "invalid" })).status, 401);
  let auth = await staff.post({ op: "verify-login", method: "totp", code: totp(secret, Math.floor(Date.now() / 1000)) });
  if (auth.status === 401) {
    await new Promise((resolve) => setTimeout(resolve, 31000 - (Date.now() % 30000)));
    await staff.post({ op: "login", email, password });
    auth = await staff.post({ op: "verify-login", method: "totp", code: totp(secret, Math.floor(Date.now() / 1000)) });
  }
  assert.equal(auth.status, 200);
  assert.equal(auth.data.admin, true);
  const admin = (await staff.get("admin")).data;
  const id = "api-test-kitchen-" + randomUUID();
  productIds.push(id);
  const template = productTemplate("kitchen-base");
  const draft = await staff.post({ op: "product", expectedVersion: 0, product: { ...template, id, frontOptions: ["melamine", "glass", "aluminum-glass"], pricing: { basis: "linear-meter", amount: 900 }, defaults: { ...template.defaults, finish: admin.settings.materials.find((item) => item.active).id } } });
  assert.equal(draft.status, 201);
  const activated = await staff.post({ op: "product", expectedVersion: 1, product: { ...draft.data.product, active: true } });
  assert.equal(activated.status, 200);
  const model = activated.data.product;
  const publicProduct = (await owner.get("catalog")).data.products.find((item) => item.id === id);
  assert.deepEqual(publicProduct.pricing, { basis: "linear-meter" });
  publicOnly(publicProduct);
  const plan = { layout: "straight", walls: { a: 3000, b: 2400 }, roomHeight: 2600, wallElevation: 1450, install: true, transport: true, items: [
    { id: "base-a", wall: "a", row: "base", kind: "furniture", productId: id, config: model.defaults },
    { id: "base-b", wall: "a", row: "base", kind: "furniture", productId: id, config: { ...model.defaults, front: "aluminum-glass", handle: "exterior", install: true, transport: true } },
    { id: "sink", wall: "a", row: "base", kind: "sink-gap", width: 600, height: 850, depth: 600 },
  ] };
  const quote = await owner.quote(plan);
  assert.equal(quote.status, 200, JSON.stringify(quote.data));
  publicOnly(quote.data);
  assert.equal(quote.data.modules.length, 3);
  assert.equal(quote.data.modules[2].price, 0);
  assert.equal(quote.data.servicesPrice, Math.ceil((admin.settings.installation + admin.settings.delivery) / 10) * 10);
  assert.equal(quote.data.price, quote.data.furniturePrice + quote.data.servicesPrice);
  assert.ok(quote.data.geometry.some((panel) => panel.surface === "placeholder"));
  assert.ok(quote.data.geometry.some((panel) => panel.surface === "aluminum-glass"));
  assert.deepEqual(quote.data.geometry.filter((panel) => panel.door).map((panel) => panel.handle), ["push", "exterior"]);
  assert.equal((await owner.quote({ ...plan, walls: { a: 1000, b: 2400 } })).status, 400);
  assert.equal((await owner.quote({ ...plan, items: [...plan.items, plan.items[0]] })).status, 400);
  assert.equal((await owner.request("/api/kitchen-quote", { plan }, { Origin: "https://example.invalid" })).status, 403);
  assert.equal((await owner.request("/api/kitchen-quote", { plan, padding: "x".repeat(1024 * 1024) })).status, 413);
  const saved = await owner.post({ op: "save-kitchen", plan, name: "Cocina automática de prueba", price: 1 });
  assert.equal(saved.status, 201);
  const kitchen = saved.data.kitchen;
  kitchenIds.push(kitchen.id);
  publicOnly(kitchen);
  assert.deepEqual(kitchen.result, quote.data);
  assert.equal((await owner.get("kitchens")).data.kitchens.some((item) => item.id === kitchen.id), true);
  assert.equal((await other.get("kitchens")).data.kitchens.some((item) => item.id === kitchen.id), false);
  assert.equal((await staff.get("admin-kitchens")).data.kitchens.some((item) => item.id === kitchen.id), true);
  const shared = await other.get("kitchen&id=" + kitchen.id);
  assert.equal(shared.status, 200);
  assert.deepEqual(shared.data.kitchen, kitchen);
  publicOnly(shared.data.kitchen);
  assert.equal((await other.post({ op: "remove-kitchen", id: kitchen.id, version: 1 })).status, 409);
  const cuts = await staff.post({ op: "kitchen-cut-list", kitchenId: kitchen.id });
  assert.equal(cuts.status, 200);
  assert.equal(cuts.data.source, "saved");
  assert.equal(cuts.data.modules.length, 2);
  assert.ok(cuts.data.modules.every((module) => module.result.panels.every((panel) => panel.thickness === 18)));
  assert.ok(cuts.data.modules.every((module) => module.result.breakdown.installation === 0 && module.result.breakdown.delivery === 0));
  const revised = await staff.post({ op: "product", expectedVersion: model.version, product: { ...model, pricing: { basis: "unit", amount: 9999 }, active: false } });
  assert.equal(revised.status, 200);
  assert.equal((await owner.quote(plan)).status, 400);
  assert.deepEqual((await other.get("kitchen&id=" + kitchen.id)).data.kitchen, kitchen);
  assert.deepEqual((await staff.post({ op: "kitchen-cut-list", kitchenId: kitchen.id })).data.modules, cuts.data.modules);
  assert.equal((await owner.post({ op: "remove-kitchen", id: kitchen.id, version: 2 })).status, 409);
  assert.equal((await owner.post({ op: "remove-kitchen", id: kitchen.id, version: 1 })).status, 200);
  assert.equal((await other.get("kitchen&id=" + kitchen.id)).status, 404);
  assert.equal((await staff.post({ op: "kitchen-cut-list", kitchenId: kitchen.id })).status, 404);
});
