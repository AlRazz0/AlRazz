import assert from "node:assert/strict";
import { test } from "node:test";
import { creationOptions, decodeBase64URL, encodeBase64URL, passkeyError, requestOptions, usePasskey, createPasskey } from "../lib/passkey-browser.ts";

test("WebAuthn byte conversion preserves binary values without base64 padding", () => {
  const input = new Uint8Array([0, 1, 127, 128, 254, 255]).buffer;
  const encoded = encodeBase64URL(input);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeBase64URL(encoded), input);
  for (const invalid of ["", "a", "a+b/", "YWJj=", "YW Jj"])
    assert.throws(() => decodeBase64URL(invalid));
});

test("registration options convert challenge, user and excluded credentials without mutation", () => {
  const options: PublicKeyCredentialCreationOptionsJSON = {
    challenge: "YWJj", rp: { id: "example.test", name: "Test" },
    user: { id: "dXNlcg", name: "owner@example.test", displayName: "Owner" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    excludeCredentials: [{ type: "public-key", id: "a2V5", transports: ["internal"] }],
    authenticatorSelection: { userVerification: "required" },
  };
  const converted = creationOptions(options);
  assert.equal(new TextDecoder().decode(converted.challenge), "abc");
  assert.equal(new TextDecoder().decode(converted.user.id), "user");
  assert.equal(new TextDecoder().decode(converted.excludeCredentials![0].id), "key");
  assert.equal(converted.authenticatorSelection?.userVerification, "required");
  assert.equal(options.challenge, "YWJj");
  assert.equal(options.user.id, "dXNlcg");
});

test("authentication options preserve verification requirement and transports", () => {
  const converted = requestOptions({ challenge: "YWJj", rpId: "example.test", userVerification: "required",
    allowCredentials: [{ type: "public-key", id: "a2V5", transports: ["hybrid", "unrecognized"] }] });
  assert.equal(converted.userVerification, "required");
  assert.deepEqual(converted.allowCredentials![0].transports, ["hybrid"]);
  assert.throws(() => requestOptions({ challenge: "YWJj", allowCredentials: [{ type: "password", id: "a2V5" }] }));
});

test("browser credential responses serialize all assertion and attestation fields", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const data = new Uint8Array([1, 2, 255]).buffer;
  const credential = { type: "public-key", id: "id", rawId: data,
    authenticatorAttachment: "platform", getClientExtensionResults: () => ({}),
    response: { clientDataJSON: data, authenticatorData: data, signature: data, userHandle: null,
      attestationObject: data, getTransports: () => ["internal"] } };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { credentials: {
    get: async () => credential, create: async () => credential,
  } } });
  try {
    const auth = await usePasskey({ challenge: "YWJj" });
    assert.equal(auth.response.userHandle, null);
    assert.equal(auth.response.signature, "AQL_");
    assert.equal(auth.response.authenticatorData, "AQL_");
    assert.equal(auth.rawId, "AQL_");
    const registration = await createPasskey({ challenge: "YWJj", rp: { name: "Test" },
      user: { id: "dXNlcg", name: "owner@example.test", displayName: "Owner" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }] });
    assert.equal(registration.response.attestationObject, "AQL_");
    assert.deepEqual(registration.response.transports, ["internal"]);
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});

test("cancellation explains the alternatives without echoing browser diagnostics", () => {
  const message = passkeyError(new DOMException("private diagnostic", "NotAllowedError"));
  assert.match(message, /canceló o venció/);
  assert.doesNotMatch(message, /private diagnostic/);
});
