import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { MeasurementReport, MeasurementStep, MeasurementPage } from "../lib/measurement-types";
import "./measurements.css";
const steps:Record<MeasurementStep,string>={visit:"Sesiones medidas",assistant_result:"Vieron propuestas",design_saved:"Guardaron un diseño",quote_started:"Abrieron el formulario",quote_submitted:"Registraron una solicitud"};
const pages:Record<MeasurementPage,string>={home:"Inicio",assistant:"Asistente",configurator:"Muebles",kitchen:"Cocinas",cart:"Selección"};
export default function AdminMeasurements({active=true}:{active?:boolean}) {
  const [days,setDays]=useState("30"),[report,setReport]=useState<MeasurementReport>(),[error,setError]=useState(""),[refresh,setRefresh]=useState(0);
  useEffect(()=>{if(!active)return;let current=true;setError("");setReport(undefined);api<MeasurementReport>(`action=measurements&days=${days}`).then(data=>{if(current)setReport(data);}).catch(cause=>{if(current)setError(cause instanceof Error?cause.message:"No se pudo cargar la medición.");});return()=>{current=false;};},[active,days,refresh]);
  return <section className="admin-panel admin-measurements" aria-labelledby="measurement-title"><div className="admin-panel-heading"><div><h2 id="measurement-title">Uso y rendimiento</h2><p>Una muestra voluntaria para detectar pasos difíciles y páginas lentas.</p></div><label>Período<select value={days} onChange={event=>setDays(event.target.value)}><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option></select></label><button type="button" onClick={()=>setRefresh(refresh+1)}>Actualizar</button></div>
    {error&&<p role="alert">{error}</p>}{!report&&!error&&<p role="status">Cargando mediciones…</p>}
    {report&&<><p>Solo incluye visitas que permitieron la medición. Una sesión corresponde a una pestaña y un día UTC; una persona puede tener varias. No equivale a visitantes únicos ni ventas.</p>
      <div className="measurement-steps">{report.steps.map(row=><article key={row.step}><strong>{row.sessions}</strong><span>{steps[row.step]}</span><small>{report.sessions?Math.round(row.sessions/report.sessions*100):0}% de sesiones medidas</small></article>)}</div>
      <p>Los pasos pueden seguir caminos distintos. La diferencia entre dos cifras no demuestra abandono. Las aceptaciones comerciales se consultan en el CRM.</p>
      <h3>Respuesta, carga y estabilidad</h3><p>Percentil 75 por página y dispositivo; hasta 30 días de muestras. INP ≤ 200 ms, LCP ≤ 2500 ms y CLS ≤ 0,1 son los objetivos. Las muestras pequeñas son orientativas.</p>
      {!report.vitals.length?<p>No hay muestras todavía. La medición es opcional desde «Privacidad y medición de uso» en el pie de página.</p>:<div className="measurement-table-wrap"><table><thead><tr><th>Página</th><th>Dispositivo</th><th>Métrica</th><th>P75</th><th>Muestras</th><th>Objetivo</th></tr></thead><tbody>{report.vitals.map(row=><tr key={`${row.page}:${row.device}:${row.name}`}><th scope="row">{pages[row.page]}</th><td>{row.device==="mobile"?"Móvil":"Escritorio"}</td><td>{row.name}</td><td>{row.name==="CLS"?row.p75.toFixed(3):`${Math.round(row.p75)} ms`}</td><td>{row.samples}{row.samples<20?" · pocas muestras":""}</td><td>{row.p75<=({INP:200,LCP:2500,CLS:.1}[row.name])?"Dentro del objetivo":"Revisar"}</td></tr>)}</tbody></table></div>}
    </>}
  </section>;
}
