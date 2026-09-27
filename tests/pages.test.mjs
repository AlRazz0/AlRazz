import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";
import proxy from "../hosting/pages/_worker.js";
import { preparePages } from "../scripts/prepare-pages.mjs";

test("Pages forwards API URL, Origin, method, body and cookies unchanged", async () => {
  const request = new Request("https://alrazz.pages.dev/api/store?op=login", {
    method: "POST",
    headers: {
      Origin: "https://alrazz.pages.dev",
      "Content-Type": "application/json",
      Cookie: "alrazz_session=fixture; alrazz_design_owner=fixture-owner",
      "Sec-Fetch-Site": "same-origin",
    },
    body: JSON.stringify({ op: "login", fixture: true }),
  });
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append(
    "Set-Cookie",
    "first=fixture; Secure; HttpOnly; SameSite=Strict",
  );
  headers.append(
    "Set-Cookie",
    "second=fixture; Secure; HttpOnly; SameSite=Lax",
  );
  const backendResponse = new Response('{"ok":true}', { status: 202, headers });
  const response = await proxy.fetch(request, {
    ALRAZZ: {
      async fetch(forwarded) {
        assert.equal(forwarded, request);
        assert.equal(
          forwarded.url,
          "https://alrazz.pages.dev/api/store?op=login",
        );
        assert.equal(forwarded.method, "POST");
        assert.equal(
          forwarded.headers.get("origin"),
          "https://alrazz.pages.dev",
        );
        assert.equal(
          forwarded.headers.get("cookie"),
          request.headers.get("cookie"),
        );
        assert.equal(forwarded.headers.get("sec-fetch-site"), "same-origin");
        assert.deepEqual(await forwarded.json(), {
          op: "login",
          fixture: true,
        });
        return backendResponse;
      },
    },
  });
  assert.equal(response, backendResponse);
  assert.equal(response.status, 202);
  assert.equal(response.headers.getSetCookie().length, 2);
});

test("Pages does not replace a hostile Origin or turn query URLs into proxy destinations", async () => {
  const request = new Request(
    "https://alrazz.pages.dev/api/store?url=https://outside.invalid/private",
    {
      method: "POST",
      headers: {
        Origin: "https://outside.invalid",
        "Sec-Fetch-Site": "cross-site",
      },
      body: "fixture",
    },
  );
  let calls = 0;
  const response = await proxy.fetch(request, {
    ALRAZZ: {
      async fetch(forwarded) {
        calls++;
        assert.equal(forwarded, request);
        assert.equal(
          forwarded.headers.get("origin"),
          "https://outside.invalid",
        );
        assert.equal(forwarded.headers.get("sec-fetch-site"), "cross-site");
        return new Response("origin rejected by backend", { status: 403 });
      },
    },
  });
  assert.equal(calls, 1);
  assert.equal(response.status, 403);
});

test("Pages sends non-API paths to assets and fails closed without its backend binding", async () => {
  for (const path of [
    "/",
    "/admin",
    "/configurar?producto=tv-04",
    "/images/sample.webp",
    "/https://outside.invalid",
  ]) {
    const request = new Request("https://alrazz.pages.dev" + path);
    const response = await proxy.fetch(request, {
      ALRAZZ: {
        fetch() {
          assert.fail("Static path reached backend");
        },
      },
      ASSETS: {
        fetch(forwarded) {
          assert.equal(forwarded, request);
          return new Response("asset");
        },
      },
    });
    assert.equal(await response.text(), "asset");
  }
  const unavailable = await proxy.fetch(
    new Request("https://alrazz.pages.dev/api/store"),
    {},
  );
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("cache-control"), "no-store");
});

test("Pages invokes Functions only for API routes and binds to the existing Worker", async () => {
  const routes = JSON.parse(
    await readFile(
      new URL("../hosting/pages/_routes.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(routes, { version: 1, include: ["/api/*"], exclude: [] });
  const config = ts.parseConfigFileTextToJson(
    "pages",
    await readFile(
      new URL("../hosting/pages/wrangler.jsonc", import.meta.url),
      "utf8",
    ),
  ).config;
  assert.equal(config.pages_build_output_dir, "../../dist/pages");
  assert.deepEqual(config.services, [{ binding: "ALRAZZ", service: "alrazz" }]);
  assert.equal(config.d1_databases, undefined);
  assert.equal(config.durable_objects, undefined);
  assert.equal(config.vars, undefined);
});

test("Pages preparation copies only public client output and removes stale generated files", async () => {
  const root = await mkdtemp(join(tmpdir(), "alrazz-pages-test-"));
  try {
    await mkdir(join(root, "dist", "client", "assets"), { recursive: true });
    await mkdir(join(root, "dist", "alrazz"), { recursive: true });
    await mkdir(join(root, "dist", "pages"), { recursive: true });
    await mkdir(join(root, "hosting", "pages"), { recursive: true });
    for (const [file, value] of [
      ["dist/client/index.html", "<html>public SPA</html>"],
      ["dist/client/assets/app.js", "public script"],
      ["dist/client/.env", "PRIVATE_FIXTURE"],
      ["dist/client/.dev.vars", "PRIVATE_FIXTURE"],
      ["dist/client/wrangler.json", "PRIVATE_FIXTURE"],
      ["dist/client/server.ts", "PRIVATE_FIXTURE"],
      ["dist/client/assets/app.js.map", "PRIVATE_FIXTURE"],
      ["dist/alrazz/index.js", "PRIVATE_SERVER_FIXTURE"],
      ["dist/pages/stale.js", "old asset"],
    ])
      await writeFile(join(root, file), value);
    for (const name of ["_worker.js", "_routes.json"]) {
      await writeFile(
        join(root, "hosting", "pages", name),
        await readFile(new URL("../hosting/pages/" + name, import.meta.url)),
      );
    }
    const result = await preparePages(root);
    assert.equal(result.assetCount, 2);
    assert.deepEqual((await readdir(result.output)).sort(), [
      "_routes.json",
      "_worker.js",
      "assets",
      "index.html",
    ]);
    assert.deepEqual(await readdir(join(result.output, "assets")), ["app.js"]);
    assert.equal(
      await readFile(join(result.output, "index.html"), "utf8"),
      "<html>public SPA</html>",
    );
    await writeFile(
      join(root, "dist", "client", "404.html"),
      "wrong SPA fallback",
    );
    await assert.rejects(preparePages(root), /404\.html/);
  } finally {
    // root is the exact directory returned by mkdtemp for this test.
    await rm(root, { recursive: true, force: true });
  }
});
