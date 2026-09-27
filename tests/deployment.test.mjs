import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import {
  checkConfig,
  publicOrigin,
  requireFreeCompatibleAuthentication,
} from "../scripts/check-deployment.mjs";

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
