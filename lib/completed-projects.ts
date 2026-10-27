import { z } from "zod";
import { configSchema,type Config } from "./furniture.ts";

const id = z.string().uuid();
const productId = z.string().regex(/^[a-z0-9-]{2,60}$/);
export function isPublicPhotoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      /^[a-z0-9.-]+$/i.test(url.hostname) && url.hostname.includes(".") &&
      !/^\d+(?:\.\d+){3}$/.test(url.hostname) &&
      !/(?:^|\.)(?:localhost|local|internal|lan)$/.test(url.hostname);
  } catch { return false; }
}
export const completedProjectPhotoSchema = z.object({
  url: z.string().trim().max(2048).refine(isPublicPhotoUrl,"Usa una URL HTTPS pública, sin credenciales ni puerto."),
  alt: z.string().trim().min(3).max(200),
}).strict();
export const completedProjectInputSchema = z.object({
  id, title: z.string().trim().min(3).max(100), description: z.string().trim().min(10).max(1600),
  photos: z.array(completedProjectPhotoSchema).max(6).refine(photos=>new Set(photos.map(photo=>photo.url)).size===photos.length,"No repitas una fotografía."),
  dimensions: z.object({width:z.number().int().min(30).max(6000),height:z.number().int().min(30).max(4000),depth:z.number().int().min(30).max(3000)}).strict(),
  finish: z.string().trim().min(2).max(160), productId: productId.nullable(),
  preset: configSchema.nullable().default(null),
  published: z.boolean(), confirmedReal: z.boolean(), order:z.number().int().min(0).max(10000),
}).strict().superRefine((project,context)=>{
  if(project.published && (!project.confirmedReal || !project.photos.length))
    context.addIssue({code:z.ZodIssueCode.custom,path:["published"],message:"Confirma que es un trabajo realizado y añade al menos una fotografía antes de publicar."});
  if(project.preset && !project.productId)context.addIssue({code:z.ZodIssueCode.custom,path:["preset"],message:"Relaciona un modelo para guardar su configuración."});
  if(project.published && project.productId && !project.preset)context.addIssue({code:z.ZodIssueCode.custom,path:["preset"],message:"Revisa y guarda la configuración del modelo parecido antes de publicar."});
  if(project.preset && (["width","height","depth"] as const).some(key=>project.preset![key]!==project.dimensions[key]))context.addIssue({code:z.ZodIssueCode.custom,path:["preset"],message:"La configuración debe conservar las medidas reales del trabajo."});
});
export type CompletedProjectInput = z.infer<typeof completedProjectInputSchema>;
export type CompletedProject = CompletedProjectInput & {version:number;created:string;updated:string};
/** A field edit matters; JSON property ordering never creates a false unsaved state. */
export function completedProjectDraftChanged(draft:CompletedProjectInput|undefined,original:CompletedProjectInput|undefined):boolean {
  const stable=(value:unknown):unknown=>Array.isArray(value)?value.map(stable):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)])):value;
  return !!draft&&JSON.stringify(stable(draft))!==JSON.stringify(stable(original));
}
export type PublicCompletedProject = Pick<CompletedProject,"id"|"title"|"description"|"photos"|"dimensions"|"finish"> & {
  model: {id:string;name:string;url:string;preset:Config|null;state:"ready"|"review-required";notice:string|null}|null;
};
export function publicCompletedProject(project:CompletedProject,model:{id:string;name:string;active:boolean}|undefined,presetValid=false):PublicCompletedProject {
  return {id:project.id,title:project.title,description:project.description,photos:structuredClone(project.photos),dimensions:{...project.dimensions},finish:project.finish,
    model:model?.active ? {id:model.id,name:model.name,url:"/configurar?proyecto="+encodeURIComponent(project.id),preset:presetValid&&project.preset?structuredClone(project.preset):null,state:presetValid&&project.preset?"ready":"review-required",notice:presetValid&&project.preset?null:"Las medidas o el acabado de este trabajo necesitan revisión con el catálogo actual. Elige cómo empezar antes de configurar."} : null};
}
