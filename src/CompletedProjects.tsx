import { useEffect,useState } from "react";
import { ArrowUpRight,ChevronLeft,ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import type { PublicCompletedProject } from "../lib/completed-projects";
import "./completed-projects.css";

function ProjectCard({project}:{project:PublicCompletedProject}){
  const[index,setIndex]=useState(0),[failed,setFailed]=useState(false);
  const photo=project.photos[index];
  if(!photo)return null;
  function move(direction:number){setIndex(value=>(value+direction+project.photos.length)%project.photos.length);setFailed(false);}
  return <article className="completed-project-card">
    <div className="completed-project-photo">{failed?<p role="status">Esta fotografía no está disponible.</p>:<img src={photo.url} alt={photo.alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>}
      {project.photos.length>1&&<div className="completed-project-photo-controls"><button type="button" onClick={()=>move(-1)} aria-label={`Fotografía anterior de ${project.title}`}><ChevronLeft size={18}/></button><span aria-live="polite">{index+1} / {project.photos.length}</span><button type="button" onClick={()=>move(1)} aria-label={`Fotografía siguiente de ${project.title}`}><ChevronRight size={18}/></button></div>}
    </div>
    <div className="completed-project-copy"><p className="eyebrow">Realizado por el taller</p><h3>{project.title}</h3><p>{project.description}</p><dl><div><dt>Medidas del trabajo</dt><dd>{project.dimensions.width} × {project.dimensions.height} × {project.dimensions.depth} mm</dd></div><div><dt>Acabado</dt><dd>{project.finish}</dd></div></dl>
      {project.model&&<a className="text-link" href={project.model.url}>{project.model.state==="ready"?"Diseñar uno parecido":"Revisar un modelo parecido"} <ArrowUpRight size={17}/></a>}
      {project.model&&<small>{project.model.notice??`Se abre ${project.model.name} con las medidas y opciones revisadas de este trabajo; la nueva cotización utiliza las tarifas actuales.`}</small>}
    </div>
  </article>;
}
/** An empty portfolio contributes no public section or fabricated substitute. */
export function CompletedProjects({limit=6}:{limit?:number}){
  const[projects,setProjects]=useState<PublicCompletedProject[]>([]);
  useEffect(()=>{let active=true;void api<{projects:PublicCompletedProject[]}>("action=completed-projects").then(data=>{if(active)setProjects(data.projects);}).catch(()=>{if(active)setProjects([]);});return()=>{active=false;};},[]);
  if(!projects.length)return null;
  return <section className="completed-projects section" aria-labelledby="completed-projects-title"><div className="completed-projects-heading"><p className="eyebrow">Del diseño a un espacio real</p><h2 id="completed-projects-title">Trabajos que ya tienen su lugar.</h2><p>Fotografías y detalles de proyectos realizados por el taller. Encuentra una idea y empieza a adaptarla a tu espacio.</p></div><div className="completed-project-grid">{projects.slice(0,Math.max(1,Math.min(100,limit))).map(project=><ProjectCard key={project.id} project={project}/>)}</div></section>;
}
export default CompletedProjects;
