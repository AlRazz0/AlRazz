import { z } from "zod";
import { requireAdmin, type AdminAuthEnv } from "./admin-auth.ts";
import { sha256 } from "../lib/admin-crypto.ts";
import { measurementSchema } from "../lib/measurements.ts";
import { measurementSteps, type MeasurementReport } from "../lib/measurement-types.ts";

const dayNow = () => Math.floor(Date.now()/86400000);
const response = (data: unknown, status=200) => new Response(JSON.stringify(data), {status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});

export async function recordMeasurement(_request: Request, env: AdminAuthEnv, input: unknown) {
  const data = measurementSchema.parse(input), day = dayNow();
  const sessionHash = await sha256(`${day}:${data.session}`);
  // Column interpolation is restricted to this server-owned enum; no arbitrary SQL.
  const step = data.kind === "step" ? data.step : "visit";
  const session = env.DB.prepare(`INSERT INTO measurement_sessions(day,session_hash,${step}${step === "quote_submitted" ? ",quote_started" : ""})
    SELECT ?,?,1${step === "quote_submitted" ? ",1" : ""} WHERE (SELECT count(*) FROM measurement_sessions WHERE day=?) < 5000
      OR EXISTS(SELECT 1 FROM measurement_sessions WHERE day=? AND session_hash=?)
    ON CONFLICT(day,session_hash) DO UPDATE SET ${step}=1${step === "quote_submitted" ? ",quote_started=1" : ""}`)
    .bind(day,sessionHash,day,day,sessionHash);
  const statements = [session];
  if (data.kind === "vital") {
    const pageViewHash = await sha256(`${day}:${data.pageView}`);
    statements.push(env.DB.prepare(`INSERT INTO measurement_vitals(day,session_hash,page_view_hash,page,device,name,value,sequence)
      SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM measurement_sessions WHERE day=? AND session_hash=?)
      AND ((SELECT count(*) FROM measurement_vitals WHERE day=?) < 12000
        AND (SELECT count(*) FROM measurement_vitals WHERE day=? AND session_hash=?) < 120
        OR EXISTS(SELECT 1 FROM measurement_vitals WHERE day=? AND session_hash=? AND page_view_hash=? AND name=?))
      ON CONFLICT(day,session_hash,page_view_hash,name) DO UPDATE SET value=excluded.value,sequence=excluded.sequence
      WHERE excluded.sequence > measurement_vitals.sequence AND excluded.page=measurement_vitals.page AND excluded.device=measurement_vitals.device`)
      .bind(day,sessionHash,pageViewHash,data.page,data.device,data.name,data.value,data.sequence,day,sessionHash,day,day,sessionHash,day,sessionHash,pageViewHash,data.name));
  }
  // Only these disposable measurements expire. Business tables are never touched.
  statements.push(env.DB.prepare("DELETE FROM measurement_sessions WHERE day < ?").bind(day-89));
  statements.push(env.DB.prepare("DELETE FROM measurement_vitals WHERE day < ?").bind(day-29));
  const result = await env.DB.batch(statements);
  return response({recorded: Boolean(result[0].meta.changes)}, result[0].meta.changes ? 200 : 429);
}

export async function readMeasurements(request: Request, env: AdminAuthEnv) {
  await requireAdmin(request,env);
  const raw = new URL(request.url).searchParams.get("days") ?? "30";
  const days = z.enum(["7","30","90"]).transform(Number).parse(raw), since = dayNow()-days+1;
  const totals = await env.DB.prepare(`SELECT count(*) AS sessions,${measurementSteps.map(step=>`coalesce(sum(${step}),0) AS ${step}`).join(",")} FROM measurement_sessions WHERE day >= ?`).bind(since).first<Record<string,number>>();
  const {results} = await env.DB.prepare(`WITH ranked AS (
    SELECT page,device,name,value,ROW_NUMBER() OVER(PARTITION BY page,device,name ORDER BY value) AS position,
    COUNT(*) OVER(PARTITION BY page,device,name) AS samples FROM measurement_vitals WHERE day >= ?)
    SELECT page,device,name,value AS p75,samples FROM ranked WHERE position=(samples*3+3)/4 ORDER BY page,device,name`)
    .bind(Math.max(since,dayNow()-29)).all<MeasurementReport["vitals"][number]>();
  const report: MeasurementReport = {days,sessions:totals?.sessions??0,
    steps:measurementSteps.map(step=>({step,sessions:totals?.[step]??0})),
    vitals:results};
  return response(report);
}
