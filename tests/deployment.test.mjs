import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { publicGeometry } from "../lib/public-geometry.ts";
import {
  checkConfig,
  isPublicPreview,
  publicOrigin,
  publicBuildMatches,
  requireFreeCompatibleAuthentication,
} from "../scripts/check-deployment.mjs";

function visualPreview() {
  return {
    price: 1500,
    geometry: publicGeometry(
      [{ id: "side", name: "Lateral", size: [18, 2100, 550], position: [0, 1050, 0], material: "fixture-finish", door: false }],
      [
        { id: "rail", name: "Barra", kind: "clothes-rail", length: 850, diameter: 25, position: [0, 1700, 0] },
        ...["glass", "aluminum-glass"].map((surface) => ({ id: surface, name: "Frente", kind: "front-door", surface, size: [400, 700, 6], position: [0, 350, 280], glassThickness: 6, glassWidth: 396, glassHeight: 696, glassArea: 0.276, frameMeters: 2.2 })),
      ],
    ),
  };
}

test("public smoke accepts the actual visual contract for boards, wardrobe rails and glass fronts", () => {
  const preview = visualPreview();
  assert.equal(preview.geometry[1].shape, "cylinder");
  assert.equal(preview.geometry[2].surface, "glass");
  assert.equal(preview.geometry[3].surface, "aluminum-glass");
  assert.equal(isPublicPreview(preview), true);
});

test("public smoke still rejects manufacturing details and internal costs", () => {
  for (const field of ["id", "name", "edges", "grain", "glassWidth", "glassHeight", "glassArea", "frameMeters", "unitCost", "cost"]) {
    const preview = visualPreview();
    preview.geometry[2][field] = "private-fixture";
    assert.equal(isPublicPreview(preview), false, field);
  }
  for (const field of ["panels", "fixtures", "costs", "accessories", "cutList"]) {
    assert.equal(isPublicPreview({ ...visualPreview(), [field]: [] }), false, field);
  }
});

test("public smoke rejects malformed visual previews without throwing", () => {
  for (const value of [null, [], {}, { price: 100, geometry: [null] }, { price: "100", geometry: [] }])
    assert.equal(isPublicPreview(value), false);
  for (const patch of [{ shape: "private-description" }, { surface: "placeholder" }, { size: [18, 500] }, { position: [0, Infinity, 0] }, { door: "yes" }, { hinge: "right" }, { door: true, hinge: "other" }]) {
    const preview = visualPreview();
    Object.assign(preview.geometry[0], patch);
    assert.equal(isPublicPreview(preview), false);
  }
});

const filename = new URL("../wrangler.jsonc", import.meta.url);
const source = ts.parseConfigFileTextToJson(
  filename.pathname,
  await readFile(filename, "utf8"),
).config;
// Deployment fixtures only; no remote account, database, or credentials.
function provisionedConfig() {
  const config = structuredClone(source);
  config.d1_databases[0].database_id = "11111111-1111-4111-8111-111111111111";
  return config;
}

test("deployment accepts the intended static assets, D1 and internal SQLite password object", () => {
  const config = provisionedConfig();
  assert.equal(checkConfig(config).binding, "DB");
  assert.doesNotThrow(() => requireFreeCompatibleAuthentication(config));
});

test("deployment rejects placeholder or missing databases before touching Cloudflare", () => {
  for (const id of [
    undefined,
    "",
    "example",
    "00000000-0000-4000-8000-000000000000",
    "00000000-0000-0000-0000-000000000000",
  ]) {
    const config = provisionedConfig();
    config.d1_databases[0].database_id = id;
    assert.throws(() => checkConfig(config));
  }
});

test("deployment never serves the Worker folder or puts private credentials into vars", () => {
  for (const directory of ["dist", "./dist", "./dist/alrazz", "."]) {
    const config = provisionedConfig();
    config.assets.directory = directory;
    assert.throws(() => checkConfig(config));
  }
  for (const key of [
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD_HASH",
    "ADMIN_TOTP_SECRET",
    "ADMIN_RECOVERY_HASHES",
    "SESSION_SECRET",
    "ADMIN_EMAIL_RELAY_SECRET",
    "ADMIN_EMAIL_RELAY_URL",
    "RESEND_API_KEY",
    "ADMIN_EMAIL_FROM",
  ]) {
    const config = provisionedConfig();
    config.vars = { [key]: "test-fixture-only" };
    assert.throws(() => checkConfig(config));
  }
});

test("free deployment requires a local SQLite-backed password verifier", () => {
  const absent = provisionedConfig();
  absent.durable_objects.bindings = [];
  assert.throws(() => requireFreeCompatibleAuthentication(absent));
  const external = provisionedConfig();
  external.durable_objects.bindings[0].script_name = "another-worker";
  assert.throws(() => requireFreeCompatibleAuthentication(external));
  const legacy = provisionedConfig();
  legacy.migrations = [{ tag: "v1", new_classes: ["AdminPasswordVerifier"] }];
  assert.throws(() => requireFreeCompatibleAuthentication(legacy));
});

test("public smoke checks require an HTTPS origin without credentials or extra paths", () => {
  assert.equal(
    publicOrigin("https://alrazz.example.workers.dev/"),
    "https://alrazz.example.workers.dev",
  );
  for (const value of [
    undefined,
    "http://localhost:5173",
    "https://127.0.0.1",
    "https://example.local",
    "https://example.com/admin",
    "https://name:secret@example.com",
    "https://example.com/?token=fixture",
    "https://example.com/#admin",
  ]) {
    assert.throws(() => publicOrigin(value));
  }
});

test("production passkeys reject preview or Worker origins while allowing feature rollback", () => {
  for (const [key, value] of [
    ["ADMIN_PASSKEY_RP_ID", "preview.alrazz.pages.dev"],
    ["ADMIN_PASSKEY_ORIGIN", "https://alrazz.example.workers.dev"],
  ]) {
    const config = provisionedConfig();
    config.vars = { ADMIN_PASSKEYS_ENABLED: "1", ADMIN_PASSKEY_RP_ID: "alrazz.pages.dev", ADMIN_PASSKEY_ORIGIN: "https://alrazz.pages.dev", [key]: value };
    assert.throws(() => checkConfig(config), /RP y origen oficiales/);
  }
  const disabled = provisionedConfig();
  disabled.vars = { ADMIN_PASSKEYS_ENABLED: "0" };
  assert.doesNotThrow(() => checkConfig(disabled));
});

test("public smoke distinguishes the released frontend from an older Pages deployment", () => {
  const expected = '<script type="module" src="/assets/app-current.js"></script><link rel="stylesheet" href="/assets/app-current.css">';
  const same = '<link href="/assets/app-current.css" rel="stylesheet"><script src="/assets/app-current.js" type="module"></script><img src="/logo.svg">';
  assert.equal(publicBuildMatches(same, expected), true);
  for (const actual of [
    expected.replaceAll("current", "previous"),
    expected.replace('/assets/app-current.css', '/assets/app-previous.css'),
    '<script src="/assets/app-current.js"></script>',
    expected + '<script src="/assets/old-extra.js"></script>',
    '<div id="root"></div>',
    null,
  ]) assert.equal(publicBuildMatches(actual, expected), false);
  assert.equal(publicBuildMatches('<div id="root"></div>', '<div id="root"></div>'), false);
});
