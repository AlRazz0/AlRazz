import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test, { type TestContext } from "node:test";
import {
  emailAvailable,
  sendLoginCode,
  type MailEnv,
} from "../server/admin-mailer.ts";

// Synthetic credentials only. Every transport call is mocked; these tests do
// not read environment files, send email, or contact a real provider.
const requestId = "0123456789abcdef".repeat(4);
const recipient = "owner@example.test";
const code = "012345";
const relay: MailEnv = {
  ADMIN_EMAIL_PROVIDER: "apps-script",
  ADMIN_EMAIL_RELAY_URL:
    "https://script.google.com/macros/s/isolated-mailer-test/exec",
  ADMIN_EMAIL_RELAY_SECRET: "abcdef0123456789".repeat(4),
};
const resend: MailEnv = {
  RESEND_API_KEY: "re_isolated-test-key-never-real",
  ADMIN_EMAIL_FROM: "El capo <access@example.test>",
};
const resultUrl =
  "https://script.googleusercontent.com/macros/echo?user_content_key=isolated";
const accepted = () =>
  Response.json({ sent: true, requestId }, { status: 200 });

function fetchMock(
  t: TestContext,
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
  return t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init: RequestInit = {}) =>
      handler(String(input), init),
  );
}

test("mail transport selection is explicit and invalid relay configuration never falls back", async (t) => {
  const spy = fetchMock(t, () => {
    throw new Error("An invalid configuration must not perform network I/O");
  });
  assert.equal(emailAvailable(resend), true);
  assert.equal(emailAvailable({ ...resend, ADMIN_EMAIL_PROVIDER: "resend" }), true);
  assert.equal(emailAvailable(relay), true);
  assert.equal(emailAvailable({ ...relay, ADMIN_EMAIL_RELAY_SECRET: "ABCDEF01".repeat(8) }), true);
  for (const overrides of [
    { ADMIN_EMAIL_PROVIDER: "" },
    { ADMIN_EMAIL_PROVIDER: "other" },
    { ADMIN_EMAIL_RELAY_SECRET: "" },
    { ADMIN_EMAIL_RELAY_SECRET: "a".repeat(63) },
    { ADMIN_EMAIL_RELAY_SECRET: "g".repeat(64) },
    { ADMIN_EMAIL_RELAY_SECRET: "a".repeat(64) + "\n" },
    { ADMIN_EMAIL_RELAY_URL: "" },
    { ADMIN_EMAIL_RELAY_URL: "http://script.google.com/macros/s/test/exec" },
    { ADMIN_EMAIL_RELAY_URL: "https://script.google.com.evil.test/macros/s/test/exec" },
    { ADMIN_EMAIL_RELAY_URL: "https://script.google.com@evil.test/macros/s/test/exec" },
    { ADMIN_EMAIL_RELAY_URL: "https://user:pass@script.google.com/macros/s/test/exec" },
    { ADMIN_EMAIL_RELAY_URL: "https://script.google.com/macros/s/test/dev" },
    { ADMIN_EMAIL_RELAY_URL: "https://script.google.com/macros/s/test/exec?token=x" },
    { ADMIN_EMAIL_RELAY_URL: "https://script.google.com/macros/s/test/exec#fragment" },
  ]) {
    const env = { ...resend, ...relay, ...overrides };
    assert.equal(emailAvailable(env), false);
    assert.equal(await sendLoginCode(env, recipient, code, requestId), false);
  }
  assert.equal(spy.mock.callCount(), 0);
});

test("Resend rejects malformed sender and authorization values before network I/O", async (t) => {
  const spy = fetchMock(t, () => accepted());
  for (const overrides of [
    { RESEND_API_KEY: "" },
    { RESEND_API_KEY: "re_test\r\nInjected: true" },
    { RESEND_API_KEY: " re_isolated-test-key-never-real" },
    { ADMIN_EMAIL_FROM: "" },
    { ADMIN_EMAIL_FROM: "not an email" },
    { ADMIN_EMAIL_FROM: "El capo <access@example.test>\r\nBcc: evil@example.test" },
    { ADMIN_EMAIL_FROM: "El capo <access@example.test>\u0000" },
  ]) {
    const env = { ...resend, ...overrides };
    assert.equal(emailAvailable(env), false);
    assert.equal(await sendLoginCode(env, recipient, code, requestId), false);
  }
  assert.equal(spy.mock.callCount(), 0);
});

test("Apps Script signs the exact versioned envelope using the secret as UTF-8", async (t) => {
  const timestamp = 1_712_345_678;
  t.mock.method(Date, "now", () => timestamp * 1000 + 123);
  const spy = fetchMock(t, (url, init) => {
    assert.equal(url, relay.ADMIN_EMAIL_RELAY_URL);
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "manual");
    assert.equal(new Headers(init.headers).get("content-type"), "application/json");
    assert.equal(new Headers(init.headers).has("authorization"), false);
    const envelope = JSON.parse(String(init.body));
    assert.deepEqual(envelope, {
      v: 1,
      timestamp,
      requestId,
      recipient,
      code,
      signature: createHmac("sha256", relay.ADMIN_EMAIL_RELAY_SECRET!)
        .update(JSON.stringify(["elcapo-admin-email-v1", timestamp, requestId, recipient, code]))
        .digest("hex"),
    });
    assert.equal(String(init.body).includes(relay.ADMIN_EMAIL_RELAY_SECRET!), false);
    assert.ok(init.signal instanceof AbortSignal);
    return accepted();
  });
  assert.equal(await sendLoginCode(relay, recipient, code, requestId), true);
  assert.equal(spy.mock.callCount(), 1);
});

test("ContentService redirects use one GET without credentials or the code body", async (t) => {
  for (const status of [302, 303]) {
    await t.test(String(status), async (t) => {
      let firstSignal: AbortSignal | null | undefined;
      let calls = 0;
      fetchMock(t, (url, init) => {
        calls++;
        if (calls === 1) {
          firstSignal = init.signal;
          return new Response(null, { status, headers: { Location: resultUrl } });
        }
        assert.equal(url, resultUrl);
        assert.equal(init.method, "GET");
        assert.equal(init.body, undefined);
        assert.equal(init.signal, firstSignal);
        assert.equal(init.redirect, "manual");
        assert.deepEqual([...new Headers(init.headers)], [["accept", "application/json"]]);
        return accepted();
      });
      assert.equal(await sendLoginCode(relay, recipient, code, requestId), true);
      assert.equal(calls, 2);
    });
  }
});

test("the relay cannot redirect codes to another host, path or scheme", async (t) => {
  for (const location of [
    "https://evil.example.test/macros/echo",
    "https://script.googleusercontent.com.evil.test/macros/echo",
    "https://script.googleusercontent.com@evil.test/macros/echo",
    "https://user:pass@script.googleusercontent.com/macros/echo",
    "http://script.googleusercontent.com/macros/echo",
    "https://script.googleusercontent.com:8443/macros/echo",
    "https://script.googleusercontent.com/other",
    resultUrl + "#fragment",
    "/macros/echo?relative=true",
    "not a URL",
  ]) {
    await t.test(location, async (t) => {
      const spy = fetchMock(t, () => new Response(null, {
        status: 302,
        headers: { Location: location },
      }));
      assert.equal(await sendLoginCode(relay, recipient, code, requestId), false);
      assert.equal(spy.mock.callCount(), 1);
    });
  }
});

test("redirects which preserve POST and redirect chains are rejected", async (t) => {
  for (const status of [301, 307, 308]) {
    await t.test(String(status), async (t) => {
      const spy = fetchMock(t, () => new Response(null, {
        status,
        headers: { Location: resultUrl },
      }));
      assert.equal(await sendLoginCode(relay, recipient, code, requestId), false);
      assert.equal(spy.mock.callCount(), 1);
    });
  }
  await t.test("second redirect", async (t) => {
    const spy = fetchMock(t, () => new Response(null, {
      status: 302,
      headers: { Location: resultUrl },
    }));
    assert.equal(await sendLoginCode(relay, recipient, code, requestId), false);
    assert.equal(spy.mock.callCount(), 2);
  });
});

test("only the exact JSON success receipt activates an email code", async (t) => {
  const responses = [
    () => new Response("<html>Sign in to Google</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
    () => new Response("not json", { headers: { "Content-Type": "application/json" } }),
    () => new Response(JSON.stringify({ sent: true, requestId })),
    () => Response.json({ sent: true, requestId: "f".repeat(64) }),
    () => Response.json({ sent: false, requestId }),
    () => Response.json({ sent: true, requestId, unexpected: true }),
    () => Response.json({ sent: true }),
    () => Response.json([true, requestId]),
    () => Response.json(null),
    () => Response.json({ sent: true, requestId }, { status: 403 }),
    () => Response.json({ sent: true, requestId }, { status: 500 }),
    () => Response.json({ sent: false, error: "quota" }),
    () => new Response(" ".repeat(4097) + JSON.stringify({ sent: true, requestId }), { headers: { "Content-Type": "application/json" } }),
  ];
  for (const [index, response] of responses.entries()) {
    await t.test(String(index), async (t) => {
      fetchMock(t, response);
      assert.equal(await sendLoginCode(relay, recipient, code, requestId), false);
    });
  }
});

test("transport errors and timeout fail closed without returning diagnostics", async (t) => {
  for (const error of [
    new Error("private-provider-diagnostic"),
    new DOMException("private-timeout", "TimeoutError"),
  ]) {
    await t.test(error.name, async (t) => {
      fetchMock(t, () => { throw error; });
      assert.equal(await sendLoginCode(relay, recipient, code, requestId), false);
      assert.equal(await sendLoginCode(resend, recipient, code, requestId), false);
    });
  }
});

test("the complete relay operation shares a maximum 15-second deadline", async (t) => {
  const controller = new AbortController();
  const timeout = t.mock.method(AbortSignal, "timeout", (milliseconds: number) => {
    assert.equal(milliseconds, 15000);
    return controller.signal;
  });
  let calls = 0;
  fetchMock(t, (_url, init) => {
    assert.equal(init.signal, controller.signal);
    calls++;
    return calls === 1
      ? new Response(null, { status: 302, headers: { Location: resultUrl } })
      : accepted();
  });
  assert.equal(await sendLoginCode(relay, recipient, code, requestId), true);
  assert.equal(timeout.mock.callCount(), 1);
});

test("invalid message input never leaves the server", async (t) => {
  const spy = fetchMock(t, () => accepted());
  for (const [to, digits, id] of [
    ["owner@example.test\nBcc:other@example.test", code, requestId],
    [" owner@example.test", code, requestId],
    ["not-an-email", code, requestId],
    [recipient, "12345", requestId],
    [recipient, "1234567", requestId],
    [recipient, "12a456", requestId],
    [recipient, code, "not-an-id"],
  ]) {
    assert.equal(await sendLoginCode(relay, to, digits, id), false);
    assert.equal(await sendLoginCode(resend, to, digits, id), false);
  }
  assert.equal(spy.mock.callCount(), 0);
});

test("Resend remains compatible with El capo branding and fixed recipient", async (t) => {
  const spy = fetchMock(t, (url, init) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(init.redirect, "manual");
    assert.equal(init.method, "POST");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("authorization"), `Bearer ${resend.RESEND_API_KEY}`);
    assert.equal(headers.get("idempotency-key"), `elcapo-${requestId}`);
    const message = JSON.parse(String(init.body));
    assert.equal(message.from, resend.ADMIN_EMAIL_FROM);
    assert.deepEqual(message.to, [recipient]);
    assert.equal(message.subject, "Código de acceso a El capo");
    assert.ok(message.text.includes(code));
    assert.ok(message.text.includes("El capo"));
    assert.equal(message.text.includes("AlRazz"), false);
    return Response.json({ id: "isolated-provider-message" });
  });
  assert.equal(await sendLoginCode(resend, recipient, code, requestId), true);
  assert.equal(spy.mock.callCount(), 1);
});

test("Resend redirects are never followed with the API credential", async (t) => {
  const spy = fetchMock(t, (_url, init) => {
    assert.equal(init.redirect, "manual");
    return new Response(null, { status: 302, headers: { Location: "https://evil.example.test" } });
  });
  assert.equal(await sendLoginCode(resend, recipient, code, requestId), false);
  assert.equal(spy.mock.callCount(), 1);
});
