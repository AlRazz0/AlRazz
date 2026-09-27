import test from "node:test";
import assert from "node:assert/strict";
import {
  createRecoveryCode,
  decodeBase32,
  encodeBase32,
  equalStrings,
  generateTotpSecret,
  hashPassword,
  hashRecoveryCode,
  hmacFingerprint,
  matchTotpCounter,
  normalizeRecoveryCode,
  opaqueToken,
  sha256,
  totp,
  validPasswordHash,
  verifyPassword,
} from "../lib/admin-crypto.ts";
import { configured, type AdminAuthEnv } from "../server/admin-auth.ts";

const RFC_SECRET = encodeBase32(Buffer.from("12345678901234567890"));

test("TOTP SHA-1 matches every RFC 6238 Appendix B vector", () => {
  const vectors: [number, string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];
  for (const [seconds, expected] of vectors) {
    assert.equal(totp(RFC_SECRET, seconds, 8), expected);
    assert.equal(totp(RFC_SECRET, seconds), expected.slice(-6));
  }
});

test("TOTP accepts only six digits and the current/adjacent 30-second counters", () => {
  const now = 1234567890;
  const counter = Math.floor(now / 30);
  for (const delta of [-1, 0, 1])
    assert.equal(
      matchTotpCounter(RFC_SECRET, totp(RFC_SECRET, now + delta * 30), now),
      counter + delta,
    );
  assert.equal(
    matchTotpCounter(RFC_SECRET, totp(RFC_SECRET, now - 60), now),
    null,
  );
  assert.equal(
    matchTotpCounter(RFC_SECRET, totp(RFC_SECRET, now + 60), now),
    null,
  );
  for (const invalid of [
    "",
    "12345",
    "1234567",
    "123 456",
    "１２３４５６",
    "abcdef",
  ])
    assert.equal(matchTotpCounter(RFC_SECRET, invalid, now), null);
});

test("Base32 is canonical RFC 4648 and rejects ignored or nonzero trailing bits", () => {
  for (const [plain, encoded] of [
    ["f", "MY"],
    ["fo", "MZXQ"],
    ["foo", "MZXW6"],
    ["foob", "MZXW6YQ"],
    ["fooba", "MZXW6YTB"],
    ["foobar", "MZXW6YTBOI"],
  ]) {
    assert.equal(encodeBase32(Buffer.from(plain)), encoded);
    assert.equal(Buffer.from(decodeBase32(encoded)).toString(), plain);
  }
  for (const invalid of ["my", "MY=", "MZ", "M Y", "A", "0123456789", ""])
    assert.throws(() => decodeBase32(invalid));
  assert.equal(decodeBase32(generateTotpSecret()).length, 32);
});

test("scrypt hashes use unique salts, fixed approved work factors, and exact passwords", async () => {
  const password = "Una contraseña única 2026!";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(validPasswordHash(first));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password.toUpperCase(), first), false);
  assert.equal(await verifyPassword(password + " ", first), false);
  assert.equal(await verifyPassword("", first), false);
  for (const invalid of [
    first.replace("32768", "16384"),
    first.replace("$8$3$", "$8$1$"),
    first + "=",
    "plaintext",
    "scrypt$32768$8$3$x$y",
  ]) {
    assert.equal(validPasswordHash(invalid), false);
    assert.equal(await verifyPassword(password, invalid), false);
  }
  await assert.rejects(hashPassword("too short"));
  await assert.rejects(hashPassword("x".repeat(513)));
  await assert.rejects(hashPassword(password, new Uint8Array(8)));
});

test("recovery codes contain 128 random bits and normalize only casing/hyphens", () => {
  const codes = Array.from({ length: 32 }, () => createRecoveryCode());
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) {
    const normalized = normalizeRecoveryCode(code);
    assert.equal(decodeBase32(normalized).length, 16);
    assert.match(hashRecoveryCode(code), /^[a-f0-9]{64}$/);
    assert.equal(
      hashRecoveryCode(` ${code.toLowerCase()} `),
      hashRecoveryCode(normalized),
    );
    assert.notEqual(hashRecoveryCode(code), normalized);
  }
  for (const invalid of [
    "123456",
    "A".repeat(25),
    "A".repeat(27),
    "A".repeat(25) + "B",
    "A".repeat(13) + " " + "A".repeat(13),
  ])
    assert.throws(() => hashRecoveryCode(invalid));
});

test("token generation and credential fingerprints are cryptographically separated", () => {
  const tokens = Array.from({ length: 32 }, () => opaqueToken());
  assert.equal(new Set(tokens).size, tokens.length);
  tokens.forEach((token) => assert.match(token, /^[a-f0-9]{64}$/));
  assert.equal(
    sha256("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.notEqual(
    hmacFingerprint("credentials", "secret-a"),
    hmacFingerprint("credentials", "secret-b"),
  );
  assert.notEqual(
    hmacFingerprint("credentials-a", "secret"),
    hmacFingerprint("credentials-b", "secret"),
  );
  assert.equal(equalStrings("same", "same"), true);
  assert.equal(equalStrings("same", "sAme"), false);
  assert.equal(equalStrings("same", "same-longer"), false);
});

test("administration fails closed unless every credential is valid; email provider remains optional", async () => {
  const env: AdminAuthEnv = {
    DB: {} as AdminAuthEnv["DB"],
    ADMIN_EMAIL: "owner@example.test",
    ADMIN_PASSWORD_HASH: await hashPassword(
      "A sufficiently long test password!",
    ),
    ADMIN_TOTP_SECRET: generateTotpSecret(),
    ADMIN_RECOVERY_HASHES: JSON.stringify([
      hashRecoveryCode(createRecoveryCode()),
    ]),
    SESSION_SECRET: "test-session-signing-secret-with-32-characters",
  };
  assert.equal(configured(env), true);
  for (const key of [
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD_HASH",
    "ADMIN_TOTP_SECRET",
    "ADMIN_RECOVERY_HASHES",
    "SESSION_SECRET",
  ] as const)
    assert.equal(configured({ ...env, [key]: "" }), false, key);
  assert.equal(configured({ ...env, ADMIN_EMAIL: "invalid" }), false);
  assert.equal(
    configured({ ...env, ADMIN_TOTP_SECRET: encodeBase32(new Uint8Array(16)) }),
    false,
  );
  assert.equal(configured({ ...env, ADMIN_RECOVERY_HASHES: "[]" }), false);
  assert.equal(
    configured({ ...env, ADMIN_RECOVERY_HASHES: "not-json" }),
    false,
  );
  assert.equal(
    configured({
      ...env,
      ADMIN_RECOVERY_HASHES: JSON.stringify(["a".repeat(64), "a".repeat(64)]),
    }),
    false,
  );
});
