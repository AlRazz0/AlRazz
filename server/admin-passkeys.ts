import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
  type RegistrationResponseJSON, type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { AuthError, admin, requireConfiguration, requireSecureTransport, cookieToken, cookie,
  reply, challenge, throttle, ipIdentity, type AdminAuthEnv } from "./admin-auth.ts";
import { passkeyConfig } from "./passkey-config.ts";
import { opaqueToken, sha256 } from "../lib/admin-crypto.ts";

type KeyRow = { id:string; owner_id:string; label:string; public_key:string; counter:number;
  device_type:string; backed_up:number; rp_id:string; origin:string; created_at:number;
  last_used_at:number|null; revoked_at:number|null; };
type Ceremony = { id:string; purpose:string; challenge:string; binding_hash:string; credential_hash:string;
  owner_id:string; user_handle:string; rp_id:string; origin:string; label:string; allowed_credentials:string; expires_at:number; };
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const unb64 = (value: string) => new Uint8Array(Buffer.from(value, "base64url"));
const now = () => Math.floor(Date.now()/1000);
function fail(message="No se pudo verificar la llave. Inicia un intento nuevo.", status=400):never {
  throw new AuthError(status,message,"PASSKEY_REJECTED");
};
function trusted(request:Request,env:AdminAuthEnv) {
  requireSecureTransport(request);
  const config = passkeyConfig(env);
  if (!config || new URL(request.url).origin !== config.origin) fail("Las llaves todavía no están habilitadas en esta dirección.",503);
  return config;
}
// The same predicate protects both ongoing management ceremonies and their final writes.
const LIVE_SESSION = `EXISTS (SELECT 1 FROM admin_auth_sessions s WHERE s.token_hash=?
  AND s.credential_hash=? AND s.expires_at>? AND
  (s.passkey_id IS NULL OR EXISTS(SELECT 1 FROM admin_passkeys k WHERE k.id=s.passkey_id AND k.revoked_at IS NULL)))`;
async function revalidate(request:Request,env:AdminAuthEnv,data:Record<string,unknown>) {
  if (!await admin(request,env)) fail("Completa primero los dos pasos del acceso.",401);
  const config=requireConfiguration(env);
  await throttle(env,[{key:`passkey-manage:account:${config.email}`,max:10},{key:`passkey-manage:ip:${ipIdentity(request)}`,max:15}],now());
  if(typeof data.password!=="string" || data.password.length<1 || data.password.length>512) fail("Confirma tu contraseña actual.",403);
  let matches=false;
  try { matches=await env.ADMIN_PASSWORD_VERIFIER!.get(env.ADMIN_PASSWORD_VERIFIER!.idFromName("alrazz-admin")).verify(data.password,sha256(config.passwordHash)); }
  catch { fail("La comprobación de contraseña no está disponible.",503); }
  if(!matches || !await admin(request,env)) fail("Confirma tu contraseña actual.",403);
  return { auth:config, binding:sha256(cookieToken(request,"alrazz_admin")!) };
}
async function identity(env:AdminAuthEnv,owner:string) {
  await env.DB.prepare("INSERT OR IGNORE INTO admin_passkey_identity(owner_id,user_handle) VALUES(?,?)").bind(owner,b64(crypto.getRandomValues(new Uint8Array(32)))).run();
  return (await env.DB.prepare("SELECT user_handle FROM admin_passkey_identity WHERE owner_id=?").bind(owner).first<{user_handle:string}>())!.user_handle;
}
async function keys(env:AdminAuthEnv,config:NonNullable<ReturnType<typeof passkeyConfig>>) {
  return (await env.DB.prepare("SELECT * FROM admin_passkeys WHERE owner_id=? AND rp_id=? AND origin=? AND revoked_at IS NULL")
    .bind(config.owner,config.rpID,config.origin).all<KeyRow>()).results;
}
async function saveCeremony(env:AdminAuthEnv,item:Ceremony) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM admin_passkey_ceremonies WHERE expires_at<?").bind(now()-86400),
    env.DB.prepare("UPDATE admin_passkey_ceremonies SET consumed_by=? WHERE binding_hash=? AND purpose=? AND consumed_by IS NULL").bind("superseded",item.binding_hash,item.purpose),
    env.DB.prepare(`INSERT INTO admin_passkey_ceremonies(id,purpose,challenge,binding_hash,credential_hash,owner_id,user_handle,rp_id,origin,label,allowed_credentials,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(item.id,item.purpose,item.challenge,item.binding_hash,item.credential_hash,item.owner_id,item.user_handle,item.rp_id,item.origin,item.label,item.allowed_credentials,item.expires_at),
  ]);
}
async function consume(request:Request,env:AdminAuthEnv,data:Record<string,unknown>,purpose:"register"|"authenticate") {
  const config=trusted(request,env),auth=requireConfiguration(env),time=now();
  const bindingToken=cookieToken(request,purpose==="register"?"alrazz_admin":"alrazz_admin_challenge");
  if(!bindingToken || typeof data.ceremonyId!=="string" || !/^[a-f0-9]{64}$/.test(data.ceremonyId)) fail();
  if(purpose==="register" && !await admin(request,env)) fail("Tu sesión ha caducado.",401);
  if(purpose==="authenticate" && !await challenge(request,env,auth,time)) fail("Vuelve a confirmar tu contraseña.",401);
  await throttle(env,[{key:`passkey-verify:account:${auth.email}`,max:10},{key:`passkey-verify:ip:${ipIdentity(request)}`,max:15}],time);
  const item=await env.DB.prepare(`SELECT * FROM admin_passkey_ceremonies WHERE id=? AND purpose=? AND binding_hash=? AND credential_hash=? AND owner_id=? AND rp_id=? AND origin=? AND expires_at>? AND consumed_by IS NULL`)
    .bind(data.ceremonyId,purpose,sha256(bindingToken),auth.fingerprint,config.owner,config.rpID,config.origin,time).first<Ceremony>();
  if(!item) fail();
  const claim=opaqueToken();
  const result=await env.DB.prepare("UPDATE admin_passkey_ceremonies SET consumed_by=? WHERE id=? AND consumed_by IS NULL AND expires_at>?").bind(claim,item.id,time).run();
  if(result.meta.changes!==1) fail();
  return {config,auth,item,claim};
}
function response(data:Record<string,unknown>) {
  const value=data.credential as RegistrationResponseJSON|AuthenticationResponseJSON;
  try {
    if(!value || typeof value!=="object" || JSON.stringify(value).length>32768 ||
      typeof value.id!=="string" || !/^[A-Za-z0-9_-]{1,1364}$/.test(value.id) ||
      b64(unb64(value.id))!==value.id || value.rawId!==value.id || value.type!=="public-key" ||
      !value.response || typeof value.response.clientDataJSON!=="string") fail();
    const client=JSON.parse(Buffer.from(value.response.clientDataJSON,"base64url").toString("utf8"));
    if(!client || typeof client!=="object" || Array.isArray(client) || (client.crossOrigin!==undefined && client.crossOrigin!==false) || client.topOrigin!==undefined) fail();
    return value;
  } catch { fail(); }
}
export async function listPasskeys(request:Request,env:AdminAuthEnv) {
  if(!await admin(request,env)) fail("Inicia sesión para revisar tus llaves.",401);
  const config=passkeyConfig(env);
  if(!config) return reply({configured:false,devices:[],rpId:null});
  const {results}=await env.DB.prepare("SELECT id,label,created_at,last_used_at,revoked_at FROM admin_passkeys WHERE owner_id=? ORDER BY created_at").bind(config.owner).all<KeyRow>();
  return reply({configured:new URL(request.url).origin===config.origin,rpId:config.rpID,devices:results.map(k=>({id:k.id,label:k.label,createdAt:k.created_at,lastUsedAt:k.last_used_at,revokedAt:k.revoked_at}))});
}
export async function registrationOptions(request:Request,env:AdminAuthEnv,data:Record<string,unknown>) {
  const config=trusted(request,env),{auth,binding}=await revalidate(request,env,data);
  if(typeof data.label!=="string" || !data.label.trim() || data.label.trim().length>64) fail("Escribe un nombre de hasta 64 caracteres.");
  const handle=await identity(env,config.owner);
  const options=await generateRegistrationOptions({rpName:"El capo",rpID:config.rpID,userName:auth.email,
    userID:unb64(handle),attestationType:"none",timeout:120000,
    excludeCredentials:(await keys(env,config)).map(k=>({id:k.id})),
    authenticatorSelection:{residentKey:"preferred",userVerification:"required"},
    supportedAlgorithmIDs:[-7,-257]});
  const item:Ceremony={id:opaqueToken(),purpose:"register",challenge:options.challenge,binding_hash:binding,
    credential_hash:auth.fingerprint,owner_id:config.owner,user_handle:handle,rp_id:config.rpID,origin:config.origin,
    label:data.label.trim(),allowed_credentials:"[]",expires_at:now()+180};
  await saveCeremony(env,item);
  return reply({options,ceremonyId:item.id});
}
export async function registrationVerify(request:Request,env:AdminAuthEnv,data:Record<string,unknown>) {
  const {config,auth,item,claim}=await consume(request,env,data,"register");
  let info;
  try {
    const result=await verifyRegistrationResponse({response:response(data) as RegistrationResponseJSON,
      expectedChallenge:item.challenge,expectedOrigin:config.origin,expectedRPID:config.rpID,
      requireUserVerification:true,requireUserPresence:true,supportedAlgorithmIDs:[-7,-257]});
    if(!result.verified) fail();
    info=result.registrationInfo;
    if(info.credential.id !== (data.credential as RegistrationResponseJSON).id ||
      unb64(info.credential.id).length<1 || unb64(info.credential.id).length>1023) fail();
  } catch { fail(); }
  const result=await env.DB.prepare(`INSERT OR IGNORE INTO admin_passkeys(id,owner_id,label,public_key,counter,device_type,backed_up,rp_id,origin,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM admin_passkey_ceremonies WHERE id=? AND consumed_by=? AND expires_at>?) AND ${LIVE_SESSION}`)
    .bind(info.credential.id,config.owner,item.label,b64(info.credential.publicKey),info.credential.counter,info.credentialDeviceType,
      Number(info.credentialBackedUp),config.rpID,config.origin,now(),item.id,claim,now(),item.binding_hash,auth.fingerprint,now()).run();
  if(result.meta.changes!==1) fail("La llave ya existe o la sesión dejó de estar disponible.");
  return reply({registered:true});
}
export async function authenticationOptions(request:Request,env:AdminAuthEnv) {
  const config=trusted(request,env),auth=requireConfiguration(env),pending=await challenge(request,env,auth,now());
  if(!pending) fail("Confirma primero tu contraseña.",401);
  await throttle(env,[{key:`passkey-options:${auth.email}`,max:15}],now());
  const available=await keys(env,config);
  if(!available.length) fail("No hay llaves disponibles; utiliza otro método.");
  const options=await generateAuthenticationOptions({rpID:config.rpID,timeout:120000,userVerification:"required",allowCredentials:available.map(k=>({id:k.id}))});
  const handle=(await env.DB.prepare("SELECT user_handle FROM admin_passkey_identity WHERE owner_id=?").bind(config.owner).first<{user_handle:string}>())?.user_handle;
  if(!handle) fail();
  const item:Ceremony={id:opaqueToken(),purpose:"authenticate",challenge:options.challenge,binding_hash:pending.token_hash,
    credential_hash:auth.fingerprint,owner_id:config.owner,user_handle:handle,rp_id:config.rpID,origin:config.origin,label:"",
    allowed_credentials:JSON.stringify(available.map(k=>k.id)),expires_at:Math.min(now()+180,pending.expires_at)};
  await saveCeremony(env,item);
  return reply({options,ceremonyId:item.id});
}
export async function authenticationVerify(request:Request,env:AdminAuthEnv,data:Record<string,unknown>) {
  const {config,auth,item,claim}=await consume(request,env,data,"authenticate");
  const credential=response(data) as AuthenticationResponseJSON;
  const allowed:unknown=JSON.parse(item.allowed_credentials);
  if(!Array.isArray(allowed) || !allowed.includes(credential.id)) fail();
  const key=await env.DB.prepare("SELECT * FROM admin_passkeys WHERE id=? AND owner_id=? AND rp_id=? AND origin=? AND revoked_at IS NULL")
    .bind(credential.id,config.owner,config.rpID,config.origin).first<KeyRow>();
  if(!key) fail();
  if(credential.response.userHandle!=null && credential.response.userHandle!==item.user_handle) fail();
  let info;
  try {
    const result=await verifyAuthenticationResponse({response:credential,expectedChallenge:item.challenge,expectedOrigin:config.origin,
      expectedRPID:config.rpID,requireUserVerification:true,credential:{id:key.id,publicKey:unb64(key.public_key),counter:key.counter}});
    if(!result.verified || result.authenticationInfo.credentialDeviceType!==key.device_type) fail();
    info=result.authenticationInfo;
  } catch { fail(); }
  const sessionToken=opaqueToken(),sessionHash=sha256(sessionToken),time=now();
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE admin_passkeys SET counter=?,backed_up=?,last_used_at=?,last_claim=? WHERE id=? AND counter=? AND revoked_at IS NULL
      AND EXISTS(SELECT 1 FROM admin_passkey_ceremonies WHERE id=? AND consumed_by=? AND expires_at>?)
      AND EXISTS(SELECT 1 FROM admin_auth_challenges WHERE token_hash=? AND credential_hash=? AND expires_at>? AND consumed_by IS NULL)`)
      .bind(info.newCounter,Number(info.credentialBackedUp),time,claim,key.id,key.counter,item.id,claim,time,item.binding_hash,auth.fingerprint,time),
    env.DB.prepare(`UPDATE admin_auth_challenges SET consumed_by=? WHERE token_hash=? AND credential_hash=? AND expires_at>? AND consumed_by IS NULL
      AND EXISTS(SELECT 1 FROM admin_passkeys WHERE id=? AND last_claim=? AND revoked_at IS NULL)`)
      .bind(sessionHash,item.binding_hash,auth.fingerprint,time,key.id,claim),
    env.DB.prepare(`INSERT INTO admin_auth_sessions(token_hash,credential_hash,expires_at,passkey_id)
      SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM admin_auth_challenges WHERE token_hash=? AND credential_hash=? AND consumed_by=?)
      AND EXISTS(SELECT 1 FROM admin_passkeys WHERE id=? AND last_claim=? AND revoked_at IS NULL)`)
      .bind(sessionHash,auth.fingerprint,time+28800,key.id,item.binding_hash,auth.fingerprint,sessionHash,key.id,claim),
  ]);
  if(results[2].meta.changes!==1) fail();
  return reply({admin:true},[cookie(request,"alrazz_admin",sessionToken,28800),cookie(request,"alrazz_admin_challenge","",0)]);
}
export async function revokePasskey(request:Request,env:AdminAuthEnv,data:Record<string,unknown>) {
  const config=trusted(request,env),{auth,binding}=await revalidate(request,env,data);
  if(typeof data.id!=="string" || data.id.length>1364) fail();
  const time=now();
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE admin_passkeys SET revoked_at=? WHERE id=? AND owner_id=? AND revoked_at IS NULL AND ${LIVE_SESSION}`)
      .bind(time,data.id,config.owner,binding,auth.fingerprint,time),
    env.DB.prepare("DELETE FROM admin_auth_sessions WHERE passkey_id IN (SELECT id FROM admin_passkeys WHERE id=? AND owner_id=? AND revoked_at IS NOT NULL)").bind(data.id,config.owner),
  ]);
  if(results[0].meta.changes!==1) fail("La llave ya no está disponible.");
  return reply({revoked:true});
}
