import type { AdminAuthEnv } from "./admin-auth.ts";
import { sha256 } from "../lib/admin-crypto.ts";

export function passkeyConfig(env: AdminAuthEnv) {
  if (env.ADMIN_PASSKEYS_ENABLED !== "1") return null;
  const rpID = env.ADMIN_PASSKEY_RP_ID || "";
  const origin = env.ADMIN_PASSKEY_ORIGIN || "";
  try {
    const url = new URL(origin);
    const local = rpID === "localhost" && url.protocol === "http:";
    if (url.origin !== origin || url.hostname !== rpID || url.username || url.password ||
        !(local || url.protocol === "https:") || !/^[a-z0-9.-]+$/.test(rpID) ||
        (!local && (!rpID.includes(".") || /^[\d.]+$/.test(rpID)))) return null;
    return { rpID, origin, owner: sha256("alrazz-owner:" + (env.ADMIN_EMAIL || "").trim().toLowerCase()) };
  } catch { return null; }
}

export async function passkeysAvailable(request: Request, env: AdminAuthEnv) {
  const config = passkeyConfig(env);
  if (!config || new URL(request.url).origin !== config.origin) return false;
  return !!await env.DB.prepare("SELECT id FROM admin_passkeys WHERE owner_id=? AND rp_id=? AND origin=? AND revoked_at IS NULL LIMIT 1")
    .bind(config.owner, config.rpID, config.origin).first();
}
