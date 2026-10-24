import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, Download, FileUp, Image, Ruler, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { getConstruction, type Construction, type Product, type Settings } from "../lib/furniture";
import { constructionTemplates, productTemplate } from "../lib/product-templates";
import { constructionLabels } from "./construction-labels";
import { productEditorError } from "./admin-product-preview";
import { createPlanDraft, MAX_PLAN_BYTES, MAX_REFERENCE_BYTES, parsePlanReference, planExample, referenceImageType, reviewPlanDimensions, type PlanComponent } from "./plan-reference";
import "./admin-plan-import.css";

export function PlanReferencePreview({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return <figure className="plan-reference-preview">
    {url && <img src={url} alt={`Plano de referencia: ${file.name}`} />}
    <figcaption>{file.name}<span>Referencia local · no se sube ni se guarda con el mueble</span></figcaption>
  </figure>;
}

export function AdminPlanImport({ open, onOpenChange, products, settings, onCreate }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  products: Product[]; settings: Settings;
  onCreate: (product: Product, reference: File | null) => void;
}) {
  const [kind, setKind] = useState<Construction["kind"]>("cabinet");
  const [name, setName] = useState("");
  const [dimensions, setDimensions] = useState({ width: 1200, height: 1800, depth: 400 });
  const [modules, setModules] = useState(3);
  const [shelves, setShelves] = useState(3);
  const [components, setComponents] = useState<PlanComponent[]>([]);
  const [componentIndex, setComponentIndex] = useState(0);
  const [filename, setFilename] = useState("");
  const [reference, setReference] = useState<File | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [adjustment, setAdjustment] = useState("");
  const readGeneration = useRef(0);
  useEffect(() => () => { readGeneration.current++; }, []);
  function selectComponent(component: PlanComponent, index: number) {
    // A rejected selection must never retain approval of the previous component.
    setReviewed(false); setComponentIndex(index); setName(component.name); setAdjustment("");
    setDimensions({ width: component.width, height: component.height, depth: component.depth });
    try {
      const next = reviewPlanDimensions(component);
      setDimensions(next); setName(component.name); setComponentIndex(index);
      setReviewed(false); setError("");
      const changed = (["width", "height", "depth"] as const).some(key => next[key] !== component[key]);
      setAdjustment(changed ? `El plano mide ${component.width} × ${component.height} × ${component.depth} mm. Se propone ${next.width} × ${next.height} × ${next.depth} mm para trabajar en pasos de 10 mm. Confirma o corrige antes de continuar.` : "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Revisa las medidas del plano."); }
  }
  async function readFile(file: File | undefined) {
    if (!file) return;
    const generation = ++readGeneration.current;
    setError(""); setReading(true); setReviewed(false);
    try {
      if (/\.json$/i.test(file.name)) {
        if (file.size > MAX_PLAN_BYTES) throw Error("El archivo de medidas supera 1 MB.");
        const document = parsePlanReference(await file.text());
        if (generation !== readGeneration.current) return;
        setComponents(document.components); setFilename(file.name);
        selectComponent(document.components[0], 0);
      } else {
        if (file.size > MAX_REFERENCE_BYTES) throw Error("La imagen supera 8 MB. Exporta una imagen más pequeña.");
        const mime = referenceImageType(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
        if (!mime) throw Error("Añade una imagen PNG, JPG o WebP, o las medidas JSON exportadas desde SketchUp. Para un archivo SKP o PDF, exporta primero una vista como imagen.");
        if (generation !== readGeneration.current) return;
        setReference(new File([file], file.name, { type: mime }));
      }
    } catch (cause) {
      if (generation === readGeneration.current) setError(cause instanceof Error ? cause.message : "No se pudo leer este archivo.");
    } finally { if (generation === readGeneration.current) setReading(false); }
  }
  function downloadExample() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(planExample, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "medidas-el-capo.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function selectKind(next: Construction["kind"]) {
    const template = productTemplate(next);
    setKind(next); setModules(template.defaults.modules); setShelves(template.defaults.shelves); setReviewed(false); setError("");
  }
  function create(event: FormEvent) {
    event.preventDefault();
    if (!reviewed || reading) return;
    try {
      const draft = createPlanDraft({ name, kind, ...dimensions, modules, shelves }, products, settings);
      onCreate(draft, reference);
    } catch (cause) { setError(productEditorError(cause)); }
  }
  const hasChanges = !!(name || reference || filename || reviewed || kind !== "cabinet" || modules !== 3 || shelves !== 3 || dimensions.width !== 1200 || dimensions.height !== 1800 || dimensions.depth !== 400);
  function requestClose(next: boolean) {
    if (!next && hasChanges && !window.confirm("¿Descartar el plano y las medidas que todavía no has llevado al editor?")) return;
    if (!next) readGeneration.current++;
    onOpenChange(next);
  }
  return <Dialog open={open} onOpenChange={requestClose}>
    <DialogContent className="admin-dialog admin-plan-dialog" showCloseButton={false}>
      <DialogHeader>
        <div className="admin-dialog-kicker">CATÁLOGO / DESDE UN PLANO</div>
        <DialogTitle>Del plano a tu próximo mueble.</DialogTitle>
        <DialogDescription>Trae una referencia, revisa sus medidas y continúa en el editor 3D. El mueble empieza como borrador y sin precio público.</DialogDescription>
      </DialogHeader>
      <button type="button" className="admin-dialog-close" aria-label="Cerrar importación de plano" onClick={() => requestClose(false)}><X size={21} /></button>
      <form className="admin-plan-form" onSubmit={create}>
        <div className="admin-plan-layout">
          <aside className="admin-plan-source">
            <div className="admin-plan-step"><span>01</span><h3>Tu referencia</h3></div>
            <label className="admin-plan-upload">
              <FileUp size={28} aria-hidden="true" />
              <strong>{reading ? "Leyendo referencia…" : "Elegir plano o medidas"}</strong>
              <small>PNG, JPG o WebP · hasta 8 MB<br />Medidas JSON · hasta 1 MB</small>
              <input type="file" accept=".png,.jpg,.jpeg,.webp,.json" aria-label="Añadir plano o archivo de medidas" disabled={reading} onChange={event => { void readFile(event.target.files?.[0]); event.target.value = ""; }} />
            </label>
            {reference ? <><PlanReferencePreview file={reference} /><button type="button" className="admin-plan-text-button" onClick={() => setReference(null)}>Quitar imagen</button></> : <div className="admin-plan-empty"><Image size={36} strokeWidth={1} aria-hidden="true" /><p>Ten el plano a la vista mientras defines tu mueble. También puedes introducir las medidas sin archivo.</p></div>}
            <details className="admin-plan-sketchup">
              <summary>¿Trabajas con SketchUp?</summary>
              <ol><li>Selecciona los grupos o componentes completos de cada mueble.</li><li>Usa el exportador de medidas de El capo y guarda el JSON.</li><li>Ábrelo aquí y elige el componente que quieres convertir en borrador.</li></ol>
              <a href="/tools/alrazz-sketchup-export.rb" download><Download size={15} aria-hidden="true" /> Descargar exportador SketchUp</a>
              <button type="button" onClick={downloadExample}><Download size={15} aria-hidden="true" /> Descargar ejemplo de medidas</button>
              <p>En SketchUp de escritorio, instala el archivo en tu carpeta Plugins y reinicia. Aparecerá en Extensiones → Exportar medidas para El capo. Si tu instalación requiere extensiones firmadas, utiliza el ejemplo JSON o las medidas manuales.</p>
              <p>La imagen se exporta desde Archivo → Exportar → Gráfico 2D. El archivo SKP no se abre directamente aquí.</p>
            </details>
          </aside>
          <div className="admin-plan-review">
            <div className="admin-plan-step"><span>02</span><h3>Revisa el mueble</h3></div>
            {components.length > 0 && <label className="admin-field"><span>Componente de {filename}</span><select value={componentIndex} onChange={event => { const index = Number(event.target.value); selectComponent(components[index], index); }}>{components.map((component, index) => <option key={index} value={index}>{component.name} · {component.width} × {component.height} × {component.depth} mm</option>)}</select></label>}
            <label className="admin-field"><span>Nombre del mueble</span><input value={name} onChange={event => { setName(event.target.value); setReviewed(false); }} required minLength={2} maxLength={70} placeholder="Ej. Estante del estudio" /></label>
            <label className="admin-field"><span>Estructura de partida</span><select value={kind} onChange={event => selectKind(event.target.value as Construction["kind"])}>{constructionTemplates.map(template => { const value = getConstruction(template).kind; return <option key={value} value={value}>{constructionLabels[value]}</option>; })}</select><small>Se conservan las reglas constructivas de esta estructura. Revisa después repisas, puertas y acabados en 3D.</small></label>
            <div className="admin-plan-dimensions">{([ ["width", "Ancho"], ["height", "Alto"], ["depth", "Fondo"] ] as const).map(([key, label]) => <label className="admin-field" key={key}><span>{label} · mm</span><input type="number" min={100} max={3000} step={10} required value={Number.isFinite(dimensions[key]) ? dimensions[key] : ""} onChange={event => { setDimensions(previous => ({ ...previous, [key]: event.target.value === "" ? NaN : Number(event.target.value) })); setReviewed(false); }} /></label>)}</div>
            {adjustment && <p className="admin-plan-adjustment" role="status"><Ruler size={17} aria-hidden="true" />{adjustment}</p>}
            <div className="admin-plan-dimensions is-distribution">
              <label className="admin-field"><span>Columnas</span><input type="number" min={1} max={6} required value={modules} disabled={kind === "desk" || kind === "desk-storage"} onChange={event => { setModules(Number(event.target.value)); setReviewed(false); }} /></label>
              <label className="admin-field"><span>Repisas por columna</span><input type="number" min={0} max={7} required value={shelves} disabled={kind === "desk"} onChange={event => { setShelves(Number(event.target.value)); setReviewed(false); }} /></label>
            </div>
            <div className="admin-plan-note"><Ruler size={19} aria-hidden="true" /><p><strong>Melamina de 18 mm.</strong> El plano aporta medidas exteriores. La estructura y el despiece se generan con las reglas del editor; requieren revisión del taller antes de fabricar.</p></div>
            <label className="admin-plan-confirm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} /><span>He revisado ancho, alto, fondo y estructura. Continuaré comprobando el mueble en el editor.</span></label>
            {error && <p className="admin-editor-error" role="alert">{error}</p>}
          </div>
        </div>
        <div className="admin-plan-footer"><span><Check size={15} aria-hidden="true" /> El archivo permanece en este navegador</span><button className="button rust" type="submit" disabled={!reviewed || reading}>Continuar en el editor <ArrowRight size={17} aria-hidden="true" /></button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
