import {
  decodeBase32,
  equalStrings,
  hashRecoveryCode,
  hmacFingerprint,
  matchTotpCounter,
  opaqueToken,
  sha256,
  validPasswordHash,
  verifyPassword,
} from "../lib/admin-crypto.ts";
import { randomInt } from "node:crypto";
import { emailAvailable, sendLoginCode, type MailEnv } from "./admin-mailer.ts";

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
export interface Database {
  prepare(sql: string): Statement;
  batch<T = unknown>(statements: Statement[]): Promise<D1Result<T>[]>;
}
export interface AdminAuthEnv extends MailEnv {
  DB: Database;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_TOTP_SECRET?: string;
  ADMIN_RECOVERY_HASHES?: string;
  SESSION_SECRET?: string;
}

const SESSION_COOKIE = "alrazz_admin";
const CHALLENGE_COOKIE = "alrazz_admin_challenge";
const SESSION_SECONDS = 8 * 60 * 60;
const CHALLENGE_SECONDS = 5 * 60;
const RATE_SECONDS = 15 * 60;
const TOKEN = /^[a-f0-9]{64}$/;
type AuthConfig = {
  email: string;
  passwordHash: string;
  totpSecret: string;
  recoveryHashes: string[];
  fingerprint: string;
};
type Challenge = {
  token_hash: string;
  expires_at: number;
  email_send_id: string | null;
  email_code_hash: string | null;
  email_code_expires_at: number | null;
  email_resend_after: number;
};

export class AuthError extends Error {
  status: number;
  code: string;
  retryAfter?: number;
  constructor(
    status: number,
    message: string,
    code: string,
    retryAfter?: number,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function invalidCredentials(): never {
  throw new AuthError(
    401,
    "No se pudo verificar el acceso. Revisa tus credenciales e inténtalo de nuevo.",
    "INVALID_CREDENTIALS",
  );
}

export function configured(env: AdminAuthEnv): boolean {
  return configuration(env) !== null;
}

function configuration(env: AdminAuthEnv): AuthConfig | null {
  const email = (env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !env.ADMIN_PASSWORD_HASH ||
    !validPasswordHash(env.ADMIN_PASSWORD_HASH) ||
    !env.SESSION_SECRET ||
    env.SESSION_SECRET.length < 32 ||
    !env.ADMIN_TOTP_SECRET ||
    !env.ADMIN_RECOVERY_HASHES
  )
    return null;
  try {
    const secretBytes = decodeBase32(env.ADMIN_TOTP_SECRET);
    if (secretBytes.length < 20 || secretBytes.length > 64) return null;
    const recoveryHashes: unknown = JSON.parse(env.ADMIN_RECOVERY_HASHES);
    if (
      !Array.isArray(recoveryHashes) ||
      recoveryHashes.length < 1 ||
      recoveryHashes.length > 20 ||
      recoveryHashes.some(
        (hash) => typeof hash !== "string" || !TOKEN.test(hash),
      ) ||
      new Set(recoveryHashes).size !== recoveryHashes.length
    )
      return null;
    const values = [
      email,
      env.ADMIN_PASSWORD_HASH,
      env.ADMIN_TOTP_SECRET,
      recoveryHashes,
    ];
    return {
      email,
      passwordHash: env.ADMIN_PASSWORD_HASH,
      totpSecret: env.ADMIN_TOTP_SECRET,
      recoveryHashes,
      fingerprint: hmacFingerprint(JSON.stringify(values), env.SESSION_SECRET),
    };
  } catch {
    return null;
  }
}

function requireConfiguration(env: AdminAuthEnv): AuthConfig {
  const config = configuration(env);
  if (!config)
    throw new AuthError(
      503,
      "El acceso administrativo todavía no está configurado.",
      "ADMIN_NOT_CONFIGURED",
    );
  return config;
}

function requireSecureTransport(request: Request) {
  const url = new URL(request.url);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  ) {
    throw new AuthError(
      403,
      "El acceso administrativo requiere una conexión HTTPS.",
      "HTTPS_REQUIRED",
    );
  }
}

function cookieToken(request: Request, name: string): string | null {
  const value = (request.headers.get("cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(name + "="))
    ?.slice(name.length + 1);
  return value && TOKEN.test(value) ? value : null;
}

function cookie(
  request: Request,
  name: string,
  value: string,
  seconds: number,
): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

function reply(data: unknown, cookies: string[] = []): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(JSON.stringify(data), { status: 200, headers });
}

async function challenge(
  request: Request,
  env: AdminAuthEnv,
  config: AuthConfig,
  now: number,
): Promise<Challenge | null> {
  const token = cookieToken(request, CHALLENGE_COOKIE);
  if (!token) return null;
  return env.DB.prepare(
    "SELECT token_hash,expires_at,email_send_id,email_code_hash,email_code_expires_at,email_resend_after FROM admin_auth_challenges WHERE token_hash=? AND credential_hash=? AND expires_at>? AND consumed_by IS NULL",
  )
    .bind(sha256(token), config.fingerprint, now)
    .first<Challenge>();
}

export async function admin(
  request: Request,
  env: AdminAuthEnv,
): Promise<boolean> {
  requireSecureTransport(request);
  const config = configuration(env);
  const token = cookieToken(request, SESSION_COOKIE);
  if (!config || !token) return false;
  const row = await env.DB.prepare(
    "SELECT token_hash FROM admin_auth_sessions WHERE token_hash=? AND credential_hash=? AND expires_at>?",
  )
    .bind(sha256(token), config.fingerprint, Math.floor(Date.now() / 1000))
    .first();
  return !!row;
}

export async function adminState(request: Request, env: AdminAuthEnv) {
  requireSecureTransport(request);
  const config = configuration(env);
  if (!config)
    return {
      admin: false,
      configured: false,
      challenge: false,
      emailAvailable: false,
    };
  const pending = await challenge(
    request,
    env,
    config,
    Math.floor(Date.now() / 1000),
  );
  return {
    admin: false,
    configured: true,
    challenge: !!pending,
    emailAvailable: emailAvailable(env),
    ...(pending ? { challengeExpiresAt: pending.expires_at } : {}),
  };
}

export async function requireAdmin(
  request: Request,
  env: AdminAuthEnv,
): Promise<void> {
  requireSecureTransport(request);
  requireConfiguration(env);
  if (!(await admin(request, env)))
    throw new AuthError(
      401,
      "Inicia sesión y completa la verificación en dos pasos para administrar el catálogo.",
      "UNAUTHORIZED",
    );
}

async function throttle(
  env: AdminAuthEnv,
  buckets: { key: string; max: number }[],
  now: number,
): Promise<void> {
  // Batch increments are serialized in D1; checks happen before any expensive KDF.
  // Successful first factors never clear counters for either authentication step.
  const results = await env.DB.batch<{ attempts: number; reset_at: number }>(
    buckets.map(({ key }) =>
      env.DB.prepare(
        `INSERT INTO login_limits(bucket,attempts,reset_at) VALUES(?,1,?)
    ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END, reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END
    RETURNING attempts,reset_at`,
      ).bind(sha256(key), now + RATE_SECONDS, now, now),
    ),
  );
  let retryAfter = 0;
  for (let i = 0; i < results.length; i++) {
    const result = results[i].results[0];
    if (!result || result.attempts > buckets[i].max)
      retryAfter = Math.max(
        retryAfter,
        (result?.reset_at || now + RATE_SECONDS) - now,
      );
  }
  if (retryAfter)
    throw new AuthError(
      429,
      "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
      "RATE_LIMITED",
      Math.max(1, retryAfter),
    );
}

function ipIdentity(request: Request): string {
  // Cloudflare overwrites this header at its edge. X-Forwarded-For is not trusted.
  return request.headers.get("cf-connecting-ip") || "unknown-or-local";
}

async function cleanup(env: AdminAuthEnv, now: number) {
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM admin_auth_challenges WHERE expires_at<=?",
    ).bind(now),
    env.DB.prepare("DELETE FROM admin_auth_sessions WHERE expires_at<=?").bind(
      now,
    ),
    env.DB.prepare(
      "DELETE FROM admin_auth_factors WHERE expires_at IS NOT NULL AND expires_at<?",
    ).bind(now),
    env.DB.prepare("DELETE FROM login_limits WHERE reset_at<?").bind(
      now - 86400,
    ),
  ]);
}

export async function login(
  request: Request,
  env: AdminAuthEnv,
  data: Record<string, unknown>,
): Promise<Response> {
  requireSecureTransport(request);
  const config = requireConfiguration(env);
  const now = Math.floor(Date.now() / 1000);
  await throttle(
    env,
    [
      { key: `password:ip:${ipIdentity(request)}`, max: 5 },
      { key: `password:account:${config.email}`, max: 20 },
    ],
    now,
  );
  if (
    typeof data.email !== "string" ||
    data.email.length > 254 ||
    typeof data.password !== "string" ||
    data.password.length < 1 ||
    data.password.length > 512
  )
    invalidCredentials();
  // Run the same KDF for incorrect emails to avoid account enumeration by timing.
  const passwordMatches = await verifyPassword(
    data.password,
    config.passwordHash,
  );
  const emailMatches = equalStrings(
    sha256(data.email.trim().toLowerCase()),
    sha256(config.email),
  );
  if (!passwordMatches || !emailMatches) invalidCredentials();
  await cleanup(env, now);
  const token = opaqueToken();
  const oldChallenge = cookieToken(request, CHALLENGE_COOKIE);
  const oldSession = cookieToken(request, SESSION_COOKIE);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM admin_auth_challenges WHERE token_hash=?").bind(
      oldChallenge ? sha256(oldChallenge) : "",
    ),
    env.DB.prepare("DELETE FROM admin_auth_sessions WHERE token_hash=?").bind(
      oldSession ? sha256(oldSession) : "",
    ),
    env.DB.prepare(
      "INSERT INTO admin_auth_challenges(token_hash,credential_hash,expires_at) VALUES(?,?,?)",
    ).bind(sha256(token), config.fingerprint, now + CHALLENGE_SECONDS),
  ]);
  return reply(
    {
      admin: false,
      challenge: true,
      challengeExpiresAt: now + CHALLENGE_SECONDS,
      emailAvailable: emailAvailable(env),
    },
    [
      cookie(request, CHALLENGE_COOKIE, token, CHALLENGE_SECONDS),
      cookie(request, SESSION_COOKIE, "", 0),
    ],
  );
}

export async function requestEmailCode(
  request: Request,
  env: AdminAuthEnv,
): Promise<Response> {
  requireSecureTransport(request);
  const config = requireConfiguration(env);
  const now = Math.floor(Date.now() / 1000);
  const pending = await challenge(request, env, config, now);
  if (!pending) invalidCredentials();
  if (!emailAvailable(env))
    throw new AuthError(
      503,
      "La verificación por correo todavía no está configurada. Usa tu aplicación autenticadora o un código de recuperación.",
      "EMAIL_NOT_CONFIGURED",
    );
  if (pending.email_resend_after > now)
    throw new AuthError(
      429,
      "Espera un minuto entre envíos de correo.",
      "RATE_LIMITED",
      pending.email_resend_after - now,
    );
  await throttle(
    env,
    [
      { key: `email:account:${config.email}`, max: 5 },
      { key: `email:ip:${ipIdentity(request)}`, max: 5 },
    ],
    now,
  );
  const sendId = opaqueToken();
  // Reserve BEFORE network I/O. Concurrent sends cannot bypass the cooldown.
  // A resend invalidates the previous email code even when delivery fails.
  const reservation = await env.DB.prepare(
    `UPDATE admin_auth_challenges SET email_send_id=?,email_resend_after=?,email_code_hash=NULL,email_code_expires_at=NULL
    WHERE token_hash=? AND credential_hash=? AND expires_at>? AND consumed_by IS NULL AND email_resend_after<=?`,
  )
    .bind(sendId, now + 60, pending.token_hash, config.fingerprint, now, now)
    .run();
  if (reservation.meta.changes !== 1)
    throw new AuthError(
      429,
      "No se puede enviar otro código todavía. Espera un minuto.",
      "RATE_LIMITED",
      60,
    );
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const codeHash = hmacFingerprint(
    `email:${pending.token_hash}:${sendId}:${code}`,
    env.SESSION_SECRET!,
  );
  const sent = await sendLoginCode(
    env,
    config.email,
    code,
    sha256(`${pending.token_hash}:${sendId}`),
  );
  if (!sent)
    throw new AuthError(
      503,
      "No se pudo enviar el correo. Inténtalo más tarde o usa otro método de verificación.",
      "EMAIL_DELIVERY_FAILED",
    );
  const finishedAt = Math.floor(Date.now() / 1000);
  const activated = await env.DB.prepare(
    `UPDATE admin_auth_challenges SET email_code_hash=?,email_code_expires_at=?
    WHERE token_hash=? AND credential_hash=? AND email_send_id=? AND expires_at>? AND consumed_by IS NULL`,
  )
    .bind(
      codeHash,
      Math.min(pending.expires_at, now + 300),
      pending.token_hash,
      config.fingerprint,
      sendId,
      finishedAt,
    )
    .run();
  if (activated.meta.changes !== 1) invalidCredentials();
  return reply({ sent: true, retryAfter: 60 });
}

export async function verifyLogin(
  request: Request,
  env: AdminAuthEnv,
  data: Record<string, unknown>,
): Promise<Response> {
  requireSecureTransport(request);
  const config = requireConfiguration(env);
  const now = Math.floor(Date.now() / 1000);
  const pending = await challenge(request, env, config, now);
  if (!pending) invalidCredentials();
  await throttle(
    env,
    [
      { key: `factor:account:${config.email}`, max: 10 },
      { key: `factor:challenge:${pending.token_hash}`, max: 5 },
      { key: `factor:ip:${ipIdentity(request)}`, max: 10 },
    ],
    now,
  );
  if (
    typeof data.code !== "string" ||
    data.code.length > 80 ||
    (data.method !== "totp" &&
      data.method !== "recovery" &&
      data.method !== "email")
  )
    invalidCredentials();
  let factorKey = "";
  let factorExpiry: number | null = null;
  let emailHash: string | null = null;
  if (data.method === "totp") {
    const counter = matchTotpCounter(config.totpSecret, data.code.trim(), now);
    if (counter === null) invalidCredentials();
    factorKey = `totp:${sha256(decodeBase32(config.totpSecret))}:${counter}`;
    // Keep the replay marker beyond the last accepted drift window.
    factorExpiry = counter * 30 + 90;
  } else if (data.method === "recovery") {
    let hash = "";
    try {
      hash = hashRecoveryCode(data.code);
    } catch {
      invalidCredentials();
    }
    let found = false;
    for (const expected of config.recoveryHashes)
      found = equalStrings(expected, hash) || found;
    if (!found) invalidCredentials();
    factorKey = `recovery:${hash}`;
  } else {
    if (
      !pending.email_send_id ||
      !pending.email_code_hash ||
      !pending.email_code_expires_at ||
      pending.email_code_expires_at <= now ||
      !/^\d{6}$/.test(data.code.trim())
    )
      invalidCredentials();
    emailHash = hmacFingerprint(
      `email:${pending.token_hash}:${pending.email_send_id}:${data.code.trim()}`,
      env.SESSION_SECRET!,
    );
    if (!equalStrings(emailHash, pending.email_code_hash)) invalidCredentials();
    factorKey = `email:${pending.token_hash}:${pending.email_send_id}`;
    factorExpiry = pending.expires_at;
  }
  const sessionToken = opaqueToken();
  const sessionHash = sha256(sessionToken);
  // D1 batch is transactional. Only the request that claims BOTH this challenge
  // and this unused factor can create a session, including concurrent requests.
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO admin_auth_factors(factor_key,claim_hash,used_at,expires_at)
      SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM admin_auth_challenges WHERE token_hash=? AND credential_hash=? AND expires_at>? AND consumed_by IS NULL
        AND (? IS NULL OR (email_code_hash=? AND email_code_expires_at>?)))`,
    ).bind(
      factorKey,
      sessionHash,
      now,
      factorExpiry,
      pending.token_hash,
      config.fingerprint,
      now,
      emailHash,
      emailHash,
      now,
    ),
    env.DB.prepare(
      `UPDATE admin_auth_challenges SET consumed_by=? WHERE token_hash=? AND credential_hash=? AND expires_at>? AND consumed_by IS NULL
      AND EXISTS (SELECT 1 FROM admin_auth_factors WHERE factor_key=? AND claim_hash=?)`,
    ).bind(
      sessionHash,
      pending.token_hash,
      config.fingerprint,
      now,
      factorKey,
      sessionHash,
    ),
    env.DB.prepare(
      `INSERT INTO admin_auth_sessions(token_hash,credential_hash,expires_at)
      SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM admin_auth_challenges WHERE token_hash=? AND credential_hash=? AND consumed_by=?)
      AND EXISTS (SELECT 1 FROM admin_auth_factors WHERE factor_key=? AND claim_hash=?)`,
    ).bind(
      sessionHash,
      config.fingerprint,
      now + SESSION_SECONDS,
      pending.token_hash,
      config.fingerprint,
      sessionHash,
      factorKey,
      sessionHash,
    ),
  ]);
  if (results[2].meta.changes !== 1) invalidCredentials();
  return reply({ admin: true }, [
    cookie(request, SESSION_COOKIE, sessionToken, SESSION_SECONDS),
    cookie(request, CHALLENGE_COOKIE, "", 0),
  ]);
}

export async function cancelLogin(
  request: Request,
  env: AdminAuthEnv,
): Promise<Response> {
  requireSecureTransport(request);
  const token = cookieToken(request, CHALLENGE_COOKIE);
  if (token)
    await env.DB.prepare("DELETE FROM admin_auth_challenges WHERE token_hash=?")
      .bind(sha256(token))
      .run();
  return reply({ admin: false, challenge: false }, [
    cookie(request, CHALLENGE_COOKIE, "", 0),
  ]);
}

export async function logout(
  request: Request,
  env: AdminAuthEnv,
): Promise<Response> {
  requireSecureTransport(request);
  const session = cookieToken(request, SESSION_COOKIE);
  const pending = cookieToken(request, CHALLENGE_COOKIE);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM admin_auth_sessions WHERE token_hash=?").bind(
      session ? sha256(session) : "",
    ),
    env.DB.prepare("DELETE FROM admin_auth_challenges WHERE token_hash=?").bind(
      pending ? sha256(pending) : "",
    ),
  ]);
  return reply({ admin: false, challenge: false }, [
    cookie(request, SESSION_COOKIE, "", 0),
    cookie(request, CHALLENGE_COOKIE, "", 0),
  ]);
}
