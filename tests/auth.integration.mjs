import assert from "node:assert/strict";
import { createHash, createHmac, scryptSync } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare, createFetchMock, fetch as mockFetch } from "miniflare";

// Isolated security fixtures only. Never read .dev.vars, real credentials, local
// development D1, or the network. The compiled Worker is the code under test.
const base = "https://alrazz-auth.example.test";
const email = "admin@example.test";
const password = "not-a-real-password-for-auth-tests";
const totpSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const recoveryCode = "AAAQE-AYEAU-DAOCA-JBIFQ-YDIOB4";
const normalizedRecovery = recoveryCode.replaceAll("-", "");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const salt = Buffer.from("isolated-auth-v1!");
const passwordHash = `scrypt$32768$8$3$${salt.toString("base64url")}$${scryptSync(password, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }).toString("base64url")}`;
const bindings = {
  ADMIN_EMAIL: email,
  ADMIN_PASSWORD_HASH: passwordHash,
  ADMIN_TOTP_SECRET: totpSecret,
  ADMIN_RECOVERY_HASHES: JSON.stringify([sha256(normalizedRecovery)]),
  SESSION_SECRET: "isolated-session-secret-not-for-deployment-1234567890",
  RESEND_API_KEY: "re_isolated-test-key-never-real",
  ADMIN_EMAIL_FROM: "AlRazz Test <access@example.test>",
};
const relayBindings = {
  ADMIN_EMAIL_PROVIDER: "apps-script",
  ADMIN_EMAIL_RELAY_URL:
    "https://script.google.com/macros/s/isolated-auth-relay/exec",
  ADMIN_EMAIL_RELAY_SECRET: "abcdef0123456789".repeat(4),
};

// Independent RFC 6238 HMAC-SHA1 fixture; the ASCII key corresponds to the
// Base32 secret above. It does not use the production TOTP implementation.
function currentCode(seconds = Math.floor(Date.now() / 1000)) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(seconds / 30)));
  const hash = createHmac("sha1", "12345678901234567890")
    .update(counter)
    .digest();
  return String(
    (hash.readUInt32BE(hash[19] & 15) & 0x7fffffff) % 1_000_000,
  ).padStart(6, "0");
}

class Client {
  constructor(harness, ip = "203.0.113.45") {
    this.harness = harness;
    this.ip = ip;
    this.cookies = new Map();
  }
  copy() {
    const clone = new Client(this.harness, this.ip);
    clone.cookies = new Map(this.cookies);
    return clone;
  }
  async request(
    data,
    { origin = base, method, path = "/api/store", headers = {} } = {},
  ) {
    const response = await this.harness.mf.dispatchFetch(base + path, {
      method: method || (data === undefined ? "GET" : "POST"),
      headers: {
        ...(data === undefined
          ? {}
          : { "Content-Type": "application/json", Origin: origin }),
        Cookie: [...this.cookies]
          .map(([name, value]) => `${name}=${value}`)
          .join("; "),
        "CF-Connecting-IP": this.ip,
        ...headers,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const cookies = response.headers.getSetCookie();
    for (const value of cookies) {
      const [pair] = value.split(";");
      const equal = pair.indexOf("=");
      const name = pair.slice(0, equal);
      const token = pair.slice(equal + 1);
      if (token) this.cookies.set(name, token);
      else this.cookies.delete(name);
    }
    return {
      status: response.status,
      headers: response.headers,
      cookies,
      data: await response.json(),
    };
  }
  state() {
    return this.request(undefined, { path: "/api/store?action=admin" });
  }
  login(extra = {}) {
    return this.request({ op: "login", email, password, ...extra });
  }
  verify(code = currentCode(), method = "totp") {
    return this.request({ op: "verify-login", method, code });
  }
  sendEmail() {
    return this.request({ op: "request-email-code" });
  }
}

async function createHarness(
  extraBindings = {},
  { passwordVerifier = true } = {},
) {
  const fetchMock = createFetchMock();
  fetchMock.disableNetConnect();
  let options = {
    modules: true,
    scriptPath: fileURLToPath(
      new URL("../dist/alrazz/index.js", import.meta.url),
    ),
    compatibilityDate: "2026-05-22",
    compatibilityFlags: ["nodejs_compat"],
    bindings: { ...bindings, ...extraBindings },
    d1Databases: { DB: "isolated-auth-integration" },
    durableObjects: passwordVerifier
      ? {
          ADMIN_PASSWORD_VERIFIER: {
            className: "AdminPasswordVerifier",
            useSQLite: true,
          },
        }
      : {},
    // Miniflare's default fetchMock bridge reconstructs requests with a follow
    // redirect mode. Keep the bridge manual so the compiled Worker's own
    // redirect validation and GET request are exercised, including POST bodies.
    outboundService: (request) => mockFetch(request, {
      dispatcher: fetchMock,
      redirect: "manual",
    }),
  };
  const mf = new Miniflare(options);
  let db = await mf.getD1Database("DB");
  const directory = new URL("../migrations/", import.meta.url);
  for (const filename of (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(new URL(filename, directory), "utf8");
    const statements = sql
      .replace(/^\s*--.*$/gm, "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
    await db.batch(statements.map((statement) => db.prepare(statement)));
  }
  const harness = {
    mf,
    get db() {
      return db;
    },
    fetchMock,
    client: (ip) => new Client(harness, ip),
    async reset() {
      await db.batch(
        [
          "admin_auth_sessions",
          "admin_auth_challenges",
          "admin_auth_factors",
          "login_limits",
        ].map((table) => db.prepare(`DELETE FROM ${table}`)),
      );
    },
    async count(table) {
      assert.ok(
        [
          "admin_auth_sessions",
          "admin_auth_challenges",
          "admin_auth_factors",
        ].includes(table),
      );
      return (await db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n;
    },
    async rotate(extra) {
      options = { ...options, bindings: { ...options.bindings, ...extra } };
      await mf.setOptions(options);
      db = await mf.getD1Database("DB");
    },
    mail(status = 200) {
      const captured = [];
      fetchMock
        .get("https://api.resend.com")
        .intercept({ path: "/emails", method: "POST" })
        .reply((request) => {
          // Miniflare forwards a ReadableStream body to Undici's synchronous
          // reply callback. Capture asynchronously without delaying the mock.
          captured.push(
            (async () => {
              const body = await new Response(request.body).text();
              const message = JSON.parse(body);
              assert.ok(
                Array.isArray(message.to)
                  ? message.to.includes(email)
                  : message.to === email,
              );
              assert.equal(message.from, bindings.ADMIN_EMAIL_FROM);
              return message;
            })(),
          );
          return {
            statusCode: status,
            data: JSON.stringify(
              status < 300
                ? { id: "isolated-mail-message" }
                : { message: "sensitive-provider-diagnostic-must-not-leak" },
            ),
            responseOptions: {
              headers: { "Content-Type": "application/json" },
            },
          };
        });
      return captured;
    },
    relay(mode = "accepted") {
      const captured = [];
      captured.redirects = [];
      let envelope;
      const resultPath = "/macros/echo?user_content_key=isolated-auth";
      fetchMock
        .get("https://script.google.com")
        .intercept({ path: "/macros/s/isolated-auth-relay/exec", method: "POST" })
        .reply((request) => {
          captured.push((async () => {
            const message = JSON.parse(await new Response(request.body).text());
            assert.deepEqual(Object.keys(message).sort(), [
              "code", "recipient", "requestId", "signature", "timestamp", "v",
            ]);
            assert.equal(message.v, 1);
            assert.equal(message.recipient, email);
            assert.match(message.code, /^\d{6}$/);
            assert.match(message.requestId, /^[a-f0-9]{64}$/);
            assert.ok(Math.abs(message.timestamp - Math.floor(Date.now() / 1000)) <= 2);
            assert.equal(
              message.signature,
              createHmac("sha256", relayBindings.ADMIN_EMAIL_RELAY_SECRET)
                .update(JSON.stringify([
                  "elcapo-admin-email-v1", message.timestamp, message.requestId,
                  message.recipient, message.code,
                ]))
                .digest("hex"),
            );
            envelope = message;
            return message;
          })());
          return {
            statusCode: 302,
            data: "",
            responseOptions: {
              headers: { Location: "https://script.googleusercontent.com" + resultPath },
            },
          };
        });
      fetchMock
        .get("https://script.googleusercontent.com")
        .intercept({ path: resultPath, method: "GET" })
        .reply((request) => {
          assert.ok(envelope, "The POST body is captured before its redirect is requested");
          captured.redirects.push((async () => {
            assert.equal(
              await new Response(request.body).text(), "",
              "No email envelope is forwarded to ContentService",
            );
          })());
          return {
            statusCode: 200,
            data: mode === "html"
              ? "<html>Google authorization required</html>"
              : JSON.stringify({ sent: true, requestId: envelope.requestId }),
            responseOptions: {
              headers: { "Content-Type": mode === "html" ? "text/html" : "application/json" },
            },
          };
        });
      return captured;
    },
    async close() {
      await mf.dispose();
      await fetchMock.close();
    },
  };
  return harness;
}

async function deliveredCode(messages) {
  assert.equal(messages.length, 1, "Exactly one mock mail must be sent");
  const message = await messages[0];
  const text = `${message.text || ""} ${message.html || ""}`;
  const code = /\b(\d{6})\b/.exec(text)?.[1];
  assert.ok(code, "Mock email must contain a six-digit code");
  return code;
}

function assertPublicGeometryOnly(value) {
  const privateFields = new Set([
    "panels",
    "length",
    "thickness",
    "lengthAxis",
    "widthAxis",
    "materialName",
    "grain",
    "edges",
    "area",
    "accessories",
    "breakdown",
    "basePrice",
    "margin",
    "materialRate",
    "edgeRate",
    "doorHardware",
    "snapshot",
    "owner_hash",
  ]);
  const visit = (object) => {
    if (!object || typeof object !== "object") return;
    for (const [key, item] of Object.entries(object)) {
      assert.ok(!privateFields.has(key), `Private manufacturing field: ${key}`);
      if (key === "geometry") {
        assert.ok(Array.isArray(item) && item.length > 0);
        for (const panel of item) {
          assert.deepEqual(
            Object.keys(panel).sort(),
            "door" in panel
              ? ["door", "material", "position", "size"]
              : ["material", "position", "size"],
          );
          assert.equal(panel.size.length, 3);
          assert.equal(panel.position.length, 3);
          assert.ok([...panel.size, ...panel.position].every(Number.isFinite));
        }
      }
      visit(item);
    }
  };
  visit(value);
}

test("manufacturing details require both admin factors while all public design responses expose only visual geometry", async () => {
  const h = await createHarness();
  try {
    const visitor = h.client();
    const staff = h.client("203.0.113.46");
    const catalog = await visitor.request(undefined, {
      path: "/api/store?action=catalog",
    });
    assert.equal(catalog.status, 200);
    assertPublicGeometryOnly(catalog.data);
    const product = catalog.data.products[0];
    const input = { productId: product.id, config: product.defaults };
    // Authentication happens even before validating the private selector.
    assert.equal(
      (await visitor.request({ op: "cut-list", designId: "invalid" })).status,
      401,
    );
    assert.equal((await staff.login()).status, 200);
    assert.equal(
      (await staff.request({ op: "cut-list", ...input })).status,
      401,
    );
    assert.equal((await staff.verify()).status, 200);
    const current = await staff.request({ op: "cut-list", ...input });
    assert.equal(current.status, 200);
    assert.equal(current.data.source, "current");
    assert.equal(current.data.design, null);
    assert.ok(current.data.result.panels.length > 0);
    assert.ok(
      current.data.result.panels.every((panel) => panel.thickness === 18),
    );
    assert.ok(
      current.data.result.panels.every((panel) => panel.name && panel.edges),
    );
    assert.ok(current.data.result.breakdown);

    const quote = await visitor.request(input, { path: "/api/quote" });
    assert.equal(quote.status, 200);
    assert.deepEqual(Object.keys(quote.data).sort(), ["geometry", "price"]);
    assertPublicGeometryOnly(quote.data);
    const saved = await visitor.request({
      op: "save-design",
      ...input,
      quantity: 2,
    });
    assert.equal(saved.status, 201);
    assertPublicGeometryOnly(saved.data);
    const design = saved.data.design;
    const anonymous = h.client("203.0.113.47");
    assert.equal(
      (await anonymous.request({ op: "cut-list", designId: design.id })).status,
      401,
    );
    const shared = await anonymous.request(undefined, {
      path: `/api/store?action=design&id=${design.id}`,
    });
    assert.equal(shared.status, 200);
    assertPublicGeometryOnly(shared.data);
    const listed = await visitor.request(undefined, {
      path: "/api/store?action=designs",
    });
    assertPublicGeometryOnly(listed.data);
    assert.equal(listed.data.designs.length, 1);
    const changed = await visitor.request({
      op: "set-quantity",
      id: design.id,
      version: design.version,
      quantity: 3,
    });
    assert.equal(changed.status, 200);
    assertPublicGeometryOnly(changed.data);

    const dashboard = await staff.state();
    const adjusted = {
      ...dashboard.data.settings,
      materials: dashboard.data.settings.materials.map((material) => ({
        ...material,
        price: material.price + 100,
      })),
    };
    assert.equal(
      (
        await staff.request({
          op: "settings",
          settings: adjusted,
          version: dashboard.data.settingsVersion,
        })
      ).status,
      200,
    );
    const requoted = await staff.request({ op: "cut-list", ...input });
    assert.ok(requoted.data.result.price > current.data.result.price);
    const originalProduct = dashboard.data.products.find(
      (item) => item.id === product.id,
    );
    assert.equal(
      (
        await staff.request({
          op: "product",
          product: { ...originalProduct, active: false },
          expectedVersion: originalProduct.version,
        })
      ).status,
      200,
    );
    const historical = await staff.request({
      op: "cut-list",
      designId: design.id,
    });
    assert.equal(historical.status, 200);
    assert.equal(historical.data.source, "saved");
    assert.equal(historical.data.design.quantity, 3);
    assert.deepEqual(historical.data.result, current.data.result);
    assertPublicGeometryOnly(
      (
        await anonymous.request(undefined, {
          path: `/api/store?action=design&id=${design.id}`,
        })
      ).data,
    );
    assert.equal(
      (
        await staff.request({
          op: "cut-list",
          designId: design.id,
          ...input,
        })
      ).status,
      400,
    );
  } finally {
    await h.close();
  }
});

test("administration requires both factors and revokes sessions", async (t) => {
  const h = await createHarness();
  t.after(() => h.close());
  t.beforeEach(() => h.reset());

  await t.test(
    "password alone cannot access administration; full TOTP login can",
    async () => {
      const client = h.client();
      const initial = await client.state();
      assert.equal(initial.data.admin, false);
      assert.equal(initial.data.configured, true);
      assert.ok(!JSON.stringify(initial.data).includes(email));
      const first = await client.login();
      assert.equal(first.status, 200);
      assert.equal(first.data.admin, false);
      assert.equal(first.data.challenge, true);
      assert.equal(first.data.emailAvailable, true);
      assert.ok(
        first.cookies.some(
          (value) =>
            value.includes("HttpOnly") &&
            value.includes("Secure") &&
            value.includes("SameSite=Strict"),
        ),
      );
      assert.equal((await client.state()).data.admin, false);
      assert.equal(
        (await client.request({ op: "settings", settings: {}, version: 1 }))
          .status,
        401,
      );
      const token = client.cookies.get("alrazz_admin_challenge");
      const stored = await h.db
        .prepare("SELECT * FROM admin_auth_challenges")
        .first();
      assert.equal(stored.token_hash, sha256(token));
      assert.ok(!JSON.stringify(stored).includes(token));
      assert.equal((await client.verify()).data.admin, true);
      assert.equal((await client.state()).data.admin, true);
      assert.equal(await h.count("admin_auth_sessions"), 1);
    },
  );

  await t.test(
    "incorrect email and password share a generic rejection",
    async () => {
      const client = h.client();
      const wrongEmail = await client.login({ email: "nobody@example.test" });
      const wrongPassword = await client.login({
        password: "incorrect-password",
      });
      assert.equal(wrongEmail.status, 401);
      assert.deepEqual(wrongEmail.data, wrongPassword.data);
      assert.equal(await h.count("admin_auth_challenges"), 0);
    },
  );

  await t.test(
    "a code cannot bypass the password or revive an expired challenge",
    async () => {
      const client = h.client();
      assert.equal((await client.verify()).status, 401);
      await client.login();
      await h.db.prepare("UPDATE admin_auth_challenges SET expires_at=1").run();
      assert.equal((await client.verify()).status, 401);
      assert.equal(await h.count("admin_auth_sessions"), 0);
    },
  );

  await t.test(
    "concurrent replay of one challenge creates exactly one session",
    async () => {
      const client = h.client();
      await client.login();
      const copies = [client.copy(), client.copy()];
      const code = currentCode();
      const replies = await Promise.all(
        copies.map((copy) => copy.verify(code)),
      );
      assert.deepEqual(replies.map((reply) => reply.status).sort(), [200, 401]);
      assert.equal(await h.count("admin_auth_sessions"), 1);
    },
  );

  await t.test(
    "a TOTP code cannot be reused from a fresh password challenge",
    async () => {
      const first = h.client();
      const second = h.client("203.0.113.46");
      await first.login();
      await second.login();
      const code = currentCode();
      assert.equal((await first.verify(code)).status, 200);
      assert.equal((await second.verify(code)).status, 401);
      assert.equal(await h.count("admin_auth_sessions"), 1);
    },
  );

  await t.test(
    "different valid second factors cannot claim the same challenge concurrently",
    async () => {
      const client = h.client();
      await client.login();
      const totpClient = client.copy();
      const recoveryClient = client.copy();
      const replies = await Promise.all([
        totpClient.verify(),
        recoveryClient.verify(recoveryCode, "recovery"),
      ]);
      assert.deepEqual(replies.map((reply) => reply.status).sort(), [200, 401]);
      assert.equal(await h.count("admin_auth_sessions"), 1);
      assert.equal(
        await h.count("admin_auth_factors"),
        1,
        "Losing request must not consume another valid factor",
      );
    },
  );

  await t.test("logout revokes a copied session on the server", async () => {
    const client = h.client();
    await client.login();
    await client.verify();
    const copy = client.copy();
    assert.equal((await copy.state()).data.admin, true);
    assert.equal((await client.request({ op: "logout" })).status, 200);
    assert.equal((await copy.state()).data.admin, false);
    assert.equal(
      (await copy.request({ op: "settings", settings: {}, version: 1 })).status,
      401,
    );
    assert.equal(await h.count("admin_auth_sessions"), 0);
  });

  await t.test(
    "server session expiry rejects a cookie even if the browser retains it",
    async () => {
      const client = h.client();
      await client.login();
      await client.verify();
      assert.ok(client.cookies.get("alrazz_admin"));
      await h.db.prepare("UPDATE admin_auth_sessions SET expires_at=1").run();
      assert.equal((await client.state()).data.admin, false);
      assert.equal(
        (await client.request({ op: "settings", settings: {}, version: 1 }))
          .status,
        401,
      );
    },
  );

  await t.test(
    "cancel-login and replacement password login invalidate old challenges",
    async () => {
      const client = h.client();
      await client.login();
      const stale = client.copy();
      await client.login();
      assert.equal((await stale.verify()).status, 401);
      const cancelled = client.copy();
      await client.request({ op: "cancel-login" });
      assert.equal((await cancelled.verify()).status, 401);
      assert.equal(await h.count("admin_auth_sessions"), 0);
    },
  );

  await t.test(
    "recovery codes are one-use and their replay marker never expires",
    async () => {
      const first = h.client();
      await first.login();
      assert.equal((await first.verify(recoveryCode, "recovery")).status, 200);
      const second = h.client();
      await second.login();
      assert.equal((await second.verify(recoveryCode, "recovery")).status, 401);
      const used = await h.db
        .prepare(
          "SELECT * FROM admin_auth_factors WHERE factor_key LIKE 'recovery:%'",
        )
        .first();
      assert.equal(used.factor_key, `recovery:${sha256(normalizedRecovery)}`);
      assert.equal(used.expires_at, null);
    },
  );

  await t.test(
    "password retries remain bounded even after successful first factors",
    async () => {
      const client = h.client();
      for (let attempt = 0; attempt < 5; attempt++)
        assert.equal((await client.login()).status, 200);
      const limited = await client.login();
      assert.equal(limited.status, 429);
      assert.ok(Number(limited.headers.get("retry-after")) > 0);
    },
  );

  await t.test(
    "MFA guesses are bounded and cannot reset by replacing the challenge",
    async () => {
      const client = h.client();
      await client.login();
      for (let attempt = 0; attempt < 5; attempt++)
        assert.equal((await client.verify("invalid", "totp")).status, 401);
      assert.equal((await client.verify()).status, 429);
      await client.login();
      for (let attempt = 0; attempt < 4; attempt++)
        assert.equal((await client.verify("invalid", "totp")).status, 401);
      assert.equal((await client.verify()).status, 429);
      assert.equal(await h.count("admin_auth_sessions"), 0);
    },
  );

  await t.test(
    "cross-origin mutations and legacy single-factor cookies are rejected",
    async () => {
      const client = h.client();
      assert.equal(
        (
          await client.request(
            { op: "login", email, password },
            { origin: "https://attacker.example.test" },
          )
        ).status,
        403,
      );
      client.cookies.set(
        "alrazz_admin",
        `${Math.floor(Date.now() / 1000) + 3600}.00000000-0000-4000-8000-000000000000.${"a".repeat(64)}`,
      );
      assert.equal((await client.state()).data.admin, false);
      assert.equal((await client.verify()).status, 401);
    },
  );

  await t.test(
    "email delivery is password-gated, one-use, and rate-limited",
    async () => {
      const client = h.client();
      assert.equal((await client.sendEmail()).status, 401);
      await client.login();
      const messages = h.mail();
      const sent = await client.sendEmail();
      assert.equal(sent.status, 200);
      assert.equal(sent.data.sent, true);
      const code = await deliveredCode(messages);
      assert.ok(!JSON.stringify(sent.data).includes(code));
      const cooldown = await client.sendEmail();
      assert.equal(cooldown.status, 429);
      const copied = client.copy();
      assert.equal((await client.verify(code, "email")).status, 200);
      assert.equal((await copied.verify(code, "email")).status, 401);
      assert.equal(await h.count("admin_auth_sessions"), 1);
    },
  );

  await t.test(
    "resending invalidates the previous email code and preserves challenge expiry",
    async () => {
      const client = h.client();
      const login = await client.login();
      const original = h.mail();
      assert.equal((await client.sendEmail()).status, 200);
      const oldCode = await deliveredCode(original);
      await h.db
        .prepare("UPDATE admin_auth_challenges SET email_resend_after=0")
        .run();
      const replacement = h.mail();
      assert.equal((await client.sendEmail()).status, 200);
      const newCode = await deliveredCode(replacement);
      const row = await h.db
        .prepare("SELECT expires_at FROM admin_auth_challenges")
        .first();
      assert.equal(row.expires_at, login.data.challengeExpiresAt);
      if (oldCode !== newCode)
        assert.equal((await client.verify(oldCode, "email")).status, 401);
      assert.equal((await client.verify(newCode, "email")).status, 200);
    },
  );

  await t.test("concurrent email requests send exactly one code", async () => {
    const client = h.client();
    await client.login();
    const messages = h.mail();
    const replies = await Promise.all([
      client.copy().sendEmail(),
      client.copy().sendEmail(),
    ]);
    assert.deepEqual(replies.map((reply) => reply.status).sort(), [200, 429]);
    assert.equal(
      (await client.verify(await deliveredCode(messages), "email")).status,
      200,
    );
  });

  await t.test(
    "failed mail delivery exposes no provider error and creates no usable code",
    async () => {
      const client = h.client();
      await client.login();
      const messages = h.mail(503);
      const sent = await client.sendEmail();
      assert.ok(sent.status >= 500);
      assert.ok(
        !JSON.stringify(sent.data).includes("sensitive-provider-diagnostic"),
      );
      assert.equal(
        (await client.verify(await deliveredCode(messages), "email")).status,
        401,
      );
      assert.equal(await h.count("admin_auth_sessions"), 0);
      // The independent TOTP method remains available after provider failure.
      assert.equal((await client.verify()).status, 200);
    },
  );

  await t.test(
    "expired email codes cannot authenticate even with a live challenge",
    async () => {
      const client = h.client();
      await client.login();
      const messages = h.mail();
      await client.sendEmail();
      await h.db
        .prepare("UPDATE admin_auth_challenges SET email_code_expires_at=1")
        .run();
      assert.equal(
        (await client.verify(await deliveredCode(messages), "email")).status,
        401,
      );
    },
  );
});

test("password rotation invalidates sessions and challenges without reviving recovery codes", async () => {
  const h = await createHarness();
  try {
    const signedIn = h.client();
    await signedIn.login();
    assert.equal((await signedIn.verify(recoveryCode, "recovery")).status, 200);
    const pending = h.client("203.0.113.46");
    await pending.login();
    const newPassword = "changed-isolated-password-never-deployed";
    const newHash = `scrypt$32768$8$3$${salt.toString("base64url")}$${scryptSync(newPassword, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }).toString("base64url")}`;
    await h.rotate({ ADMIN_PASSWORD_HASH: newHash });
    assert.equal(
      await h.count("admin_auth_factors"),
      1,
      "Rotation preserves D1 replay history",
    );
    assert.equal((await signedIn.state()).data.admin, false);
    assert.equal((await pending.verify()).status, 401);
    const fresh = h.client("203.0.113.47");
    assert.equal((await fresh.login({ password: newPassword })).status, 200);
    assert.equal((await fresh.verify(recoveryCode, "recovery")).status, 401);
    assert.equal((await fresh.verify()).status, 200);
  } finally {
    await h.close();
  }
});

test("missing or malformed credentials never restore the old password-only login", async (t) => {
  for (const overrides of [
    { ADMIN_PASSWORD_HASH: "", ADMIN_PASSWORD: password },
    { ADMIN_TOTP_SECRET: "invalid-secret" },
    { ADMIN_RECOVERY_HASHES: "not-json" },
    { SESSION_SECRET: "short" },
  ]) {
    await t.test(Object.keys(overrides)[0], async () => {
      const h = await createHarness(overrides);
      try {
        const client = h.client();
        assert.equal((await client.state()).data.configured, false);
        assert.equal((await client.login()).status, 503);
        assert.equal((await client.verify()).status, 503);
        assert.equal(await h.count("admin_auth_sessions"), 0);
      } finally {
        await h.close();
      }
    });
  }
});

test("unconfigured email delivery fails closed while the authenticator remains usable", async () => {
  const h = await createHarness({ RESEND_API_KEY: "", ADMIN_EMAIL_FROM: "" });
  try {
    const client = h.client();
    const first = await client.login();
    assert.equal(first.data.emailAvailable, false);
    const mail = await client.sendEmail();
    assert.equal(mail.status, 503);
    assert.equal((await client.verify("000000", "email")).status, 401);
    assert.equal((await client.verify()).status, 200);
  } finally {
    await h.close();
  }
});

test("Apps Script codes require both factors and survive only one successful verification", async () => {
  const h = await createHarness(relayBindings);
  try {
    const client = h.client();
    assert.equal((await client.sendEmail()).status, 401);
    const first = await client.login();
    assert.equal(first.data.emailAvailable, true);
    assert.equal((await client.state()).data.admin, false);
    const messages = h.relay();
    const sent = await client.sendEmail();
    assert.equal(sent.status, 200);
    assert.equal(sent.data.sent, true);
    assert.equal(messages.length, 1);
    const envelope = await messages[0];
    assert.equal(messages.redirects.length, 1);
    await Promise.all(messages.redirects);
    assert.equal(JSON.stringify(sent.data).includes(envelope.code), false);
    assert.equal(JSON.stringify(sent.data).includes(envelope.signature), false);
    assert.equal((await client.state()).data.admin, false);
    assert.equal(await h.count("admin_auth_sessions"), 0);
    assert.equal((await client.sendEmail()).status, 429);
    const copied = client.copy();
    assert.equal((await client.verify(envelope.code, "email")).status, 200);
    assert.equal((await client.state()).data.admin, true);
    assert.equal((await copied.verify(envelope.code, "email")).status, 401);
    assert.equal(await h.count("admin_auth_sessions"), 1);
    await client.request({ op: "logout" });
    assert.equal((await client.state()).data.admin, false);
  } finally {
    await h.close();
  }
});

test("Apps Script HTTP 200 HTML creates no usable email code or session", async () => {
  const h = await createHarness(relayBindings);
  try {
    const client = h.client();
    await client.login();
    const messages = h.relay("html");
    const sent = await client.sendEmail();
    assert.equal(sent.status, 503);
    assert.equal(sent.data.code, "EMAIL_DELIVERY_FAILED");
    const envelope = await messages[0];
    assert.equal(messages.redirects.length, 1);
    await Promise.all(messages.redirects);
    assert.equal((await client.verify(envelope.code, "email")).status, 401);
    assert.equal(await h.count("admin_auth_sessions"), 0);
    assert.equal((await client.verify()).status, 200);
  } finally {
    await h.close();
  }
});

test("invalid relay configuration never falls back to existing Resend credentials", async () => {
  const h = await createHarness({ ...relayBindings, ADMIN_EMAIL_RELAY_SECRET: "invalid" });
  try {
    const client = h.client();
    const first = await client.login();
    assert.equal(first.data.emailAvailable, false);
    const sent = await client.sendEmail();
    assert.equal(sent.status, 503);
    assert.equal(sent.data.code, "EMAIL_NOT_CONFIGURED");
    assert.equal((await client.verify()).status, 200);
  } finally {
    await h.close();
  }
});

test("password verification requires the internal Durable Object and remains rate-limited on failure", async () => {
  const h = await createHarness({}, { passwordVerifier: false });
  try {
    const client = h.client();
    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await client.login();
      assert.equal(result.status, 503);
      assert.equal(result.data.code, "PASSWORD_VERIFIER_UNAVAILABLE");
      assert.ok(!JSON.stringify(result.data).includes(passwordHash));
    }
    assert.equal((await client.login()).status, 429);
    assert.equal(await h.count("admin_auth_challenges"), 0);
    assert.equal(await h.count("admin_auth_sessions"), 0);
  } finally {
    await h.close();
  }
});

test("the password object validates its RPC boundary and rejects stale credential fingerprints", async () => {
  // Exercise thrown RPC errors inside workerd. Miniflare's Node-side RPC proxy
  // cannot currently deserialize rejected promises from a Durable Object.
  // This HTTP probe exists only in the isolated test runtime, never the app.
  const fetchMock = createFetchMock();
  fetchMock.disableNetConnect();
  const mf = new Miniflare({
    workers: [
      {
        name: "password-boundary-probe",
        modules: true,
        compatibilityDate: "2026-05-22",
        script: `export default {
          async fetch(request, env) {
            const { password, fingerprint } = await request.json();
            const namespace = env.VERIFIER;
            const verifier = namespace.get(namespace.idFromName("alrazz-admin"));
            try {
              const valid = await verifier.verify(password, fingerprint);
              return Response.json({ ok: true, valid });
            } catch (error) {
              return Response.json({ ok: false, error: error.message });
            }
          }
        };`,
        durableObjects: {
          VERIFIER: {
            className: "AdminPasswordVerifier",
            scriptName: "alrazz-password-boundary",
            useSQLite: true,
          },
        },
        fetchMock,
      },
      {
        name: "alrazz-password-boundary",
        modules: true,
        scriptPath: fileURLToPath(
          new URL("../dist/alrazz/index.js", import.meta.url),
        ),
        compatibilityDate: "2026-05-22",
        compatibilityFlags: ["nodejs_compat"],
        bindings: { ADMIN_PASSWORD_HASH: passwordHash },
        fetchMock,
      },
    ],
  });
  async function verify(input, fingerprint) {
    const response = await mf.dispatchFetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: input, fingerprint }),
    });
    assert.equal(response.status, 200);
    return response.json();
  }
  try {
    const fingerprint = sha256(passwordHash);
    assert.deepEqual(await verify(password, fingerprint), {
      ok: true,
      valid: true,
    });
    assert.deepEqual(await verify("incorrect-password", fingerprint), {
      ok: true,
      valid: false,
    });
    for (const [input, expectedFingerprint] of [
      [null, fingerprint],
      [{ password }, fingerprint],
      ["", fingerprint],
      ["x".repeat(513), fingerprint],
      [password, null],
      [password, "not-a-fingerprint"],
      [password, "f".repeat(64)],
    ]) {
      assert.deepEqual(await verify(input, expectedFingerprint), {
        ok: false,
        error: "Password verification unavailable.",
      });
    }
  } finally {
    await mf.dispose();
    await fetchMock.close();
  }
});

test("password verification is not exposed through a public HTTP route or operation", async () => {
  const h = await createHarness();
  try {
    const client = h.client();
    for (const path of ["/api/admin-password", "/api/verify-password"]) {
      const result = await client.request(
        { password, expectedHashFingerprint: sha256(passwordHash) },
        { path },
      );
      assert.equal(result.status, 404);
    }
    const operation = await client.request({ op: "verify-password", password });
    assert.ok([401, 404].includes(operation.status));
    assert.equal(await h.count("admin_auth_challenges"), 0);
    assert.equal(await h.count("admin_auth_sessions"), 0);
  } finally {
    await h.close();
  }
});
