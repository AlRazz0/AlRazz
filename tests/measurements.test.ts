import assert from "node:assert/strict";
import test from "node:test";
import { measurementSchema } from "../lib/measurements.ts";
import { measurementPage, percentile75 } from "../lib/measurement-types.ts";
import { recordStep } from "../lib/measurement-client.ts";

test("measurement input admits only consented coarse data and rejects customer information", () => {
  const value={op:"measure",consent:true,session:crypto.randomUUID(),page:"assistant",device:"mobile",kind:"step",step:"quote_submitted"};
  assert.equal(measurementSchema.safeParse(value).success,true);
  for(const changed of [{consent:false},{email:"fixture@example.test"},{url:"https://example.test/cotizacion#private"},{page:"admin"},{session:"email@example.test"},{step:"payment"}]) assert.equal(measurementSchema.safeParse({...value,...changed}).success,false);
  const vital={op:"measure",consent:true,session:crypto.randomUUID(),page:"home",device:"desktop",kind:"vital",pageView:crypto.randomUUID(),name:"INP",value:200,sequence:1};
  assert.equal(measurementSchema.safeParse(vital).success,true);
  for(const changed of [{value:-1},{value:Infinity},{value:120001},{sequence:0},{name:"CLS",value:101},{target:"#customer-name"}])assert.equal(measurementSchema.safeParse({...vital,...changed}).success,false);
});
test("private and unknown routes cannot participate in measurement",()=>{
  assert.equal(measurementPage("/cocinas"),"kitchen");
  for(const path of ["/admin","/cotizacion","/configurar?token=secret","/unknown"] )assert.equal(measurementPage(path),null);
});
test("p75 uses the nearest rank without mutating source and handles small samples",()=>{
  const values=[400,100,300,200];assert.equal(percentile75(values),300);assert.deepEqual(values,[400,100,300,200]);
  assert.equal(percentile75([]),null);assert.equal(percentile75([7]),7);assert.equal(percentile75([10,20]),20);
});
test("client sends only after consent, omits credentials and resets deduplication at the day boundary",()=>{
  const names=["window","location","navigator","localStorage","sessionStorage","matchMedia","fetch"] as const;
  const original=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const previousNow=Date.now;let now=Date.UTC(2026,9,25,23,59),allowed=false;
  const storage=new Map<string,string>(),sent:Record<string,unknown>[]=[];
  const globals={window:{},location:{pathname:"/cocinas"},navigator:{doNotTrack:"0"},
    localStorage:{getItem:()=>allowed?"granted":null},sessionStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)},matchMedia:()=>({matches:false}),
    fetch:(_url:unknown,options:{body:string;credentials:string})=>{assert.equal(options.credentials,"omit");sent.push(JSON.parse(options.body));return Promise.resolve({ok:true});}};
  try {
    for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,value:globals[name]});Date.now=()=>now;
    recordStep("design_saved");assert.equal(sent.length,0);
    allowed=true;recordStep("design_saved");recordStep("design_saved");assert.equal(sent.length,1);
    now+=120000;recordStep("design_saved");assert.equal(sent.length,2);assert.notEqual(sent[0].session,sent[1].session);
    assert.deepEqual(Object.keys(sent[0]).sort(),["consent","device","kind","op","page","session","step"]);
    globals.navigator.doNotTrack="1";recordStep("quote_started");assert.equal(sent.length,2);
    allowed=false;globals.navigator.doNotTrack="0";recordStep("quote_submitted");assert.equal(sent.length,2);
  } finally {Date.now=previousNow;for(const name of names){const descriptor=original.get(name);if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}}
});
