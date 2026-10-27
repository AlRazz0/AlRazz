import assert from "node:assert/strict";
import {createHash,createHmac,randomUUID,scryptSync} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import test from "node:test";
import {Miniflare,createFetchMock,fetch as mockFetch} from "miniflare";
import {defaultSettings} from "../lib/furniture.ts";

test("optional measurements are isolated, private, deduplicated and protected", async t=>{
  const outbound=createFetchMock();outbound.disableNetConnect();
  const email="metrics-admin@example.test",password="metrics-synthetic-test-only",salt=Buffer.from("metrics-fixture!");
  const hash=`scrypt$32768$8$3$${salt.toString("base64url")}$${scryptSync(password,salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024}).toString("base64url")}`;
  const mf=new Miniflare({modules:true,scriptPath:fileURLToPath(new URL("../dist/alrazz/index.js",import.meta.url)),compatibilityDate:"2026-05-22",compatibilityFlags:["nodejs_compat"],
    bindings:{ADMIN_EMAIL:email,ADMIN_PASSWORD_HASH:hash,ADMIN_TOTP_SECRET:"GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",ADMIN_RECOVERY_HASHES:JSON.stringify([createHash("sha256").update("metrics-test-recovery").digest("hex")]),SESSION_SECRET:"isolated-metrics-session-secret-not-for-deployment-1234567890"},
    d1Databases:{DB:"measurements-isolated-memory"},d1Persist:false,durableObjectsPersist:false,kvPersist:false,cachePersist:false,durableObjects:{ADMIN_PASSWORD_VERIFIER:{className:"AdminPasswordVerifier",useSQLite:true}},
    outboundService:request=>mockFetch(request,{dispatcher:outbound,redirect:"manual"})});
  t.after(async()=>{await mf.dispose();await outbound.close();});
  const db=await mf.getD1Database("DB"),dir=new URL("../migrations/",import.meta.url);
  for(const file of (await readdir(dir)).filter(name=>name.endsWith(".sql")).sort()){
    const statements=(await readFile(new URL(file,dir),"utf8")).replace(/^\s*--.*$/gm,"").split(";").map(s=>s.trim()).filter(Boolean);
    await db.batch(statements.map(sql=>db.prepare(sql)));
  }
  await db.batch([db.prepare("INSERT INTO settings(id,data,version) VALUES('initialized','true',1)"),db.prepare("INSERT INTO settings(id,data,version) VALUES('business',?,1)").bind(JSON.stringify(defaultSettings))]);
  const settingsBefore=(await db.prepare("SELECT * FROM settings ORDER BY id").all()).results;
  const base="https://metrics.example.test",cookies=new Map();
  const call=async(body,path="/api/store",authenticated=false,origin=base)=>{
    const response=await mf.dispatchFetch(base+path,{method:body?"POST":"GET",headers:{...(body?{"Content-Type":"application/json",Origin:origin}:{}),"CF-Connecting-IP":"203.0.113.199",...(authenticated?{Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join("; ")}:{})},body:body?JSON.stringify(body):undefined});
    if(authenticated)for(const cookie of response.headers.getSetCookie()){const [pair]=cookie.split(";"),i=pair.indexOf("=");cookies.set(pair.slice(0,i),pair.slice(i+1));}
    return {status:response.status,data:await response.json()};
  };
  const session=randomUUID(),payload={op:"measure",consent:true,session,page:"assistant",device:"desktop",kind:"step",step:"visit"};
  await t.test("rejects unconsented, sensitive, cross-origin and unrecognized payloads",async()=>{
    for(const patch of [{consent:false},{contact:{name:"fake"}},{url:"https://example.test"},{page:"admin"}])assert.equal((await call({...payload,...patch})).status,400);
    assert.equal((await call(payload,"/api/store",false,"https://foreign.example.test")).status,403);
    assert.equal((await db.prepare("SELECT count(*) AS n FROM measurement_sessions").first()).n,0);
    assert.equal((await call(undefined,"/api/store?action=measurements")).status,401);
  });
  await t.test("counts each session step once and stores neither raw session nor IP",async()=>{
    for(let i=0;i<3;i++)assert.equal((await call(payload)).status,200);
    assert.equal((await call({...payload,step:"quote_submitted"})).status,200);
    const rows=(await db.prepare("SELECT * FROM measurement_sessions").all()).results;
    assert.equal(rows.length,1);assert.equal(rows[0].visit,1);assert.equal(rows[0].quote_submitted,1);assert.equal(rows[0].quote_started,1);
    assert.equal(JSON.stringify(rows).includes(session),false);assert.equal(JSON.stringify(rows).includes("203.0.113.199"),false);
  });
  await t.test("out-of-order vital updates cannot replace the latest value and expired measurements are removed",async()=>{
    const vital={...payload,kind:"vital",pageView:randomUUID(),name:"INP",value:300,sequence:2};delete vital.step;
    assert.equal((await call(vital)).status,200);assert.equal((await call({...vital,value:999,sequence:1})).status,200);
    assert.equal((await db.prepare("SELECT value FROM measurement_vitals").first()).value,300);
    const day=Math.floor(Date.now()/86400000);
    await db.batch([db.prepare("INSERT INTO measurement_sessions(day,session_hash) VALUES(?,?)").bind(day-90,"old-synthetic-session"),db.prepare("INSERT INTO measurement_vitals(day,session_hash,page_view_hash,page,device,name,value,sequence) VALUES(?,?,'old','home','desktop','INP',999,1)").bind(day-30,"old-synthetic-session")]);
    await call(payload);
    assert.equal((await db.prepare("SELECT count(*) AS n FROM measurement_sessions WHERE day < ?").bind(day-89).first()).n,0);
    assert.equal((await db.prepare("SELECT count(*) AS n FROM measurement_vitals WHERE day < ?").bind(day-29).first()).n,0);
    for(const value of [100,200,400])await call({...vital,pageView:randomUUID(),value,sequence:1});
  });
  await t.test("admin sees actual p75 and optional sessions, MFA required",async()=>{
    assert.equal((await call({op:"login",email,password},"/api/store",true)).status,200);
    assert.equal((await call(undefined,"/api/store?action=measurements",true)).status,401);
    const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const mac=createHmac("sha1","12345678901234567890").update(counter).digest();const code=String((mac.readUInt32BE(mac[19]&15)&0x7fffffff)%1000000).padStart(6,"0");
    assert.equal((await call({op:"verify-login",method:"totp",code},"/api/store",true)).status,200);
    const report=await call(undefined,"/api/store?action=measurements&days=30",true);assert.equal(report.status,200);assert.equal(report.data.sessions,1);assert.equal(report.data.vitals[0].p75,300);assert.equal(report.data.vitals[0].samples,4);
    assert.equal((await call(undefined,"/api/store?action=measurements&days=999",true)).status,400);
  });
  assert.deepEqual((await db.prepare("SELECT * FROM settings ORDER BY id").all()).results,settingsBefore);
  for(const table of ["designs","kitchens","quote_requests","quote_request_events"])assert.equal((await db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n,0);
});
