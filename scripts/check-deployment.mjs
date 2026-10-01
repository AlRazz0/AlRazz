import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const requiredSecrets = [
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD_HASH",
  "ADMIN_TOTP_SECRET",
  "ADMIN_RECOVERY_HASHES",
  "SESSION_SECRET",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function publicOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "Configura ALRAZZ_PUBLIC_URL con la dirección HTTPS pública.",
    );
  }
  assert(
    url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      url.hostname.includes(".") &&
      !url.hostname.endsWith(".localhost") &&
      !url.hostname.endsWith(".local") &&
      !/^\d+(?:\.\d+){3}$/.test(url.hostname),
    "ALRAZZ_PUBLIC_URL debe ser un dominio HTTPS público sin ruta ni credenciales.",
  );
  return url.origin;
}

async function readConfig() {
  const filename = resolve(root, "wrangler.jsonc");
  const parsed = ts.parseConfigFileTextToJson(
    filename,
    await readFile(filename, "utf8"),
  );
  assert(!parsed.error, "wrangler.jsonc no es JSONC válido.");
  return parsed.config;
}

export function checkConfig(config) {
  assert(config.name === "alrazz", "El Worker de producción debe ser alrazz.");
  const databases = config.d1_databases || [];
  const db = databases.find((entry) => entry.binding === "DB");
  assert(
    databases.length === 1 &&
      db?.database_name === "alrazz-db" &&
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(db.database_id) &&
      db.database_id !== "00000000-0000-4000-8000-000000000000" &&
      !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(db.database_id),
    "Falta el UUID real de alrazz-db en wrangler.jsonc; no se publica con un identificador de ejemplo.",
  );
  assert(
    db.migrations_dir === "migrations",
    "DB debe utilizar las migraciones versionadas de migrations/.",
  );
  assert(
    config.assets?.directory === "./dist/client" &&
      config.assets?.binding === "ASSETS" &&
      config.assets?.run_worker_first?.includes("/api/*"),
    "Publica solo dist/client como archivos estáticos y conserva /api/* en el Worker.",
  );
  assert(
    [...requiredSecrets, "RESEND_API_KEY", "ADMIN_EMAIL_FROM", "ADMIN_EMAIL_RELAY_SECRET", "ADMIN_EMAIL_RELAY_URL"].every(
      (key) => !(key in (config.vars || {})),
    ),
    "Las credenciales administrativas deben ser secretos de Cloudflare, no vars públicas en Git.",
  );
  requireFreeCompatibleAuthentication(config);
  return db;
}

export function requireFreeCompatibleAuthentication(config) {
  const verifier = config.durable_objects?.bindings?.find(
    (binding) => binding.name === "ADMIN_PASSWORD_VERIFIER",
  );
  assert(
    verifier?.class_name === "AdminPasswordVerifier" &&
      !verifier.script_name &&
      config.migrations?.some(
        (migration) =>
          migration.tag === "v1-admin-password-verifier" &&
          migration.new_sqlite_classes?.includes("AdminPasswordVerifier"),
      ),
    "Falta el verificador privado de contraseñas y su migración SQLite. Workers Free necesita ADMIN_PASSWORD_VERIFIER para conservar scrypt y los dos pasos sin ejecutarlo en el Worker público.",
  );
}

async function cloudflareGet(path, token) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(
      "Cloudflare devolvió una respuesta no válida en la comprobación previa.",
    );
  }
  assert(
    response.ok && payload.success === true,
    `No se pudo comprobar la configuración de Cloudflare (HTTP ${response.status}). Revisa los permisos del token y el aprovisionamiento; no se han cambiado recursos.`,
  );
  return payload.result;
}

async function preflight() {
  if (process.env.GITHUB_ACTIONS === "true") {
    assert(
      process.env.GITHUB_REF === "refs/heads/main",
      "Solo se permite publicar desde main.",
    );
  }
  const config = await readConfig();
  const db = checkConfig(config);
  publicOrigin(process.env.ALRAZZ_PUBLIC_URL);
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  assert(
    token?.trim(),
    "Falta el secreto CLOUDFLARE_API_TOKEN de GitHub Actions.",
  );
  assert(
    /^[a-f0-9]{32}$/i.test(account || ""),
    "Falta un CLOUDFLARE_ACCOUNT_ID válido en GitHub Actions.",
  );
  await access(resolve(root, "dist/client/index.html"));
  await access(resolve(root, "dist/alrazz/index.js"));
  const built = JSON.parse(
    await readFile(resolve(root, "dist/alrazz/wrangler.json"), "utf8"),
  );
  assert(
    built.name === config.name &&
      built.d1_databases?.find((entry) => entry.binding === "DB")
        ?.database_id === db.database_id,
    "El build no coincide con la configuración de producción. Ejecuta npm run build de nuevo.",
  );
  requireFreeCompatibleAuthentication(built);

  const remote = await cloudflareGet(
    `/accounts/${account}/d1/database/${db.database_id}`,
    token,
  );
  assert(
    remote?.name === db.database_name,
    "D1 no corresponde a alrazz-db en esta cuenta.",
  );
  const secrets = await cloudflareGet(
    `/accounts/${account}/workers/scripts/${config.name}/secrets`,
    token,
  );
  assert(
    Array.isArray(secrets),
    "No se pudo comprobar la lista de secretos del Worker.",
  );
  const missing = requiredSecrets.filter(
    (key) =>
      !secrets.some(
        (entry) => entry.name === key && entry.type === "secret_text",
      ),
  );
  assert(
    !missing.length,
    `Faltan secretos administrativos en Cloudflare: ${missing.join(", ")}.`,
  );
  console.log(
    "Preparación comprobada. Las consultas previas no han modificado Cloudflare.",
  );
}

async function getPublic(origin, path, json = false) {
  const response = await fetch(new URL(path, origin), {
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: { Accept: json ? "application/json" : "text/html" },
  });
  assert(
    response.ok,
    `La comprobación pública de ${path} devolvió HTTP ${response.status}.`,
  );
  assert(
    (response.headers.get("content-type") || "").includes(
      json ? "application/json" : "text/html",
    ),
    `La respuesta de ${path} tiene un formato inesperado.`,
  );
  return json ? response.json() : response.text();
}

async function smoke() {
  const origin = publicOrigin(process.env.ALRAZZ_PUBLIC_URL);
  const html = await getPublic(origin, "/");
  assert(
    html.includes('id="root"') && html.includes("/assets/"),
    "La portada no contiene el build de AlRazz.",
  );
  const catalog = await getPublic(origin, "/api/store?action=catalog", true);
  assert(
    catalog.connected === true &&
      Array.isArray(catalog.products) &&
      Array.isArray(catalog.settings?.materials),
    "El catálogo no está conectado a la base de datos.",
  );
  assert(
    catalog.products.every((product) => !("basePrice" in product)) &&
      catalog.settings.materials.every((material) => !("price" in material)),
    "El catálogo público está exponiendo tarifas internas.",
  );
  const visualKeys = new Set(["size", "position", "material", "door"]);
  assert(
    catalog.products.every(
      (product) =>
        product.preview &&
        Object.keys(product.preview).every((key) =>
          ["geometry", "price"].includes(key),
        ) &&
        Array.isArray(product.preview.geometry) &&
        product.preview.geometry.every((panel) =>
          Object.keys(panel).every((key) => visualKeys.has(key)),
        ),
    ),
    "El catálogo público está exponiendo información de despiece o usa un contrato antiguo.",
  );
  const admin = await getPublic(origin, "/api/store?action=admin", true);
  assert(
    admin.admin === false &&
      admin.configured === true &&
      !("products" in admin) &&
      !("settings" in admin),
    "El administrador no está configurado o entrega información privada sin autenticación.",
  );
  console.log(
    "Web y catálogo responden; el acceso administrativo anónimo sigue cerrado. No se ha iniciado sesión ni enviado correo.",
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const mode = process.argv[2];
    assert(
      ["config", "preflight", "smoke"].includes(mode),
      "Uso: node scripts/check-deployment.mjs config|preflight|smoke",
    );
    if (mode === "config") {
      checkConfig(await readConfig());
      console.log("Configuración local de despliegue válida.");
    } else if (mode === "preflight") {
      await preflight();
    } else {
      await smoke();
    }
  } catch (error) {
    // Never print response bodies, token values, or exception stacks in CI.
    console.error(
      error instanceof Error
        ? error.message
        : "Falló la comprobación de publicación.",
    );
    process.exitCode = 1;
  }
}
