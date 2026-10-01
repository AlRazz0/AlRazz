import { createHmac } from "node:crypto";

export interface MailEnv {
  ADMIN_EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  ADMIN_EMAIL_FROM?: string;
  ADMIN_EMAIL_RELAY_URL?: string;
  ADMIN_EMAIL_RELAY_SECRET?: string;
}

type MailConfig =
  | { provider: "resend"; apiKey: string; from: string }
  | { provider: "apps-script"; url: string; secret: string };

const HEX_TOKEN = /^[a-f0-9]{64}$/;
const HEX_SECRET = /^[a-fA-F0-9]{64}$/;
const RELAY_URL = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

function validRecipient(value: string): boolean {
  return (
    value.length <= 254 &&
    /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value) &&
    !CONTROL_CHARACTER.test(value)
  );
}

function validSender(value: string): boolean {
  if (value.length > 320 || CONTROL_CHARACTER.test(value)) return false;
  const named = /^([^<>]+)\s*<([^<>]+)>$/.exec(value);
  return named
    ? !!named[1].trim() && validRecipient(named[2])
    : validRecipient(value);
}

function mailConfiguration(env: MailEnv): MailConfig | null {
  const provider = env.ADMIN_EMAIL_PROVIDER ?? "resend";
  if (provider === "apps-script") {
    const url = env.ADMIN_EMAIL_RELAY_URL || "";
    const secret = env.ADMIN_EMAIL_RELAY_SECRET || "";
    return RELAY_URL.test(url) && HEX_SECRET.test(secret)
      ? { provider, url, secret }
      : null;
  }
  if (provider !== "resend") return null;
  const apiKey = env.RESEND_API_KEY || "";
  const from = env.ADMIN_EMAIL_FROM || "";
  // Reject controls and malformed header values instead of advertising a
  // delivery method which cannot make a valid provider request.
  return /^re_[A-Za-z0-9_-]{8,256}$/.test(apiKey) && validSender(from)
    ? { provider, apiKey, from }
    : null;
}

export function emailAvailable(env: MailEnv): boolean {
  return mailConfiguration(env) !== null;
}

function contentServiceRedirect(location: string | null): string | null {
  if (!location || location.length > 8192) return null;
  try {
    const url = new URL(location);
    return url.protocol === "https:" &&
      url.host === "script.googleusercontent.com" &&
      url.pathname === "/macros/echo" &&
      !url.username &&
      !url.password &&
      !url.hash
      ? url.href
      : null;
  } catch {
    return null;
  }
}

async function relayAccepted(
  response: Response,
  requestId: string,
): Promise<boolean> {
  if (
    response.status !== 200 ||
    !/^application\/json(?:\s*;|$)/i.test(
      response.headers.get("content-type") || "",
    )
  )
    return false;
  const body = await response.text();
  if (body.length > 4096) return false;
  const result: unknown = JSON.parse(body);
  return (
    typeof result === "object" &&
    result !== null &&
    !Array.isArray(result) &&
    Object.keys(result).length === 2 &&
    "sent" in result &&
    result.sent === true &&
    "requestId" in result &&
    result.requestId === requestId
  );
}

export async function sendLoginCode(
  env: MailEnv,
  recipient: string,
  code: string,
  idempotencyKey: string,
): Promise<boolean> {
  const config = mailConfiguration(env);
  if (
    !config ||
    !validRecipient(recipient) ||
    !/^\d{6}$/.test(code) ||
    !HEX_TOKEN.test(idempotencyKey)
  )
    return false;
  try {
    // One signal bounds the entire operation, including Google's response
    // redirect and body reading. The five-minute login challenge is unchanged.
    const signal = AbortSignal.timeout(15000);
    if (config.provider === "apps-script") {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createHmac("sha256", config.secret)
        .update(
          JSON.stringify([
            "elcapo-admin-email-v1",
            timestamp,
            idempotencyKey,
            recipient,
            code,
          ]),
        )
        .digest("hex");
      let response = await fetch(config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          v: 1,
          timestamp,
          requestId: idempotencyKey,
          recipient,
          code,
          signature,
        }),
        redirect: "manual",
        signal,
      });
      if (response.status === 302 || response.status === 303) {
        const location = contentServiceRedirect(response.headers.get("location"));
        if (!location) return false;
        // ContentService serves the result at a one-time URL. Never forward
        // the code, signature, request body or authorization headers there.
        response = await fetch(location, {
          method: "GET",
          headers: { Accept: "application/json" },
          redirect: "manual",
          signal,
        });
      }
      return await relayAccepted(response, idempotencyKey);
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `elcapo-${idempotencyKey}`,
      },
      body: JSON.stringify({
        from: config.from,
        to: [recipient],
        subject: "Código de acceso a El capo",
        text: `Tu código de verificación de El capo es ${code}.\n\nSolo sirve para el inicio de sesión que acabas de solicitar y vence en un máximo de 5 minutos. No lo compartas. Si no solicitaste el acceso, cambia tu contraseña administrativa.`,
      }),
      redirect: "manual",
      signal,
    });
    // Provider bodies can contain personal data; never return or log them.
    return response.ok;
  } catch {
    return false;
  }
}
