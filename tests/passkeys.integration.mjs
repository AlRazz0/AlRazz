import assert from "node:assert/strict";
import { createHash, createHmac, scryptSync, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare, createFetchMock, fetch as mockFetch } from "miniflare";
import { isoCBOR } from "@simplewebauthn/server/helpers";

// All identities and keys here are synthetic. Isolated in-memory D1, no real
// environment file, account, credential, local-development database or network.
const base = "https://alrazz-passkeys.example.test";
const rpID = new URL(base).hostname;
const email = "owner@example.test";
const password = "passkeys-isolated-password-not-a-real-account";
const sha256 = value => createHash("sha256").update(value).digest("hex");
const hash = value => createHash("sha256").update(value).digest();
const b64 = value => Buffer.from(value).toString("base64url");
const salt = Buffer.from("passkeys-isolated");
const passwordHash = `scrypt$32768$8$3$${b64(salt)}$${b64(scryptSync(password,salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024}))}`;
const bindings = {
  ADMIN_EMAIL:email, ADMIN_PASSWORD_HASH:passwordHash,
  ADMIN_TOTP_SECRET:"GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
  ADMIN_RECOVERY_HASHES:JSON.stringify([sha256("AAAQEAYEAUDAOCAJBIFQYDIOB4")]),
  SESSION_SECRET:"isolated-passkey-session-secret-never-deploy-1234567890",
  ADMIN_PASSKEYS_ENABLED:"1", ADMIN_PASSKEY_RP_ID:rpID, ADMIN_PASSKEY_ORIGIN:base,
};
function totp() {
  const count=Buffer.alloc(8); count.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const h=createHmac("sha1","12345678901234567890").update(count).digest();
  return String((h.readUInt32BE(h[19]&15)&0x7fffffff)%1000000).padStart(6,"0");
}
class Client {
  constructor(h) { this.h=h; this.cookies=new Map(); }
  copy() { const c=new Client(this.h); c.cookies=new Map(this.cookies); return c; }
  async request(data,{origin=base,url=base,path="/api/store"}={}) {
    const r=await this.h.mf.dispatchFetch(url+path,{method:data===undefined?"GET":"POST",headers:{
      ...(data===undefined?{}:{"Content-Type":"application/json",Origin:origin}),
      Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join("; "),"CF-Connecting-IP":"203.0.113.8",
    },body:data===undefined?undefined:JSON.stringify(data)});
    for(const v of r.headers.getSetCookie()) {
      const [pair]=v.split(";"), i=pair.indexOf("="), k=pair.slice(0,i), val=pair.slice(i+1);
      if(val) this.cookies.set(k,val); else this.cookies.delete(k);
    }
    return {status:r.status,data:await r.json()};
  }
  state() { return this.request(undefined,{path:"/api/store?action=admin"}); }
  login() { return this.request({op:"login",email,password}); }
  options(label="PC sintética") { return this.request({op:"passkey-register-options",password,label}); }
  async fullLogin() {
    assert.equal((await this.login()).status,200);
    const r=await this.request({op:"verify-login",method:"totp",code:totp()});
    assert.equal(r.status,200,JSON.stringify(r.data)); return this;
  }
}
async function harness() {
  const fetchMock=createFetchMock();fetchMock.disableNetConnect();
  let options={modules:true,scriptPath:fileURLToPath(new URL("../dist/alrazz/index.js",import.meta.url)),
    compatibilityDate:"2026-05-22",compatibilityFlags:["nodejs_compat"],bindings,
    d1Databases:{DB:"isolated-passkeys"},durableObjects:{ADMIN_PASSWORD_VERIFIER:{className:"AdminPasswordVerifier",useSQLite:true}},
    outboundService:r=>mockFetch(r,{dispatcher:fetchMock,redirect:"manual"})};
  const mf=new Miniflare(options);let db=await mf.getD1Database("DB");
  const dir=new URL("../migrations/",import.meta.url);
  for(const name of (await readdir(dir)).filter(n=>n.endsWith(".sql")).sort()) {
    const statements=(await readFile(new URL(name,dir),"utf8")).replace(/^\s*--.*$/gm,"").split(";").map(x=>x.trim()).filter(Boolean);
    await db.batch(statements.map(s=>db.prepare(s)));
  }
  const h={mf,get db(){return db},client:()=>new Client(h),
    async clearLimits(){await db.prepare("DELETE FROM login_limits").run()},
    async reset(){ await db.batch(["admin_auth_sessions","admin_auth_challenges","admin_auth_factors","admin_passkey_ceremonies","admin_passkeys","admin_passkey_identity","login_limits"].map(t=>db.prepare(`DELETE FROM ${t}`))) },
    async rotate(extra){options={...options,bindings:{...bindings,...extra}};await mf.setOptions(options);db=await mf.getD1Database("DB")},
    async count(){return (await db.prepare("SELECT count(*) n FROM admin_passkeys").first()).n},
    async close(){await mf.dispose();await fetchMock.close()},
  };return h;
}
// A tiny software authenticator builds actual CBOR/COSE data and signs with
// Node crypto. The compiled Worker verifies signatures with SimpleWebAuthn.
function authenticator({id=randomBytes(32),backedUp=false,rsa=false}={}) {
  const {privateKey,publicKey}=rsa?generateKeyPairSync("rsa",{modulusLength:2048}):generateKeyPairSync("ec",{namedCurve:"prime256v1"});
  const jwk=publicKey.export({format:"jwk"});
  const bytes=value=>new Uint8Array(Buffer.from(value,"base64url"));
  const cose=isoCBOR.encode(rsa?new Map([[1,3],[3,-257],[-1,bytes(jwk.n)],[-2,bytes(jwk.e)]]):new Map([[1,2],[3,-7],[-1,1],[-2,bytes(jwk.x)],[-3,bytes(jwk.y)]]));
  let count=0;
  return {id:b64(id),handle:null,
    registration(options,{uv=true,origin=base,rp=rpID,challenge=options.challenge,crossOrigin=false,wrapperID=b64(id)}={}) {
      this.handle=options.user.id;
      const client=Buffer.from(JSON.stringify({type:"webauthn.create",challenge,origin,crossOrigin}));
      const flags=0x41|(uv?4:0)|(backedUp?24:0), ctr=Buffer.alloc(4),len=Buffer.alloc(2);len.writeUInt16BE(id.length);
      const authData=Buffer.concat([hash(rp),Buffer.from([flags]),ctr,Buffer.alloc(16),len,id,cose]);
      return {id:wrapperID,rawId:wrapperID,type:"public-key",clientExtensionResults:{},response:{clientDataJSON:b64(client),attestationObject:b64(isoCBOR.encode(new Map([["fmt","none"],["attStmt",new Map()],["authData",new Uint8Array(authData)]]))),transports:["internal"]}};
    },
    assertion(options,{uv=true,origin=base,rp=rpID,challenge=options.challenge,userHandle=this.handle,crossOrigin=false,counter=++count,corrupt=false}={}) {
      const client=Buffer.from(JSON.stringify({type:"webauthn.get",challenge,origin,crossOrigin}));
      const ctr=Buffer.alloc(4);ctr.writeUInt32BE(counter);
      const authData=Buffer.concat([hash(rp),Buffer.from([1|(uv?4:0)|(backedUp?24:0)]),ctr]);
      const sig=sign("sha256",Buffer.concat([authData,hash(client)]),privateKey);if(corrupt)sig[sig.length-1]^=1;
      return {id:b64(id),rawId:b64(id),type:"public-key",clientExtensionResults:{},response:{clientDataJSON:b64(client),authenticatorData:b64(authData),signature:b64(sig),userHandle}};
    },
  };
}
async function register(c,key=authenticator()) {
  const o=await c.options();assert.equal(o.status,200,JSON.stringify(o.data));
  const r=await c.request({op:"passkey-register-verify",ceremonyId:o.data.ceremonyId,credential:key.registration(o.data.options)});
  assert.equal(r.status,200,JSON.stringify(r.data));return key;
}
async function authOptions(c) {
  assert.equal((await c.login()).status,200);
  const o=await c.request({op:"passkey-auth-options"});assert.equal(o.status,200,JSON.stringify(o.data));return o.data;
}
async function authenticate(c,key) {
  const o=await authOptions(c);
  const r=await c.request({op:"passkey-auth-verify",ceremonyId:o.ceremonyId,credential:key.assertion(o.options)});
  assert.equal(r.status,200,JSON.stringify(r.data));assert.equal((await c.state()).data.admin,true);return c;
}

test("WebAuthn real signatures, isolated Worker and atomic D1",async t=>{
  const h=await harness();t.after(()=>h.close());
  async function scenario(name,fn){await t.test(name,async()=>{await h.reset();await fn()})}
  await scenario("registration requires full MFA, current password, and exact origin",async()=>{
    const c=h.client();assert.equal((await c.options()).status,401);
    await c.login();assert.equal((await c.options()).status,401);
    await c.request({op:"verify-login",method:"totp",code:totp()});
    assert.equal((await c.request({op:"passkey-register-options",password:"wrong",label:"PC"})).status,403);
    assert.equal((await c.request({op:"passkey-register-options",password,label:"PC"},{origin:"https://evil.example"})).status,403);
    const key=await register(c);assert.equal(await h.count(),1);
    const state=await c.request(undefined,{path:"/api/store?action=passkeys"});
    assert.equal(state.data.configured,true);assert.equal(state.data.devices[0].id,key.id);
    assert.equal(state.data.devices[0].label,"PC sintética");
    assert.equal(JSON.stringify(state.data).includes("public_key"),false);
  });
  for(const [name,overrides] of Object.entries({UV:{uv:false},origin:{origin:"https://evil.example"},RP:{rp:"evil.example"},challenge:{challenge:b64(randomBytes(32))},crossOrigin:{crossOrigin:true},wrapperID:{wrapperID:b64(randomBytes(32))}})) {
    await scenario(`registration rejects ${name} and consumes the challenge`,async()=>{
      const c=await h.client().fullLogin(),key=authenticator(),o=await c.options();
      const body={op:"passkey-register-verify",ceremonyId:o.data.ceremonyId,credential:key.registration(o.data.options,overrides)};
      assert.equal((await c.request(body)).status,400);assert.equal(await h.count(),0);
      body.credential=key.registration(o.data.options);assert.equal((await c.request(body)).status,400);
    });
  }
  await scenario("registration rejects oversized IDs, expired and cross-session ceremonies",async()=>{
    const c=await h.client().fullLogin(),o=await c.options(),key=authenticator({id:randomBytes(1024)});
    assert.equal((await c.request({op:"passkey-register-verify",ceremonyId:o.data.ceremonyId,credential:key.registration(o.data.options)})).status,400);
    const o2=await c.options(),k2=authenticator(),body={op:"passkey-register-verify",ceremonyId:o2.data.ceremonyId,credential:k2.registration(o2.data.options)};
    const stranger=h.client();await stranger.login();assert.equal((await stranger.request(body)).status,400);
    // A copied valid MFA session with a different token still cannot claim the ceremony.
    const session=await h.db.prepare("SELECT * FROM admin_auth_sessions LIMIT 1").first();
    const fakeToken=randomBytes(32).toString("hex");stranger.cookies.set("alrazz_admin",fakeToken);
    await h.db.prepare("INSERT INTO admin_auth_sessions(token_hash,credential_hash,expires_at) VALUES(?,?,?)").bind(sha256(fakeToken),session.credential_hash,session.expires_at).run();
    assert.equal((await stranger.request(body)).status,400);
    await h.db.prepare("UPDATE admin_passkey_ceremonies SET expires_at=0 WHERE id=?").bind(o2.data.ceremonyId).run();
    assert.equal((await c.request(body)).status,400);assert.equal(await h.count(),0);
  });
  await scenario("registration has exactly one winner under simultaneous replay",async()=>{
    const c=await h.client().fullLogin(),key=authenticator(),o=await c.options();
    const body={op:"passkey-register-verify",ceremonyId:o.data.ceremonyId,credential:key.registration(o.data.options)};
    const replies=await Promise.all([c.request(body),c.copy().request(body)]);
    assert.deepEqual(replies.map(r=>r.status).sort(),[200,400]);assert.equal(await h.count(),1);
  });
  await scenario("password plus signed passkey authenticates and rotates the session",async()=>{
    const owner=await h.client().fullLogin(),key=await register(owner),c=h.client();
    assert.equal((await c.request({op:"passkey-auth-options"})).status,401);
    const o=await authOptions(c);assert.equal(o.options.userVerification,"required");
    const pending=c.copy(),body={op:"passkey-auth-verify",ceremonyId:o.ceremonyId,credential:key.assertion(o.options)};
    const result=await c.request(body);assert.equal(result.status,200,JSON.stringify(result.data));
    assert.equal((await c.state()).data.admin,true);assert.equal(c.cookies.has("alrazz_admin_challenge"),false);
    assert.equal((await pending.request(body)).status,401);
    const session=await h.db.prepare("SELECT * FROM admin_auth_sessions WHERE passkey_id=?").bind(key.id).first();
    assert.ok(session);assert.equal(session.token_hash,sha256(c.cookies.get("alrazz_admin")));
  });
  for(const [name,overrides] of Object.entries({UV:{uv:false},origin:{origin:"https://evil.example"},RP:{rp:"evil.example"},challenge:{challenge:b64(randomBytes(32))},crossOrigin:{crossOrigin:true},userHandle:{userHandle:b64(randomBytes(32))},signature:{corrupt:true}})) {
    await scenario(`authentication rejects ${name}, cannot replay a failed proof`,async()=>{
      const owner=await h.client().fullLogin(),key=await register(owner),c=h.client(),o=await authOptions(c);
      const body={op:"passkey-auth-verify",ceremonyId:o.ceremonyId,credential:key.assertion(o.options,overrides)};
      assert.equal((await c.request(body)).status,400);assert.equal((await c.state()).data.admin,false);
      body.credential=key.assertion(o.options);assert.equal((await c.request(body)).status,400);
    });
  }
  await scenario("authentication is bound to its password session and expires",async()=>{
    const owner=await h.client().fullLogin(),key=await register(owner),c=h.client(),o=await authOptions(c),stranger=h.client();
    await stranger.login();const body={op:"passkey-auth-verify",ceremonyId:o.ceremonyId,credential:key.assertion(o.options)};
    assert.equal((await stranger.request(body)).status,400);
    await h.db.prepare("UPDATE admin_passkey_ceremonies SET expires_at=0 WHERE id=?").bind(o.ceremonyId).run();
    assert.equal((await c.request(body)).status,400);assert.equal((await c.state()).data.admin,false);
  });
  await scenario("simultaneous authentication produces only one session",async()=>{
    const owner=await h.client().fullLogin(),key=await register(owner),c=h.client(),o=await authOptions(c);
    const body={op:"passkey-auth-verify",ceremonyId:o.ceremonyId,credential:key.assertion(o.options)};
    const results=await Promise.all([c.request(body),c.copy().request(body)]);
    assert.equal(results.filter(r=>r.status===200).length,1);
    assert.equal((await h.db.prepare("SELECT count(*) n FROM admin_auth_sessions WHERE passkey_id IS NOT NULL").first()).n,1);
  });
  await scenario("revocation closes only that key's sessions, pending proofs and registrations",async()=>{
    const owner=await h.client().fullLogin(),a=await register(owner),b=await register(owner);
    const ca=await authenticate(h.client(),a),cb=await authenticate(h.client(),b),pending=h.client(),o=await authOptions(pending);
    const registering=await ca.options("Should never finish"),newKey=authenticator();await h.clearLimits();
    assert.equal((await owner.request({op:"passkey-revoke",id:a.id,password:"wrong"})).status,403);
    assert.equal((await owner.request({op:"passkey-revoke",id:a.id,password})).status,200);
    assert.equal((await ca.state()).data.admin,false);assert.equal((await cb.state()).data.admin,true);assert.equal((await owner.state()).data.admin,true);
    assert.equal((await pending.request({op:"passkey-auth-verify",ceremonyId:o.ceremonyId,credential:a.assertion(o.options)})).status,400);
    assert.equal((await ca.request({op:"passkey-register-verify",ceremonyId:registering.data.ceremonyId,credential:newKey.registration(registering.data.options)})).status,401);
    assert.equal(await h.count(),2);
  });
  await scenario("revocation concurrent with authentication never leaves a valid revoked session",async()=>{
    const owner=await h.client().fullLogin(),key=await register(owner),c=h.client(),o=await authOptions(c);
    const replies=await Promise.all([c.request({op:"passkey-auth-verify",ceremonyId:o.ceremonyId,credential:key.assertion(o.options)}),owner.request({op:"passkey-revoke",id:key.id,password})]);
    assert.equal(replies[1].status,200);assert.equal((await c.state()).data.admin,false);
  });
  await scenario("counter rollback and malformed responses cannot authenticate",async()=>{
    const owner=await h.client().fullLogin(),key=await register(owner);await authenticate(h.client(),key);
    const c=h.client(),o=await authOptions(c);
    assert.equal((await c.request({op:"passkey-auth-verify",ceremonyId:o.ceremonyId,credential:key.assertion(o.options,{counter:1})})).status,400);
    for(const credential of [null,{},[],{id:key.id,rawId:key.id,type:"public-key",response:{clientDataJSON:"bad"}}]) {
      await h.clearLimits();const o2=await c.request({op:"passkey-auth-options"});
      assert.equal(o2.status,200);assert.equal((await c.request({op:"passkey-auth-verify",ceremonyId:o2.data.ceremonyId,credential})).status,400);
    }
  });
  await scenario("RS256 credentials used by Windows authenticators verify in the Worker",async()=>{
    const owner=await h.client().fullLogin(),key=await register(owner,authenticator({rsa:true}));
    await authenticate(h.client(),key);
  });
  await scenario("synced credentials with zero counters remain valid and require user verification",async()=>{
    const owner=await h.client().fullLogin(),key=await register(owner,authenticator({backedUp:true}));
    for(let i=0;i<2;i++) {
      const c=h.client(),o=await authOptions(c);
      assert.equal((await c.request({op:"passkey-auth-verify",ceremonyId:o.ceremonyId,credential:key.assertion(o.options,{counter:0})})).status,200);
    }
  });
  await scenario("new options supersede older ceremonies and duplicate credentials stay rejected",async()=>{
    const owner=await h.client().fullLogin(),old=await owner.options(),latest=await owner.options(),key=authenticator();
    assert.equal((await owner.request({op:"passkey-register-verify",ceremonyId:old.data.ceremonyId,credential:key.registration(old.data.options)})).status,400);
    assert.equal((await owner.request({op:"passkey-register-verify",ceremonyId:latest.data.ceremonyId,credential:key.registration(latest.data.options)})).status,200);
    const duplicate=await owner.options();
    assert.equal(duplicate.data.options.excludeCredentials[0].id,key.id);
    assert.equal((await owner.request({op:"passkey-register-verify",ceremonyId:duplicate.data.ceremonyId,credential:key.registration(duplicate.data.options)})).status,400);
    assert.equal(await h.count(),1);
  });
  await scenario("password rotation invalidates pending ceremonies and existing sessions",async()=>{
    const owner=await h.client().fullLogin(),key=await register(owner),c=await authenticate(h.client(),key),p=h.client(),o=await authOptions(p);
    await h.rotate({ADMIN_PASSWORD_HASH:`scrypt$32768$8$3$${b64(salt)}$${b64(scryptSync("different-synthetic-password",salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024}))}`});
    assert.equal((await c.state()).data.admin,false);
    assert.equal((await p.request({op:"passkey-auth-verify",ceremonyId:o.ceremonyId,credential:key.assertion(o.options)})).status,401);
    await h.rotate({});
  });
  await scenario("disabled passkeys hide metadata, reject enrollment and invalidate only key sessions",async()=>{
    const owner=await h.client().fullLogin(),key=await register(owner),c=await authenticate(h.client(),key);
    await h.rotate({ADMIN_PASSKEYS_ENABLED:"0"});
    assert.equal((await c.state()).data.admin,false);assert.equal((await owner.state()).data.admin,true);
    assert.equal((await owner.options()).status,503);
    const list=await owner.request(undefined,{path:"/api/store?action=passkeys"});assert.deepEqual(list.data,{configured:false,devices:[],rpId:null});
    assert.equal((await h.client().login()).data.passkeysAvailable,false);await h.rotate({});
  });
});
