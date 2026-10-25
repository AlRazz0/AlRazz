import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUpRight, Check, ChefHat, LayoutGrid, Loader2, Ruler, SlidersHorizontal, Table2, PanelsTopLeft } from "lucide-react";
import { api } from "../lib/api";
import { money } from "../lib/format-price";
import type { DesignAssistantInput, DesignAssistantOption, DesignAssistantResult } from "../lib/design-assistant";
import type { QuoteRequestSource } from "../lib/crm";
import type { Design, KitchenDesign, PublicSettings } from "./types";
import { Header, Footer } from "./App";
import { CatalogThumbnail } from "./CatalogThumbnail";
import { QuoteRequestForm } from "./QuoteRequestForm";
import { materialLabel } from "./materials";
import "./design-assistant.css";

type Purpose = DesignAssistantInput["purpose"];
const purposes = [
  {id:"storage" as const,title:"Ordenar y exhibir",description:"Libros, objetos y lo que quieres tener a mano.",icon:LayoutGrid},
  {id:"wardrobe" as const,title:"Organizar tu ropa",description:"Repisas y espacio para colgar, a tu medida.",icon:PanelsTopLeft},
  {id:"desk" as const,title:"Trabajar cómodo",description:"Un escritorio que encuentre su lugar.",icon:Table2},
  {id:"kitchen" as const,title:"Equipar tu cocina",description:"Una distribución inicial para seguir diseñando.",icon:ChefHat},
];
type Fields = {width:string;height:string;depth:string;wallB:string;budget:string;finish:string;layout:"straight"|"l";install:boolean;transport:boolean};
const initial: Fields = {width:"180",height:"220",depth:"45",wallB:"240",budget:"",finish:"",layout:"straight",install:false,transport:false};
type Selection = {optionId:string;source:QuoteRequestSource;url:string;price:number|null;title:string};
const dimension = (value:number) => `${(value/10).toLocaleString("es-PE",{maximumFractionDigits:1})} cm`;

export default function DesignAssistant() {
  const firstPurpose = new URLSearchParams(location.search).get("uso");
  const [purpose,setPurpose] = useState<Purpose>(purposes.some(item=>item.id===firstPurpose) ? firstPurpose as Purpose : "storage");
  const [fields,setFields] = useState<Fields>(firstPurpose === "kitchen" ? {...initial,width:"300",height:"260",depth:"60"} : initial);
  const [settings,setSettings] = useState<PublicSettings>();
  const [catalogError,setCatalogError] = useState("");
  const [result,setResult] = useState<DesignAssistantResult>();
  const [error,setError] = useState("");
  const [finding,setFinding] = useState(false);
  const [busyChoice,setBusyChoice] = useState("");
  const [selection,setSelection] = useState<Selection>();
  const request = useRef(0);
  const savedOptions = useRef(new Map<string,Selection>());
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const contact = useRef<HTMLDivElement>(null);
  const isKitchen = purpose === "kitchen";
  function load() {
    setCatalogError("");
    void api<{settings:PublicSettings}>("action=catalog").then(data=>setSettings(data.settings))
      .catch(cause=>setCatalogError(cause instanceof Error?cause.message:"No pudimos cargar los acabados del taller."));
  }
  useEffect(load,[]);
  useEffect(()=>()=>{request.current++;},[]);
  function revise(next:Fields) {
    request.current++; setFields(next); setResult(undefined); setSelection(undefined); setError(""); setFinding(false); savedOptions.current.clear();
  }
  function changePurpose(next:Purpose) {
    setPurpose(next);
    revise({...fields,...(next === "kitchen" ? {width:"300",height:"260",depth:"60"} : next === "desk" ? {width:"120",height:"85",depth:"65"} : next === "wardrobe" ? {width:"180",height:"240",depth:"65"} : {width:"180",height:"220",depth:"45"})});
  }
  async function find(event:FormEvent) {
    event.preventDefault(); if(finding || busyChoice) return;
    const sequence=++request.current;
    const input:DesignAssistantInput = {purpose,width:Number(fields.width)*10,height:Number(fields.height)*10,depth:Number(fields.depth)*10,
      install:fields.install,transport:fields.transport,
      ...(fields.budget.trim()?{budget:Number(fields.budget)}:{}),...(fields.finish?{finish:fields.finish}:{}),
      ...(isKitchen?{layout:fields.layout,...(fields.layout==="l"?{wallB:Number(fields.wallB)*10}:{})}:{}),
    };
    setFinding(true); setError(""); setResult(undefined); setSelection(undefined); savedOptions.current.clear();
    try {
      const response=await api<DesignAssistantResult>("",{op:"design-assistant",input});
      if(sequence!==request.current)return;
      setResult(response);
      requestAnimationFrame(()=>{resultHeading.current?.scrollIntoView({block:"start",behavior:"instant"});resultHeading.current?.focus({preventScroll:true});});
    } catch(cause) {if(sequence===request.current)setError(cause instanceof Error?cause.message:"No pudimos buscar propuestas. Inténtalo de nuevo.");}
    finally {if(sequence===request.current)setFinding(false);}
  }
  async function choose(option:DesignAssistantOption, personalize:boolean) {
    if(busyChoice)return;
    setBusyChoice(option.id); setError("");
    const sequence=request.current;
    try {
      let chosen=savedOptions.current.get(option.id);
      if(!chosen){
        if(option.kind==="furniture"){
          const {design}=await api<{design:Design}>("",{op:"save-design",productId:option.product.id,config:option.config,name:option.product.name.slice(0,80)});
          chosen={optionId:option.id,source:{kind:"design",id:design.id,version:design.version},url:"/configurar?d="+encodeURIComponent(design.id),price:design.price,title:design.name||design.product.name};
        }else{
          const {kitchen}=await api<{kitchen:KitchenDesign}>("",{op:"save-kitchen",plan:option.plan,name:option.title.slice(0,80)});
          chosen={optionId:option.id,source:{kind:"kitchen",id:kitchen.id,version:kitchen.version},url:"/cocinas?cocina="+encodeURIComponent(kitchen.id),price:kitchen.result.price,title:kitchen.name};
        }
        savedOptions.current.set(option.id,chosen);
      }
      if(sequence!==request.current)return;
      if(personalize)window.location.assign(chosen.url);
      else {setSelection(chosen);requestAnimationFrame(()=>contact.current?.scrollIntoView({block:"start",behavior:"instant"}));}
    }catch(cause){setError(cause instanceof Error?cause.message:"No pudimos guardar la propuesta. Tu solicitud no se ha enviado.");}
    finally{setBusyChoice("");}
  }
  return <>
    <Header />
    <main className="design-assistant" id="main-content" tabIndex={-1}>
      <section className="assistant-intro">
        <div><p className="alrazz-eyebrow">El capo · Del espacio al mueble</p><h1>Primero tu espacio.<br /><em>Después, las posibilidades.</em></h1><p>Cuéntanos qué necesitas y cuánto lugar tienes. Buscaremos propuestas del catálogo del taller para que puedas compararlas y hacerlas tuyas.</p></div>
        <div className="assistant-plan-mark" aria-hidden="true"><span>Tu espacio</span><i /><b>18</b><small>mm · melamina</small><span>Tu manera de habitarlo</span></div>
      </section>
      <div className="assistant-workspace">
        <form onSubmit={find} className="assistant-brief" aria-label="Medidas y preferencias para buscar propuestas">
          <fieldset disabled={finding || !!busyChoice}>
            <legend><span>01</span> ¿Qué quieres resolver?</legend>
            <div className="assistant-purposes" role="group" aria-label="Uso del mueble">
              {purposes.map(item=>{const Icon=item.icon;return <button type="button" key={item.id} aria-pressed={purpose===item.id} onClick={()=>changePurpose(item.id)}><Icon size={22} aria-hidden="true" /><span><strong>{item.title}</strong><small>{item.description}</small></span>{purpose===item.id&&<Check size={17} aria-hidden="true" />}</button>;})}
            </div>
          </fieldset>
          <fieldset disabled={finding || !!busyChoice}>
            <legend><span>02</span> Las medidas de tu espacio</legend>
            <p className="assistant-field-hint">Indica el máximo disponible en centímetros. Las propuestas pueden ocupar menos espacio.</p>
            {isKitchen&&<label>Forma de la cocina<select value={fields.layout} onChange={event=>revise({...fields,layout:event.target.value as Fields["layout"]})}><option value="straight">Lineal · una pared</option><option value="l">En L · dos paredes</option></select></label>}
            <div className="assistant-measure-grid">
              <label>{isKitchen?"Largo de pared A":"Ancho disponible"}<div><input type="number" inputMode="decimal" required min={isKitchen?100:60} max={600} step={1} value={fields.width} onChange={event=>revise({...fields,width:event.target.value})}/><span>cm</span></div></label>
              <label>{isKitchen?"Altura del ambiente":"Alto disponible"}<div><input type="number" inputMode="decimal" required min={isKitchen?200:60} max={400} step={1} value={fields.height} onChange={event=>revise({...fields,height:event.target.value})}/><span>cm</span></div></label>
              <label>Fondo máximo del mueble<div><input type="number" inputMode="decimal" required min={10} max={300} step={1} value={fields.depth} onChange={event=>revise({...fields,depth:event.target.value})}/><span>cm</span></div></label>
              {isKitchen&&fields.layout==="l"&&<label>Largo de pared B<div><input type="number" inputMode="decimal" required min={100} max={600} step={1} value={fields.wallB} onChange={event=>revise({...fields,wallB:event.target.value})}/><span>cm</span></div></label>}
            </div>
            <p className="assistant-measure-note"><Ruler size={16} aria-hidden="true" />{isKitchen?"El fondo del mueble y el largo de la pared B son medidas distintas. Confirma también puertas, ventanas e instalaciones con el taller.":"Mide también zócalos, enchufes y el acceso al ambiente. El taller revisará los detalles antes de fabricar."}</p>
          </fieldset>
          <fieldset disabled={finding || !!busyChoice}>
            <legend><span>03</span> Tu presupuesto y acabado</legend>
            <div className="assistant-preference-grid">
              <label>Presupuesto máximo · S/ <small>Opcional</small><input type="number" inputMode="decimal" min={1} max={1000000} step="any" value={fields.budget} onChange={event=>revise({...fields,budget:event.target.value})} placeholder="Puedes dejarlo en blanco" /></label>
              <label>Acabado preferido<select value={fields.finish} onChange={event=>revise({...fields,finish:event.target.value})}><option value="">Recomendado para cada modelo</option>{settings?.materials.filter(material=>material.active).map(material=><option key={material.id} value={material.id}>{materialLabel(material)}</option>)}</select></label>
            </div>
            <div className="assistant-services"><label><input type="checkbox" checked={fields.install} onChange={event=>revise({...fields,install:event.target.checked})}/> Incluir instalación</label><label><input type="checkbox" checked={fields.transport} onChange={event=>revise({...fields,transport:event.target.checked})}/> Incluir transporte</label></div>
            <p className="assistant-field-hint">Los servicios seleccionados usan las tarifas actuales del taller. La zona de entrega y las condiciones de obra se confirman al cotizar.</p>
          </fieldset>
          {catalogError&&<p className="assistant-error" role="alert">{catalogError} <button type="button" onClick={load}>Volver a cargar acabados</button></p>}
          {error&&<p className="assistant-error" role="alert">{error}</p>}
          <button className="assistant-find button" disabled={finding || !!busyChoice} aria-busy={finding}>{finding?<><Loader2 size={19} className="animate-spin" aria-hidden="true"/> Buscando propuestas…</>:<>Ver mis propuestas <ArrowRight size={19} aria-hidden="true"/></>}</button>
          <p className="assistant-privacy-note">Buscar propuestas no registra una solicitud ni comparte tus datos de contacto.</p>
        </form>
        <aside className="assistant-method"><p className="alrazz-eyebrow">Nuestro punto de partida</p><h2>Un proyecto pensado<br />para hacerlo bien.</h2><ol><li><span>01</span><div><strong>El espacio manda.</strong><p>Buscamos medidas y distribuciones compatibles con lo que nos indicas.</p></div></li><li><span>02</span><div><strong>Decides viendo alternativas.</strong><p>Compara dimensiones, acabados e importes y ajusta tu propuesta en 3D.</p></div></li><li><span>03</span><div><strong>El taller te acompaña.</strong><p>Envía una versión concreta para revisar materiales, entrega e instalación.</p></div></li></ol><a href="/#catalogo">Prefiero explorar el catálogo <ArrowUpRight size={17}/></a></aside>
      </div>
      {result&&<section className="assistant-results" aria-labelledby="assistant-results-title">
        <div className="assistant-result-heading"><div><p className="alrazz-eyebrow">Tu espacio, interpretado</p><h2 id="assistant-results-title" ref={resultHeading} tabIndex={-1}>{result.options.length?"Propuestas para comparar.":"Busquemos otra posibilidad."}</h2></div><p role="status">{result.message}</p></div>
        <div className="assistant-option-grid">{result.options.map((option,index)=><article className={`assistant-option${selection?.optionId===option.id?" is-chosen":""}`} key={option.id}>
          <div className="assistant-option-image"><span>Propuesta {String(index+1).padStart(2,"0")}</span><CatalogThumbnail name={option.title} geometry={option.kind==="furniture"?option.product.preview.geometry:option.result.geometry} materials={option.kind==="kitchen"?option.result.materials:settings?.materials??[]} handle={option.kind==="furniture"?option.config.handle:"push"}/></div>
          <div className="assistant-option-copy"><p className="assistant-budget-state" data-state={option.budgetState}>{option.budgetState==="within"?"Dentro de tu presupuesto":option.budgetState==="over"?"Supera el presupuesto indicado":option.budgetState==="quote-required"?"El taller debe confirmar el precio":"Propuesta compatible"}</p>
            <h3>{option.title}</h3><p className="assistant-option-size">{dimension(option.fit.width)} ancho × {dimension(option.fit.height)} alto × {dimension(option.fit.depth)} fondo</p>
            <ul>{option.reasons.map((reason,reasonIndex)=><li key={reasonIndex}>{reason}</li>)}</ul>
            <div className="assistant-option-price"><span>Importe referencial</span><strong>{option.price===null?"Por cotizar":money(option.price)}</strong></div>
            <button type="button" className="button assistant-personalize" disabled={!!busyChoice} onClick={()=>void choose(option,true)}>{busyChoice===option.id?<Loader2 size={16} className="animate-spin"/>:<SlidersHorizontal size={16}/>} Personalizar esta propuesta</button>
            <button type="button" className="assistant-request" disabled={!!busyChoice} onClick={()=>void choose(option,false)}>Solicitar cotización <ArrowUpRight size={17}/></button>
            <small>Al continuar, guardaremos una versión para que puedas editarla o adjuntarla a tu solicitud.</small>
          </div>
        </article>)}</div>
        <div className="assistant-result-notes">{result.notices.map(notice=><p key={notice}>{notice}</p>)}</div>
        {selection&&<div ref={contact} className="assistant-contact"><p className="assistant-saved-price">Versión guardada de {selection.title} · {selection.price===null?"Precio por cotizar":money(selection.price)}. {result.options.find(option=>option.id===selection.optionId)?.price!==selection.price&&"El importe se actualizó con la tarifa vigente al guardar."}</p><QuoteRequestForm sources={[selection.source]} projectTitle={selection.title} initiallyOpen/></div>}
      </section>}
    </main>
    <Footer settings={settings}/>
  </>;
}
