import assert from "node:assert/strict";
import test from "node:test";
import { completedProjectInputSchema,completedProjectDraftChanged,isPublicPhotoUrl,publicCompletedProject } from "../lib/completed-projects.ts";
import { productTemplate } from "../lib/product-templates.ts";

const product=productTemplate("cabinet"),id="40000000-0000-4000-8000-000000000001";
const value={id,title:"Trabajo sintético de prueba",description:"Descripción sintética de un mueble, sin personas reales.",photos:[{url:"https://photos.example.test/qa.jpg",alt:"Fotografía sintética para la prueba"}],dimensions:{width:product.defaults.width,height:product.defaults.height,depth:product.defaults.depth},finish:"Acabado sintético",productId:product.id,preset:product.defaults,published:true,confirmedReal:true,order:0};
test("portfolio publication requires actual-work confirmation, accessible photos and matching preset dimensions",()=>{
  assert.ok(completedProjectInputSchema.safeParse(value).success);
  for(const changed of [{confirmedReal:false},{photos:[]},{photos:[{url:"https://photos.example.test/qa.jpg",alt:""}]},{preset:null},{preset:{...product.defaults,width:product.defaults.width+10}},{unexpected:"=1+1"}])assert.equal(completedProjectInputSchema.safeParse({...value,...changed}).success,false);
  assert.ok(completedProjectInputSchema.safeParse({...value,published:false,confirmedReal:false,photos:[],productId:null,preset:null}).success,"an unlinked draft can be saved without publishing invented photos");
});
test("photo addresses reject executable/local schemes, credentials, ports and local hosts",()=>{
  for(const url of ["javascript:alert(1)","data:image/png;base64,AA","blob:https://example.com/id","http://example.com/photo.jpg","https://user:pass@example.com/photo.jpg","https://127.0.0.1/a.jpg","https://[::1]/a.jpg","https://localhost/a.jpg","https://photos.local/a.jpg","https://example.com:444/a.jpg"])
    assert.equal(isPublicPhotoUrl(url),false,url);
  assert.equal(isPublicPhotoUrl("https://images.example.com/photo.jpg?size=1200"),true);
});
test("public projects expose only reviewed current presets, keeping actual project metadata and inputs immutable",()=>{
  const project={...completedProjectInputSchema.parse(value),version:2,created:"2026-01-01T00:00:00Z",updated:"2026-01-02T00:00:00Z"},before=structuredClone(project);
  const ready=publicCompletedProject(project,{id:product.id,name:product.name,active:true},true);
  assert.equal(ready.model?.state,"ready");assert.deepEqual(ready.model?.preset,project.preset);assert.equal(ready.model?.url,"/configurar?proyecto="+id);
  const review=publicCompletedProject(project,{id:product.id,name:product.name,active:true},false);
  assert.equal(review.model?.state,"review-required");assert.equal(review.model?.preset,null);assert.ok(review.model?.notice);
  assert.equal(publicCompletedProject(project,{id:product.id,name:product.name,active:false},true).model,null);
  assert.equal("confirmedReal"in ready,false);assert.equal("published"in ready,false);assert.equal("version"in ready,false);
  ready.dimensions.width=999;ready.photos[0].alt="changed";ready.model!.preset!.width=999;assert.deepEqual(project,before);
});
test("discard guards only detect actual draft changes and clear after a successful save",()=>{
  const original=completedProjectInputSchema.parse(value),draft=structuredClone(original);
  assert.equal(completedProjectDraftChanged(undefined,original),false);
  assert.equal(completedProjectDraftChanged(draft,original),false);
  assert.equal(completedProjectDraftChanged({...draft,dimensions:{depth:draft.dimensions.depth,height:draft.dimensions.height,width:draft.dimensions.width}},original),false,"property order does not dirty a clean draft");
  draft.photos[0].alt="Una foto revisada";assert.equal(completedProjectDraftChanged(draft,original),true);
  const saved=completedProjectInputSchema.parse(draft);assert.equal(completedProjectDraftChanged(draft,saved),false);
  draft.preset!.shelves++;assert.equal(completedProjectDraftChanged(draft,saved),true,"configuration edits must also be protected");
});
