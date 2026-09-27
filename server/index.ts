import { z } from "zod";
import {
  buildFurniture,
  configSchema,
  defaultSettings,
  productSchema,
  publicMaterials,
  seedProducts,
  settingsSchema,
  validateProduct,
  type Config,
  type Product,
  type Settings,
} from "../lib/furniture";

// Structural binding types keep the domain independent of any platform SDK.
type D1Result<T = unknown> = {
  results: T[];
  success: boolean;
  meta: { changes: number };
};
interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
interface Database {
  prepare(sql: string): Statement;
  batch<T = unknown>(statements: Statement[]): Promise<D1Result<T>[]>;
}
export interface Env {
  DB: Database;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
}

const ADMIN_COOKIE = "alrazz_admin";
const OWNER_COOKIE = "alrazz_design_owner";
const SESSION_SECONDS = 8 * 60 * 60;
const BODY_LIMIT = 1024 * 1024;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const productId = z.string().regex(/^[a-z0-9-]{2,60}$/);
const positiveVersion = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const quantitySchema = z.number().int().min(1).max(20);

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

function json(data: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...extra,
    },
  });
}

function cookieValue(request: Request, key: string) {
  const item = (request.headers.get("cookie") || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(key + "="));
  return item?.slice(key.length + 1) || "";
}

function cookie(request: Request, key: string, value: string, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${key}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function configured(env: Env) {
  return !!(
    env.ADMIN_PASSWORD &&
    env.ADMIN_PASSWORD.length >= 16 &&
    env.SESSION_SECRET &&
    env.SESSION_SECRET.length >= 32
  );
}

const bytes = (value: string) => new TextEncoder().encode(value);
const hex = (value: ArrayBuffer) =>
  [...new Uint8Array(value)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
async function digest(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", bytes(value)));
}
async function signature(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    bytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, bytes(value)));
}
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++)
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function admin(request: Request, env: Env) {
  if (!configured(env)) return false;
  const token = cookieValue(request, ADMIN_COOKIE);
  const match = /^(\d{10})\.([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(token);
  if (!match || !UUID.test(match[2])) return false;
  const expiry = Number(match[1]);
  const now = Math.floor(Date.now() / 1000);
  if (expiry <= now || expiry > now + SESSION_SECONDS + 60) return false;
  // Rotating either secret or administrator password invalidates older sessions.
  const secret =
    env.SESSION_SECRET! + ":" + (await digest(env.ADMIN_PASSWORD!));
  return same(match[3], await signature(`${match[1]}.${match[2]}`, secret));
}

async function requireAdmin(request: Request, env: Env) {
  if (!configured(env))
    throw new HttpError(
      503,
      "El acceso administrativo requiere configurar ADMIN_PASSWORD y SESSION_SECRET en el servidor.",
      "ADMIN_NOT_CONFIGURED",
    );
  if (!(await admin(request, env)))
    throw new HttpError(
      401,
      "Inicia sesión para administrar el catálogo.",
      "UNAUTHORIZED",
    );
}

async function owner(request: Request, create = false) {
  const existing = cookieValue(request, OWNER_COOKIE);
  const id = UUID.test(existing)
    ? existing
    : create
      ? crypto.randomUUID()
      : null;
  return {
    hash: id ? await digest(id) : null,
    header:
      id && id !== existing
        ? cookie(request, OWNER_COOKIE, id, 180 * 24 * 60 * 60)
        : null,
  };
}

async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new HttpError(
      403,
      "La solicitud debe venir de esta misma página.",
      "ORIGIN_MISMATCH",
    );
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new HttpError(415, "Envía datos en formato JSON.", "JSON_REQUIRED");
  }
  if (Number(request.headers.get("content-length")) > BODY_LIMIT)
    throw new HttpError(413, "El archivo supera 1 MB.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Faltan los datos de la solicitud.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > BODY_LIMIT) {
      await reader.cancel();
      throw new HttpError(413, "El archivo supera 1 MB.");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(all));
  } catch {
    throw new HttpError(400, "El JSON no es válido.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpError(400, "Se esperaba un objeto JSON.");
  return value as Record<string, unknown>;
}

async function seed(db: Database) {
  const initialized = await db
    .prepare("SELECT id FROM settings WHERE id = 'initialized'")
    .first();
  if (initialized) return;
  // Every statement checks the durable marker. Empty/deactivated catalogs never re-seed.
  await db.batch([
    ...seedProducts.map((p) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO products(id,data,version,active)
      SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM settings WHERE id = 'initialized')`,
        )
        .bind(p.id, JSON.stringify(p), p.version, p.active ? 1 : 0),
    ),
    db
      .prepare(
        `INSERT OR IGNORE INTO settings(id,data,version)
      SELECT 'business',?,1 WHERE NOT EXISTS (SELECT 1 FROM settings WHERE id = 'initialized')`,
      )
      .bind(JSON.stringify(defaultSettings)),
    db.prepare(
      "INSERT OR IGNORE INTO settings(id,data,version) VALUES('initialized','true',1)",
    ),
  ]);
}

async function readProducts(db: Database, includeDrafts = false) {
  const { results } = await db
    .prepare(
      includeDrafts
        ? "SELECT data FROM products"
        : "SELECT data FROM products WHERE active = 1",
    )
    .all<{ data: string }>();
  return results
    .map((row) => productSchema.parse(JSON.parse(row.data)))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

async function readSettings(db: Database) {
  const row = await db
    .prepare("SELECT data,version FROM settings WHERE id = 'business'")
    .first<{ data: string; version: number }>();
  if (!row)
    throw new HttpError(503, "La base de datos aún no está inicializada.");
  return {
    settings: settingsSchema.parse(JSON.parse(row.data)),
    version: row.version,
  };
}

async function readProduct(db: Database, id: string) {
  const row = await db
    .prepare("SELECT data FROM products WHERE id=? AND active=1")
    .bind(id)
    .first<{ data: string }>();
  if (!row)
    throw new HttpError(
      404,
      "Este modelo no está disponible. Elige otro modelo del catálogo.",
      "PRODUCT_UNAVAILABLE",
    );
  return productSchema.parse(JSON.parse(row.data));
}

function publicSettings(settings: Settings) {
  return {
    whatsapp: settings.whatsapp,
    availability: settings.availability,
    leadWeeks: settings.leadWeeks,
    materials: publicMaterials(settings),
  };
}

function publicProduct(product: Product, price: number) {
  const { basePrice: _basePrice, ...safe } = product;
  return { ...safe, publicPrice: price };
}

function publicResult(result: ReturnType<typeof buildFurniture>) {
  const { panels, area, edges, doors, price, accessories } = result;
  return { panels, area, edges, doors, price, accessories };
}

function validateDomain<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof z.ZodError) throw error;
    throw new HttpError(
      400,
      error instanceof Error ? error.message : "La configuración no es válida.",
      "INVALID_CONFIGURATION",
    );
  }
}

async function calculate(db: Database, data: Record<string, unknown>) {
  const id = productId.parse(data.productId);
  const config = configSchema.parse(data.config);
  const [product, { settings }] = await Promise.all([
    readProduct(db, id),
    readSettings(db),
  ]);
  return {
    product,
    config,
    settings,
    result: validateDomain(() => buildFurniture(product, config, settings)),
  };
}

type Snapshot = {
  product: Product;
  config: Config;
  settings: Settings;
  result: ReturnType<typeof buildFurniture>;
};
type DesignRow = {
  id: string;
  name: string;
  quantity: number;
  version: number;
  created_at: string;
  snapshot: string;
};

function publicDesign(row: DesignRow) {
  const snapshot = JSON.parse(row.snapshot) as Snapshot;
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    version: row.version,
    created: row.created_at,
    product: {
      ...publicProduct(snapshot.product, snapshot.result.price),
      preview: publicResult(snapshot.result),
    },
    config: snapshot.config,
    price: snapshot.result.price,
    result: publicResult(snapshot.result),
    materials: publicMaterials(snapshot.settings),
  };
}

async function login(
  request: Request,
  env: Env,
  data: Record<string, unknown>,
) {
  if (!configured(env))
    throw new HttpError(
      503,
      "El acceso administrativo todavía no está configurado.",
      "ADMIN_NOT_CONFIGURED",
    );
  const password = z.string().min(1).max(512).parse(data.password);
  // Cloudflare supplies this header. Never trust client-provided x-forwarded-for.
  const ip = request.headers.get("cf-connecting-ip") || "local-development";
  const bucket = await digest("admin:" + ip + ":" + env.SESSION_SECRET!);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("DELETE FROM login_limits WHERE reset_at < ?")
    .bind(now - 24 * 3600)
    .run();
  const row = await env.DB.prepare(
    `INSERT INTO login_limits(bucket,attempts,reset_at) VALUES(?,1,?)
    ON CONFLICT(bucket) DO UPDATE SET
      attempts=CASE WHEN reset_at <= ? THEN 1 ELSE attempts+1 END,
      reset_at=CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END
    RETURNING attempts,reset_at`,
  )
    .bind(bucket, now + 15 * 60, now, now)
    .first<{ attempts: number; reset_at: number }>();
  if (!row || row.attempts > 5)
    return json(
      {
        error: "Demasiados intentos. Inténtalo de nuevo en unos minutos.",
        code: "RATE_LIMITED",
      },
      429,
      {
        "Retry-After": String(Math.max(1, (row?.reset_at || now + 900) - now)),
      },
    );
  if (!same(await digest(password), await digest(env.ADMIN_PASSWORD!)))
    throw new HttpError(
      401,
      "La contraseña no es correcta.",
      "INVALID_CREDENTIALS",
    );
  await env.DB.prepare("DELETE FROM login_limits WHERE bucket=?")
    .bind(bucket)
    .run();
  const payload = `${now + SESSION_SECONDS}.${crypto.randomUUID()}`;
  const token = `${payload}.${await signature(payload, env.SESSION_SECRET! + ":" + (await digest(env.ADMIN_PASSWORD!)))}`;
  return json({ admin: true }, 200, {
    "Set-Cookie": cookie(request, ADMIN_COOKIE, token, SESSION_SECONDS),
  });
}

async function saveProduct(db: Database, data: Record<string, unknown>) {
  const incoming = productSchema.parse(data.product);
  const { settings, version: settingsVersion } = await readSettings(db);
  validateDomain(() => validateProduct(incoming, settings));
  const row = await db
    .prepare("SELECT version FROM products WHERE id=?")
    .bind(incoming.id)
    .first<{ version: number }>();
  if (!row) {
    if (data.expectedVersion !== undefined && data.expectedVersion !== 0)
      throw new HttpError(
        409,
        "El producto ya no existe. Recarga el catálogo.",
        "VERSION_CONFLICT",
      );
    const product = { ...incoming, active: false, version: 1 };
    const result = await db
      .prepare(
        "INSERT OR IGNORE INTO products(id,data,version,active) SELECT ?,?,1,0 WHERE EXISTS (SELECT 1 FROM settings WHERE id='business' AND version=?)",
      )
      .bind(product.id, JSON.stringify(product), settingsVersion)
      .run();
    if (!result.meta.changes)
      throw new HttpError(
        409,
        "Este código acaba de crearse en otra sesión. Recarga el catálogo.",
        "VERSION_CONFLICT",
      );
    return json({ product }, 201);
  }
  if (data.expectedVersion === 0)
    throw new HttpError(
      409,
      "Ya existe un modelo con este código. Elige otro código o edita el modelo existente.",
      "DUPLICATE_PRODUCT",
    );
  const expected = positiveVersion.parse(
    data.expectedVersion ?? incoming.version,
  );
  const product = { ...incoming, version: expected + 1 };
  const result = await db
    .prepare(
      "UPDATE products SET data=?,version=?,active=?,updated_at=datetime('now') WHERE id=? AND version=? AND EXISTS (SELECT 1 FROM settings WHERE id='business' AND version=?)",
    )
    .bind(
      JSON.stringify(product),
      product.version,
      product.active ? 1 : 0,
      product.id,
      expected,
      settingsVersion,
    )
    .run();
  if (!result.meta.changes)
    throw new HttpError(
      409,
      "Otro administrador modificó este producto. Recarga para no perder sus cambios.",
      "VERSION_CONFLICT",
    );
  return json({ product });
}

async function saveSettings(db: Database, data: Record<string, unknown>) {
  const settings = settingsSchema.parse(data.settings);
  const expected = positiveVersion.parse(data.version);
  // Avoid publishing a catalog whose material references can no longer be quoted.
  const products = await readProducts(db, true);
  for (const product of products.filter((p) => p.active)) {
    try {
      validateProduct(product, settings);
    } catch {
      throw new HttpError(
        400,
        `El modelo publicado «${product.name}» usa un material que intentas desactivar. Cambia primero su material o pásalo a borrador.`,
        "MATERIAL_IN_USE",
      );
    }
  }
  const fingerprint = products
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((p) => `${p.id}:${p.version}`)
    .join("|");
  const result = await db
    .prepare(
      `UPDATE settings SET data=?,version=version+1 WHERE id='business' AND version=?
    AND (SELECT COALESCE(group_concat(id || ':' || version, '|'), '') FROM (SELECT id,version FROM products ORDER BY id))=?`,
    )
    .bind(JSON.stringify(settings), expected, fingerprint)
    .run();
  if (!result.meta.changes)
    throw new HttpError(
      409,
      "La configuración cambió en otra sesión. Recarga antes de volver a guardar.",
      "VERSION_CONFLICT",
    );
  return json({ settings, settingsVersion: expected + 1 });
}

async function importProducts(db: Database, data: Record<string, unknown>) {
  const imported = z
    .array(productSchema)
    .min(1)
    .max(200)
    .parse(data.products)
    .map((p) => ({ ...p, active: false, version: 1 }));
  const ids = new Set<string>();
  const { settings } = await readSettings(db);
  for (const product of imported) {
    if (ids.has(product.id))
      throw new HttpError(400, `Código repetido en el archivo: ${product.id}.`);
    ids.add(product.id);
    validateDomain(() => validateProduct(product, settings));
  }
  const existing = await db
    .prepare("SELECT id FROM products")
    .all<{ id: string }>();
  const duplicates = existing.results.filter((p) => ids.has(p.id));
  if (duplicates.length)
    throw new HttpError(
      409,
      `Ya existen estos códigos: ${duplicates.map((p) => p.id).join(", ")}. Edita esos modelos en el panel o usa códigos nuevos.`,
      "DUPLICATE_PRODUCT",
    );
  try {
    // D1 batch is transactional: a uniqueness race rolls the whole import back.
    await db.batch(
      imported.map((p) =>
        db
          .prepare(
            "INSERT INTO products(id,data,version,active) VALUES(?,?,1,0)",
          )
          .bind(p.id, JSON.stringify(p)),
      ),
    );
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message))
      throw new HttpError(
        409,
        "No se importó ningún modelo. Uno de los códigos se creó durante la importación; vuelve a revisar el archivo.",
        "IMPORT_CONFLICT",
      );
    throw error;
  }
  return json({ imported, count: imported.length }, 201);
}

async function saveDesign(
  request: Request,
  db: Database,
  data: Record<string, unknown>,
) {
  const snapshot = await calculate(db, data);
  const identity = await owner(request, true);
  const count = await db
    .prepare(
      "SELECT count(*) AS n FROM designs WHERE owner_hash=? AND deleted_at IS NULL",
    )
    .bind(identity.hash)
    .first<{ n: number }>();
  if (count && count.n >= 100)
    throw new HttpError(
      409,
      "Has guardado 100 diseños. Quita uno para guardar otro.",
    );
  // Name is a short project label. No contact fields or user-provided totals are persisted.
  const name = z
    .string()
    .trim()
    .min(1)
    .max(80)
    .parse(data.name ?? snapshot.product.name);
  const quantity = quantitySchema.parse(data.quantity ?? 1);
  const row: DesignRow = {
    id: crypto.randomUUID(),
    name,
    quantity,
    version: 1,
    created_at: new Date().toISOString(),
    snapshot: JSON.stringify(snapshot),
  };
  await db
    .prepare(
      "INSERT INTO designs(id,owner_hash,snapshot,name,quantity,version,created_at) VALUES(?,?,?,?,?,1,?)",
    )
    .bind(
      row.id,
      identity.hash,
      row.snapshot,
      row.name,
      row.quantity,
      row.created_at,
    )
    .run();
  return json(
    { design: publicDesign(row) },
    201,
    identity.header ? { "Set-Cookie": identity.header } : {},
  );
}

async function mutateDesign(
  request: Request,
  db: Database,
  data: Record<string, unknown>,
  remove: boolean,
) {
  const id = z.string().regex(UUID).parse(data.id);
  const identity = await owner(request);
  if (!identity.hash)
    throw new HttpError(404, "No se encontró este diseño en tu selección.");
  const expected = positiveVersion.parse(data.version);
  if (remove) {
    const result = await db
      .prepare(
        "UPDATE designs SET deleted_at=?,version=version+1 WHERE id=? AND owner_hash=? AND version=? AND deleted_at IS NULL",
      )
      .bind(new Date().toISOString(), id, identity.hash, expected)
      .run();
    if (!result.meta.changes)
      throw new HttpError(
        409,
        "Este diseño cambió o ya no está en tu selección. Actualiza la página.",
        "VERSION_CONFLICT",
      );
    return json({ removed: true });
  }
  const quantity = quantitySchema.parse(data.quantity);
  const result = await db
    .prepare(
      "UPDATE designs SET quantity=?,version=version+1 WHERE id=? AND owner_hash=? AND version=? AND deleted_at IS NULL",
    )
    .bind(quantity, id, identity.hash, expected)
    .run();
  if (!result.meta.changes)
    throw new HttpError(
      409,
      "Este diseño cambió o ya no está en tu selección. Actualiza la página.",
      "VERSION_CONFLICT",
    );
  const row = await db
    .prepare("SELECT * FROM designs WHERE id=? AND owner_hash=?")
    .bind(id, identity.hash)
    .first<DesignRow>();
  return json({ design: publicDesign(row!) });
}

async function get(request: Request, env: Env) {
  const url = new URL(request.url);
  const action =
    url.searchParams.get("action") ||
    ["catalog", "admin", "design", "designs"].find((key) =>
      url.searchParams.has(key),
    ) ||
    "catalog";
  switch (action) {
    case "admin": {
      const authenticated = await admin(request, env);
      if (!authenticated)
        return json({ admin: false, configured: configured(env) });
      const [products, { settings, version }] = await Promise.all([
        readProducts(env.DB, true),
        readSettings(env.DB),
      ]);
      return json({
        admin: true,
        configured: true,
        products,
        settings,
        settingsVersion: version,
      });
    }
    case "catalog": {
      const [products, { settings }] = await Promise.all([
        readProducts(env.DB),
        readSettings(env.DB),
      ]);
      return json({
        products: products.map((p) => {
          const preview = publicResult(buildFurniture(p, p.defaults, settings));
          return { ...publicProduct(p, preview.price), preview };
        }),
        settings: publicSettings(settings),
        connected: true,
      });
    }
    case "design": {
      const id = z.string().regex(UUID).parse(url.searchParams.get("id"));
      // Possession of the unguessable share URL grants read-only access to this snapshot.
      const row = await env.DB.prepare(
        "SELECT * FROM designs WHERE id=? AND deleted_at IS NULL",
      )
        .bind(id)
        .first<DesignRow>();
      if (!row)
        throw new HttpError(
          404,
          "Este diseño ya no está disponible.",
          "DESIGN_UNAVAILABLE",
        );
      return json({ design: publicDesign(row) });
    }
    case "designs": {
      const identity = await owner(request, true);
      const { results } = await env.DB.prepare(
        "SELECT * FROM designs WHERE owner_hash=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100",
      )
        .bind(identity.hash)
        .all<DesignRow>();
      return json(
        { designs: results.map(publicDesign) },
        200,
        identity.header ? { "Set-Cookie": identity.header } : {},
      );
    }
    default:
      throw new HttpError(404, "Esta consulta no existe.");
  }
}

async function post(request: Request, env: Env, quote = false) {
  const data = await bodyOf(request);
  const op = quote ? "quote" : z.string().parse(data.op);
  if (op === "login") return login(request, env, data);
  if (op === "logout")
    return json({ admin: false }, 200, {
      "Set-Cookie": cookie(request, ADMIN_COOKIE, "", 0),
    });
  if (op === "quote")
    return json(publicResult((await calculate(env.DB, data)).result));
  if (op === "save-design") return saveDesign(request, env.DB, data);
  if (op === "remove-design") return mutateDesign(request, env.DB, data, true);
  if (op === "set-quantity") return mutateDesign(request, env.DB, data, false);
  await requireAdmin(request, env);
  if (op === "product") return saveProduct(env.DB, data);
  if (op === "settings") return saveSettings(env.DB, data);
  if (op === "import") return importProducts(env.DB, data);
  throw new HttpError(404, "Esta operación no existe.");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith("/api/")) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response("Frontend no disponible.", { status: 404 });
    }
    try {
      if (pathname !== "/api/store" && pathname !== "/api/quote")
        throw new HttpError(404, "Esta ruta no existe.");
      if (!env.DB)
        throw new HttpError(
          503,
          "La base de datos no está conectada.",
          "DB_NOT_CONFIGURED",
        );
      if (request.method !== "GET" && request.method !== "POST")
        return json({ error: "Método no permitido." }, 405, {
          Allow: "GET, POST",
        });
      await seed(env.DB);
      if (request.method === "GET" && pathname === "/api/store")
        return await get(request, env);
      if (request.method === "POST")
        return await post(request, env, pathname === "/api/quote");
      throw new HttpError(405, "La cotización requiere POST.");
    } catch (error) {
      if (error instanceof HttpError)
        return json({ error: error.message, code: error.code }, error.status);
      if (error instanceof z.ZodError)
        return json(
          {
            error: error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join(" · "),
            code: "VALIDATION_ERROR",
          },
          400,
        );
      // Domain validation uses plain Error; database/internal failures are never sent to clients.
      if (
        error instanceof Error &&
        /^(Medida inválida|Cada módulo|La luz supera|Cada puerta|Las repisas|Los límites|Material |El material|La medida|La altura|La profundidad|El ancho|El color)/.test(
          error.message,
        )
      ) {
        return json(
          { error: error.message, code: "INVALID_CONFIGURATION" },
          400,
        );
      }
      console.error(
        "AlRazz API error",
        error instanceof Error ? error.message : "unknown",
      );
      return json(
        {
          error: "No se pudo completar la operación. Inténtalo de nuevo.",
          code: "INTERNAL_ERROR",
        },
        500,
      );
    }
  },
};
