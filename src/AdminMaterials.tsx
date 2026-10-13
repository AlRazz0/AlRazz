import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, Palette, Pencil, Plus, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { Switch } from "../components/ui/switch";
import { type Material, type Product, type Settings } from "../lib/furniture";
import { commercialMaterials } from "../lib/material-presets";
import { mergeCommercialMaterials } from "../lib/material-catalog";
import { materialBrands, materialLabel } from "./materials";
import { MaterialSource, MaterialSwatch } from "./MaterialSwatch";
import { applyMaterialDraft, newMaterialDraft } from "./admin-material-draft";
import "./admin-materials.css";

function Field({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return <label className="admin-field"><span>{title}</span>{children}{note && <small>{note}</small>}</label>;
}
const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");

export function AdminMaterials({ materials, products, materialRate, change, announce, busy }: {
  materials: Settings["materials"]; products: Product[]; materialRate: number;
  change: (materials: Material[]) => void; announce: (message: string) => void; busy: boolean;
}) {
  const [brand, setBrand] = useState("all");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Material | null>(null);
  const [originalId, setOriginalId] = useState<string | null>(null);
  const [initialDraft, setInitialDraft] = useState("");
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const highlightedRow = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const dirty = !!draft && JSON.stringify(draft) !== initialDraft;
  const shown = materials.filter((material) => (brand === "all" || material.brand === brand) &&
    normalized(`${material.name} ${material.brand} ${material.code}`).includes(normalized(search.trim())));
  const preset = draft && commercialMaterials.find((item) => item.id === draft.id && item.name === draft.name && item.brand === draft.brand && item.board === draft.board);
  const usage = originalId ? products.filter((product) => product.defaults.finish === originalId || product.defaults.interior === originalId).length : 0;
  useEffect(() => {
    if (highlight && !draft) highlightedRow.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlight, draft]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  function open(material?: Material) {
    const next = material ? structuredClone(material) : newMaterialDraft(brand === "all" ? "Hispano" : brand);
    setOriginalId(material?.id ?? null);
    setDraft(next); setInitialDraft(JSON.stringify(next));
    setError(""); setInvalidField(""); setDiscard(false);
  }
  function close() {
    if (dirty) setDiscard(true);
    else setDraft(null);
  }
  function apply(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!draft) return;
    try {
      const result = applyMaterialDraft(materials, draft, originalId);
      change(result.materials);
      setBrand("all"); setSearch(""); setHighlight(result.material.id); setDraft(null);
      announce(`${result.material.name}: cambios preparados. Pulsa «Guardar acabados» para aplicarlos en la tienda.`);
    } catch (cause) {
      const issue = cause && typeof cause === "object" && "issues" in cause
        ? (cause as { issues: { path: (string | number)[]; message: string }[] }).issues[0]
        : undefined;
      const field = String(issue?.path[0] ?? "");
      const messages: Record<string, string> = {
        name: "Escribe un nombre comercial de entre 2 y 70 caracteres.",
        price: "Introduce un índice de costo entre 0 y 5000.",
        brand: "La marca admite hasta 60 caracteres.",
        code: "El código del fabricante admite hasta 60 caracteres.",
        texture: "La textura comercial admite hasta 80 caracteres.",
      };
      setInvalidField(field);
      setError(messages[field] ?? issue?.message ?? (cause instanceof Error ? cause.message : "Revisa los datos del acabado."));
      requestAnimationFrame(() => {
        const input = form.current?.querySelector<HTMLInputElement>(`[name="${field}"]`);
        const details = input?.closest("details");
        if (details) details.open = true;
        input?.focus();
      });
    }
  }
  const patch = (value: Partial<Material>) => setDraft((current) => current ? { ...current, ...value } : null);
  return <section className="admin-panel admin-finishes-panel">
    <div className="admin-panel-heading">
      <div><h2>Acabados de melamina</h2><p>Añade colores, cambia tarifas y decide cuáles ofrecer en el configurador.</p></div>
      <button type="button" className="button rust" disabled={busy || materials.length >= 100} onClick={() => open()}><Plus size={17} /> Añadir acabado</button>
    </div>
    <div className="admin-finish-guide">
      <Palette size={20} /><div><strong>Tu catálogo de colores, en tres pasos.</strong><p>1. Añade el nombre, la marca y el tono. 2. Revisa su costo y activa «Visible». 3. Guarda los acabados. Los muebles podrán elegirlo como exterior o interior.</p><p>El tablero se calcula por su superficie real. Para ofrecer un complemento por unidad, metro lineal o m², abre el mueble → «Opciones y acabados».</p></div>
    </div>
    <div className="admin-finish-toolbar">
      <label className="admin-search"><Search size={17} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, marca o código…" aria-label="Buscar acabados" /></label>
      <select value={brand} onChange={(event) => setBrand(event.target.value)} aria-label="Filtrar acabados por marca"><option value="all">Todas las marcas</option>{materialBrands(materials).map((item) => <option key={item}>{item}</option>)}</select>
      <span>{shown.length} de {materials.length} acabados</span>
    </div>
    <div className="admin-finish-list">
      {shown.map((material) => <div className={`admin-finish-item${highlight === material.id ? " is-highlighted" : ""}`} key={material.id} ref={highlight === material.id ? highlightedRow : undefined}>
        <MaterialSwatch material={material} title={materialLabel(material)} />
        <div className="admin-finish-name"><strong>{material.name}</strong><span>{material.brand || "Sin marca"} · {material.board === "rh" ? "RH" : "Estándar"} · 18 mm{material.code ? ` · ${material.code}` : ""}</span></div>
        <label className="admin-switch-label"><Switch checked={material.active} disabled={busy} onCheckedChange={(active) => change(materials.map((item) => item.id === material.id ? { ...item, active } : item))} aria-label={`${material.active ? "Ocultar" : "Mostrar"} acabado ${material.name}`} /><span>{material.active ? "Visible" : "Oculto"}</span></label>
        <button type="button" className="button outline" disabled={busy} onClick={() => open(material)} aria-label={`Editar acabado ${material.name}`}><Pencil size={15} /> Editar</button>
      </div>)}
      {!shown.length && <div className="admin-finish-empty"><p>No hay acabados con estos filtros.</p><button type="button" className="button outline" onClick={() => { setBrand("all"); setSearch(""); }}>Ver todos los acabados</button></div>}
    </div>
    <div className="admin-finish-library"><div><strong>Catálogos de las marcas</strong><p>Completa referencias oficiales de Hispano, Vesto y Pelíkano. Los acabados nuevos se añaden ocultos para que revises sus tarifas.</p></div><button type="button" className="button outline" disabled={busy} onClick={() => {
      const merged = mergeCommercialMaterials(materials, commercialMaterials);
      if (merged.length > 100) { announce("El catálogo admite 100 acabados. Añade las referencias que necesitas de forma individual."); return; }
      change(merged); setBrand("all"); setSearch("");
      announce("Referencias de marcas completadas. Conservamos tus nombres, precios y visibilidad. Guarda los acabados para aplicar los cambios.");
    }}><Plus size={16} /> Completar referencias</button></div>
    <Dialog open={!!draft} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="admin-dialog admin-finish-dialog">
        <DialogHeader><DialogTitle>{originalId ? "Editar acabado" : "Añadir acabado"}</DialogTitle><DialogDescription>Melamina de 18 mm. Primero prepara sus datos; después guarda el catálogo de acabados.</DialogDescription></DialogHeader>
        {draft && <form ref={form} noValidate onSubmit={apply} className="admin-finish-form">
          {error && <p id="admin-finish-error" role="alert" className="admin-inline-error">{error}</p>}
          <div className="admin-finish-editor-preview"><MaterialSwatch material={draft} /><div><strong>{draft.name || "Tu nuevo acabado"}</strong><span>{draft.brand || "Sin marca"} · {draft.board === "rh" ? "Resistente a la humedad" : "Melamina estándar"}</span></div></div>
          <div className="admin-form-grid">
            <Field title="Nombre comercial"><input name="name" aria-invalid={invalidField === "name"} aria-describedby={invalidField === "name" ? "admin-finish-error" : undefined} autoFocus required minLength={2} maxLength={70} value={draft.name} placeholder="Ej. Roble natural" onChange={(event) => patch({ name: event.target.value })} /></Field>
            <Field title="Marca"><input name="brand" value={draft.brand} list="admin-finish-brands" maxLength={60} placeholder="Hispano, Vesto, Pelikano…" onChange={(event) => patch({ brand: event.target.value })} /><datalist id="admin-finish-brands"><option value="Hispano" /><option value="Vesto" /><option value="Pelikano" /></datalist></Field>
            <Field title="Color del acabado" note="Cambiar el color reemplaza la muestra del fabricante por tu tono."><input name="color" type="color" value={draft.color} onChange={(event) => patch({ color: event.target.value, swatch: "", renderTexture: false })} /></Field>
            <Field title="Tipo de tablero"><select value={draft.board} onChange={(event) => patch({ board: event.target.value as Material["board"] })}><option value="standard">Estándar · 18 mm</option><option value="rh">RH · Resistente a la humedad · 18 mm</option></select></Field>
            <Field title="Índice de costo" note={`100 equivale a la tarifa base de S/ ${materialRate.toFixed(2)} por m². 110 aumenta ese costo un 10 %.`}><input name="price" aria-invalid={invalidField === "price"} aria-describedby={invalidField === "price" ? "admin-finish-error" : undefined} required type="number" min={0} max={5000} step={0.1} value={Number.isNaN(draft.price) ? "" : draft.price} onChange={(event) => patch({ price: event.target.value === "" ? Number.NaN : Number(event.target.value) })} /></Field>
            <Field title="Código del fabricante" note="Opcional; usa la referencia comercial del proveedor."><input name="code" value={draft.code} maxLength={60} onChange={(event) => patch({ code: event.target.value })} /></Field>
          </div>
          <label className="admin-switch-label admin-finish-visibility"><Switch checked={draft.active} onCheckedChange={(active) => patch({ active })} /><span><strong>{draft.active ? "Visible en el configurador" : "Oculto del configurador"}</strong><small>Se aplicará cuando pulses «Guardar acabados». Ocultarlo conserva los diseños guardados.</small></span></label>
          <details className="admin-finish-details"><summary>Textura, ficha e identificador</summary><div className="admin-form-grid">
            <Field title="Textura comercial"><input name="texture" value={draft.texture || ""} maxLength={80} placeholder="Opcional" onChange={(event) => patch({ texture: event.target.value })} /></Field>
            <Field title="Ficha oficial del fabricante" note="Enlace HTTPS de Hispano, Arauco o Pelíkano; opcional."><input name="sourceUrl" aria-invalid={invalidField === "sourceUrl"} aria-describedby={invalidField === "sourceUrl" ? "admin-finish-error" : undefined} type="url" value={draft.sourceUrl || ""} maxLength={600} placeholder="https://…" onChange={(event) => patch({ sourceUrl: event.target.value })} /></Field>
          </div>{preset?.swatch && <label className="admin-switch-label"><Switch checked={draft.swatch === preset.swatch} onCheckedChange={(checked) => patch({ swatch: checked ? preset.swatch : "", renderTexture: checked ? preset.renderTexture : false })} /><span>Usar muestra oficial del fabricante</span></label>}<MaterialSource material={draft} /><p className="admin-help">{originalId ? `Identificador permanente: ${originalId}.${usage ? ` Lo usan ${usage} modelos en su configuración inicial.` : ""}` : "El identificador se genera automáticamente al añadir el acabado."}</p></details>
          <p className="admin-help">Crea un acabado separado para cada variante RH y su tarifa. RH no significa impermeable. Verifica el tono y la disponibilidad con tu proveedor.</p>
          <div className="admin-finish-dialog-actions"><button type="button" className="button outline" onClick={close}>Cancelar</button><button type="submit" className="button rust"><Check size={16} /> {originalId ? "Aplicar cambios" : "Añadir al catálogo"}</button></div>
        </form>}
      </DialogContent>
    </Dialog>
    <AlertDialog open={discard} onOpenChange={setDiscard}>
      <AlertDialogContent className="admin-dialog admin-confirm">
        <AlertDialogHeader><AlertDialogTitle>¿Descartar los cambios del acabado?</AlertDialogTitle><AlertDialogDescription>Estos datos aún no se han aplicado al catálogo. Puedes seguir editando o descartarlos.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Seguir editando</AlertDialogCancel><button type="button" className="button rust" onClick={() => { setDiscard(false); setDraft(null); }}>Descartar cambios</button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
