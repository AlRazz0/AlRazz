import { z } from "zod";
import { createFurnitureBuilder,productSchema,settingsSchema,type Product } from "../lib/furniture.ts";
import { completedProjectInputSchema,publicCompletedProject,type CompletedProject,type CompletedProjectInput } from "../lib/completed-projects.ts";
import { requireAdmin,type AdminAuthEnv } from "./admin-auth.ts";

export class CompletedProjectsError extends Error {
  constructor(public status:number,message:string,public code:string){super(message);}
}
type Row={id:string;data:string;published:number;version:number;created_at:string;updated_at:string;deleted_at:string|null};
type ModelRow={id:string;data:string;active:number;version:number};
const version=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
function record(row:Row):CompletedProject {
  return {...completedProjectInputSchema.parse(JSON.parse(row.data)),version:row.version,created:row.created_at,updated:row.updated_at};
}
function model(row:ModelRow|undefined){
  if(!row||row.active!==1)return;
  try{const product=productSchema.parse(JSON.parse(row.data));return product.active?product:undefined;}catch{return;}
}
async function publicProjects(env:AdminAuthEnv,projects:CompletedProject[]){
  if(!projects.length)return [];
  const [models,settingsRow]=await Promise.all([env.DB.prepare("SELECT id,data,active,version FROM products WHERE active=1").all<ModelRow>(),env.DB.prepare("SELECT data FROM settings WHERE id='business'").first<{data:string}>()]);
  const byId=new Map(models.results.map(row=>[row.id,model(row)]));
  const build=settingsRow?createFurnitureBuilder(settingsSchema.parse(JSON.parse(settingsRow.data))):undefined;
  const defaultValidity=new Map<string,boolean>();
  return projects.map(project=>{const current=project.productId?byId.get(project.productId):undefined;let valid=false;let available=current;
    if(current&&build){if(!defaultValidity.has(current.id)){try{build(current,current.defaults);defaultValidity.set(current.id,true);}catch{defaultValidity.set(current.id,false);}}if(!defaultValidity.get(current.id))available=undefined;if(available&&project.preset)try{build(current,project.preset);valid=true;}catch{valid=false;}}
    else available=undefined;
    return publicCompletedProject(project,available,valid);
  });
}
export async function listCompletedProjects(request:Request,env:AdminAuthEnv,admin=false):Promise<Response>{
  if(admin)await requireAdmin(request,env);
  const rows=(await env.DB.prepare(admin?"SELECT * FROM completed_projects WHERE deleted_at IS NULL ORDER BY updated_at DESC,id LIMIT 200":"SELECT * FROM completed_projects WHERE deleted_at IS NULL AND published=1 ORDER BY updated_at DESC,id LIMIT 200").all<Row>()).results;
  const projects=rows.map(record).sort((a,b)=>a.order-b.order||b.updated.localeCompare(a.updated)||a.id.localeCompare(b.id));
  if(admin)return json({projects});
  const limit=z.coerce.number().int().min(1).max(24).parse(new URL(request.url).searchParams.get("limit")??6);
  return json({projects:await publicProjects(env,projects.filter(project=>project.published&&project.confirmedReal&&project.photos.length).slice(0,limit))});
}
export async function readCompletedProject(request:Request,env:AdminAuthEnv,requestedId?:string):Promise<Response>{
  const id=z.string().uuid().parse(requestedId??new URL(request.url).searchParams.get("id"));
  const row=await env.DB.prepare("SELECT * FROM completed_projects WHERE id=? AND published=1 AND deleted_at IS NULL").bind(id).first<Row>();
  if(!row)throw new CompletedProjectsError(404,"Este trabajo ya no está publicado.","PROJECT_UNAVAILABLE");
  return json({project:(await publicProjects(env,[record(row)]))[0]});
}
export async function saveCompletedProject(request:Request,env:AdminAuthEnv,data:unknown):Promise<Response>{
  await requireAdmin(request,env);
  const input=z.object({op:z.literal("save-completed-project"),project:completedProjectInputSchema,expectedVersion:version}).strict().parse(data);
  const project:CompletedProjectInput=input.project;
  const existing=await env.DB.prepare("SELECT * FROM completed_projects WHERE id=?").bind(project.id).first<Row>();
  if(existing && (existing.deleted_at!==null||existing.version!==input.expectedVersion)){
    if(input.expectedVersion===0&&existing.deleted_at===null&&existing.data===JSON.stringify(project))return json({project:record(existing)});
    throw new CompletedProjectsError(409,"Otra edición cambió este trabajo. Recarga antes de guardar.","VERSION_CONFLICT");
  }
  if(!existing&&input.expectedVersion!==0)throw new CompletedProjectsError(409,"Este trabajo ya no está disponible. Recarga la lista.","VERSION_CONFLICT");
  let linked:ModelRow|null=null;
  if(project.productId){linked=await env.DB.prepare("SELECT id,data,active,version FROM products WHERE id=?").bind(project.productId).first<ModelRow>();
    if(project.published&&!model(linked??undefined))throw new CompletedProjectsError(409,"Elige un modelo publicado válido o quita el enlace antes de publicar.","MODEL_UNAVAILABLE");}
  let settingsVersion:number|undefined;
  if(project.published&&project.productId&&project.preset){
    const settingsRow=await env.DB.prepare("SELECT data,version FROM settings WHERE id='business'").first<{data:string;version:number}>();
    if(!settingsRow)throw new CompletedProjectsError(503,"Los ajustes del taller no están disponibles.","SETTINGS_UNAVAILABLE");
    settingsVersion=settingsRow.version;
    try{createFurnitureBuilder(settingsSchema.parse(JSON.parse(settingsRow.data)))(model(linked!) as Product,project.preset);}catch{throw new CompletedProjectsError(400,"La configuración no cabe en el modelo o utiliza opciones/acabados no disponibles. Revisa sus medidas y opciones.","PROJECT_CONFIGURATION_INVALID");}
  }
  const now=new Date().toISOString();
  const guardModel=project.published&&project.productId ? " AND EXISTS(SELECT 1 FROM products WHERE id=? AND active=1 AND version=?) AND EXISTS(SELECT 1 FROM settings WHERE id='business' AND version=?)" : "";
  let result;
  if(!existing){
    const statement=env.DB.prepare(`INSERT OR IGNORE INTO completed_projects(id,data,published,version,created_at,updated_at) SELECT ?,?,?,1,?,? WHERE (SELECT count(*) FROM completed_projects WHERE deleted_at IS NULL)<200${guardModel}`);
    result=await statement.bind(project.id,JSON.stringify(project),Number(project.published),now,now,...(guardModel?[project.productId,linked!.version,settingsVersion]:[])).run();
  }else{
    result=await env.DB.prepare(`UPDATE completed_projects SET data=?,published=?,version=version+1,updated_at=? WHERE id=? AND version=? AND deleted_at IS NULL${guardModel}`)
      .bind(JSON.stringify(project),Number(project.published),now,project.id,input.expectedVersion,...(guardModel?[project.productId,linked!.version,settingsVersion]:[])).run();
  }
  if(!result.meta.changes)throw new CompletedProjectsError(409,"No se guardó: la lista o el modelo cambiaron, o se alcanzó el límite de 200 trabajos. Recarga y revisa.","VERSION_CONFLICT");
  const saved=await env.DB.prepare("SELECT * FROM completed_projects WHERE id=?").bind(project.id).first<Row>();
  return json({project:record(saved!)},existing?200:201);
}
export async function removeCompletedProject(request:Request,env:AdminAuthEnv,data:unknown):Promise<Response>{
  await requireAdmin(request,env);
  const input=z.object({op:z.literal("remove-completed-project"),id:z.string().uuid(),version:version.refine(value=>value>0)}).strict().parse(data);
  const result=await env.DB.prepare("UPDATE completed_projects SET deleted_at=?,published=0,version=version+1,updated_at=? WHERE id=? AND version=? AND deleted_at IS NULL")
    .bind(new Date().toISOString(),new Date().toISOString(),input.id,input.version).run();
  if(!result.meta.changes)throw new CompletedProjectsError(409,"Este trabajo cambió o ya está archivado. Recarga la lista.","VERSION_CONFLICT");
  return json({removed:true});
}
