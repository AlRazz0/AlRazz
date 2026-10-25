import { measurementPage, type MeasurementStep, type VitalName } from "./measurement-types.ts";

const consentKey="alrazz.measurementConsent", sessionKey="alrazz.measurementSession";
let started=false, pageView="", sequence=0, stepsDay=-1;
const sentSteps = new Set<MeasurementStep>();
export function measurementAllowed(): boolean {
  try { return typeof window!=="undefined" && localStorage.getItem(consentKey)==="granted" && navigator.doNotTrack!=="1" && !(navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl; } catch { return false; }
}
function identity(): string | null {
  try {
    const day = Math.floor(Date.now()/86400000), previous=JSON.parse(sessionStorage.getItem(sessionKey)||"null");
    if(previous?.day===day && typeof previous.id==="string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(previous.id))return previous.id;
    const id=crypto.randomUUID();sessionStorage.setItem(sessionKey,JSON.stringify({id,day}));return id;
  } catch { return null; }
}
function send(payload: Record<string,unknown>) {
  const page=measurementPage(location.pathname);
  if(!page || !measurementAllowed())return false;
  const session=identity();if(!session)return false;
  void fetch("/api/store", {method:"POST",headers:{"Content-Type":"application/json"},credentials:"omit",keepalive:true,
    body:JSON.stringify({op:"measure",consent:true,session,page,device:matchMedia("(max-width: 767px)").matches?"mobile":"desktop",...payload})}).catch(()=>{});
  return true;
}
export function recordStep(step: MeasurementStep) {
  const day=Math.floor(Date.now()/86400000);
  if(day!==stepsDay){sentSteps.clear();stepsDay=day;}
  if(!measurementAllowed() || sentSteps.has(step))return;
  if(send({kind:"step",step}))sentSteps.add(step);
}
export function recordSuccessfulOperation(op: unknown) {
  if(op==="design-assistant")recordStep("assistant_result");
  if(op==="save-design" || op==="save-kitchen")recordStep("design_saved");
  if(op==="create-quote-request")recordStep("quote_submitted");
}
export function setMeasurementConsent(enabled: boolean) {
  try { localStorage.setItem(consentKey,enabled?"granted":"denied");if(!enabled)sessionStorage.removeItem(sessionKey); } catch {}
  sentSteps.clear();window.dispatchEvent(new Event("alrazz-measurement-consent"));
  if(enabled)void startMeasurements();
}
export async function startMeasurements() {
  if(!measurementPage(location.pathname) || !measurementAllowed())return;
  recordStep("visit");
  if(started)return;
  started=true;pageView=crypto.randomUUID();
  try {
    const {onINP,onLCP,onCLS}=await import("web-vitals");
    const report=({name,value}:{name:VitalName;value:number})=>send({kind:"vital",pageView,name,value:Math.round(value*10000)/10000,sequence:++sequence});
    onINP(report);onLCP(report);onCLS(report);
  } catch { /* Measurement failures never interrupt designing or quoting. */ }
}
