import {
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

const SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function equalStrings(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function derivePassword(password: string, salt: Uint8Array): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, SCRYPT, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

export async function hashPassword(
  password: string,
  salt: Uint8Array = randomBytes(16),
): Promise<string> {
  if (password.length < 16 || password.length > 512)
    throw new Error("La contraseña debe tener entre 16 y 512 caracteres.");
  if (salt.length < 16 || salt.length > 32)
    throw new Error("La sal debe tener entre 16 y 32 bytes.");
  const hash = await derivePassword(password, salt);
  return `scrypt$32768$8$3$${Buffer.from(salt).toString("base64url")}$${hash.toString("base64url")}`;
}

export function validPasswordHash(encoded: string): boolean {
  const match =
    /^scrypt\$32768\$8\$3\$([A-Za-z0-9_-]{22,43})\$([A-Za-z0-9_-]{43})$/.exec(
      encoded,
    );
  if (!match) return false;
  const salt = Buffer.from(match[1], "base64url");
  const hash = Buffer.from(match[2], "base64url");
  return (
    salt.length >= 16 &&
    salt.length <= 32 &&
    hash.length === 32 &&
    salt.toString("base64url") === match[1] &&
    hash.toString("base64url") === match[2]
  );
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  if (
    password.length < 1 ||
    password.length > 512 ||
    !validPasswordHash(encoded)
  )
    return false;
  const parts = encoded.split("$");
  const expected = Buffer.from(parts[5], "base64url");
  const actual = await derivePassword(
    password,
    Buffer.from(parts[4], "base64url"),
  );
  return timingSafeEqual(actual, expected);
}

export function encodeBase32(bytes: Uint8Array): string {
  let value = 0;
  let bits = 0;
  let result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += BASE32[(value << (5 - bits)) & 31];
  return result;
}

export function decodeBase32(secret: string): Uint8Array {
  if (!/^[A-Z2-7]+$/.test(secret)) throw new Error("Secreto Base32 no válido.");
  let value = 0;
  let bits = 0;
  const output: number[] = [];
  for (const char of secret) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const bytes = Uint8Array.from(output);
  if (encodeBase32(bytes) !== secret)
    throw new Error("Secreto Base32 no canónico.");
  return bytes;
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(32));
}

export function totp(secret: string, timeSeconds: number, digits = 6): string {
  if (
    !Number.isSafeInteger(timeSeconds) ||
    timeSeconds < 0 ||
    ![6, 8].includes(digits)
  )
    throw new Error("Parámetros TOTP no válidos.");
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timeSeconds / 30)));
  const hash = createHmac("sha1", decodeBase32(secret))
    .update(counter)
    .digest();
  const offset = hash[hash.length - 1] & 15;
  const value = hash.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 10 ** digits).padStart(digits, "0");
}

export function matchTotpCounter(
  secret: string,
  code: string,
  nowSeconds: number,
): number | null {
  if (
    !/^\d{6}$/.test(code) ||
    !Number.isSafeInteger(nowSeconds) ||
    nowSeconds < 30
  )
    return null;
  const current = Math.floor(nowSeconds / 30);
  let matched: number | null = null;
  for (const delta of [0, -1, 1]) {
    const matches = equalStrings(totp(secret, (current + delta) * 30), code);
    if (matches && matched === null) matched = current + delta;
  }
  return matched;
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().replace(/-/g, "").toUpperCase();
}

export function createRecoveryCode(): string {
  return encodeBase32(randomBytes(16))
    .match(/.{1,5}/g)!
    .join("-");
}

export function hashRecoveryCode(code: string): string {
  const normalized = normalizeRecoveryCode(code);
  if (
    !/^[A-Z2-7]{26}$/.test(normalized) ||
    decodeBase32(normalized).length !== 16
  )
    throw new Error("Código de recuperación no válido.");
  return sha256(normalized);
}

export function opaqueToken(): string {
  return randomBytes(32).toString("hex");
}

export function hmacFingerprint(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}
