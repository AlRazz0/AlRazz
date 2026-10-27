import { useId, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Layers3, Search, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog";
import { filterMaterialLibrary, materialBoardLabel, materialCollectionHref, materialLibraryOptions } from "../lib/material-library";
import type { PublicMaterial } from "./types";
import { MaterialSource, MaterialSwatch } from "./MaterialSwatch";
import { materialLabel } from "./materials";
import "./material-library.css";

export type MaterialLibraryProps = {
  materials: readonly PublicMaterial[];
  selectedId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  onReturnFocus: () => void;
};

export default function MaterialLibrary({ materials, selectedId, open, onOpenChange, onSelect, onReturnFocus }: MaterialLibraryProps) {
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState<string>();
  const [board, setBoard] = useState<PublicMaterial["board"]>();
  const [mobileView, setMobileView] = useState<"browse" | "detail">("browse");
  const id = useId();
  const searchField = useRef<HTMLInputElement>(null);
  const active = useMemo(() => materials.filter(material => material.active), [materials]);
  const options = useMemo(() => materialLibraryOptions(active), [active]);
  const filtered = useMemo(() => filterMaterialLibrary(active, { search, brand, board }), [active, search, brand, board]);
  const selected = active.find(material => material.id === selectedId) ?? active[0];
  const hasFilters = !!search.trim() || brand !== undefined || board !== undefined;
  const continuation = selected ? materialCollectionHref(selected) : undefined;

  return <Dialog open={open} onOpenChange={nextOpen => {
    // The search field receives initial focus; keep its mobile pane visible on reopen.
    if (!nextOpen) setMobileView("browse");
    onOpenChange(nextOpen);
  }}>
    <DialogContent className="material-library-dialog" showCloseButton={false}
      onOpenAutoFocus={event => { event.preventDefault(); searchField.current?.focus(); }}
      onCloseAutoFocus={event => { event.preventDefault(); onReturnFocus(); }}>
      <header className="material-library-header"><div><p className="material-library-eyebrow">La biblioteca de acabados</p><DialogTitle>El carácter está en la superficie.</DialogTitle><DialogDescription>Muestras de los acabados activos del taller. Elige un tono para continuar explorando los muebles; las medidas vienen después.</DialogDescription></div><DialogClose asChild><button type="button" className="material-library-close" aria-label="Cerrar biblioteca de acabados"><X size={22} strokeWidth={1.5} aria-hidden="true" /></button></DialogClose></header>
      <div className="material-library-mobile-views" role="group" aria-label="Vista de la biblioteca"><button type="button" aria-pressed={mobileView === "browse"} aria-controls={`${id}-browser`} data-ui-sound={mobileView === "browse" ? undefined : "select"} onClick={() => setMobileView("browse")}>Todos los acabados</button><button type="button" aria-pressed={mobileView === "detail"} aria-controls={`${id}-detail`} data-ui-sound={mobileView === "detail" ? undefined : "select"} onClick={() => setMobileView("detail")}>Ver acabado elegido</button></div>
      <div className="material-library-content" data-mobile-view={mobileView}>
        <section className="material-library-browser" id={`${id}-browser`} aria-label="Todos los acabados disponibles en el catálogo">
          <div className="material-library-filters"><label className="material-library-search"><Search size={19} strokeWidth={1.5} aria-hidden="true" /><span className="material-library-sr-only">Buscar por nombre, marca, código o textura</span><input ref={searchField} type="search" maxLength={160} value={search} onChange={event => setSearch(event.target.value)} placeholder="Un nombre, una marca, una textura…" /></label><div className="material-library-selects"><label>Marca<select value={brand === undefined ? "all" : `brand:${brand}`} onChange={event => setBrand(event.target.value === "all" ? undefined : event.target.value.slice(6))}><option value="all">Todas las marcas</option>{options.brands.map(value => <option key={value} value={`brand:${value}`}>{value || "Sin marca indicada"}</option>)}</select></label><label>Tipo de tablero<select value={board ?? "all"} onChange={event => setBoard(event.target.value === "all" ? undefined : event.target.value as PublicMaterial["board"])}><option value="all">Todos los tipos</option>{options.boards.map(value => <option key={value} value={value}>{materialBoardLabel(value)}</option>)}</select></label></div></div>
          <div className="material-library-results"><p role="status" aria-live="polite" aria-atomic="true">{filtered.length} de {active.length} acabados</p>{hasFilters && <button type="button" onClick={() => { setSearch(""); setBrand(undefined); setBoard(undefined); }} data-ui-sound="select">Limpiar filtros <X size={14} aria-hidden="true" /></button>}</div>
          {filtered.length ? <ul className="material-library-grid">{filtered.map(material => <li key={material.id}><button type="button" className={`material-library-sample${material.id === selected?.id ? " is-selected" : ""}`}
            aria-label={`Elegir ${materialLabel(material)}`} aria-pressed={material.id === selected?.id}
            data-ui-sound={material.id === selected?.id ? undefined : "select"}
            onClick={() => { if (material.id !== selected?.id) onSelect(material.id); }}>
            <span className="material-library-sample-art"><MaterialSwatch material={material} />{material.id === selected?.id && <span className="material-library-selected-mark"><Check size={18} aria-hidden="true" /></span>}</span>
            <span className="material-library-sample-name">{material.name}</span><span className="material-library-sample-meta">{material.brand || "Melamina"}{material.code ? ` · ${material.code}` : ""}</span><small>{materialBoardLabel(material.board)} · 18 mm</small>
          </button></li>)}</ul> : <div className="material-library-empty"><Layers3 size={34} strokeWidth={1.2} aria-hidden="true" /><h3>{active.length ? "Probemos con otra búsqueda." : "Los acabados se están preparando."}</h3><p>{active.length ? "Puedes cambiar la marca, el tipo de tablero o ver de nuevo toda la biblioteca." : "Los acabados publicados aparecerán aquí cuando estén disponibles en el catálogo."}</p>{hasFilters && <button type="button" onClick={() => { setSearch(""); setBrand(undefined); setBoard(undefined); searchField.current?.focus(); }} data-ui-sound="select">Ver todos los acabados <ArrowRight size={16} aria-hidden="true" /></button>}</div>}
        </section>
        <aside className="material-library-detail" id={`${id}-detail`} aria-label="Acabado elegido">{selected ? <>
          <div key={selected.id} className="material-library-detail-art" role="img" aria-label={`Muestra digital de ${materialLabel(selected)}`}><MaterialSwatch material={selected} /></div>
          <div className="material-library-detail-copy"><p className="material-library-eyebrow">Tu punto de partida</p><h3 aria-live="polite">{selected.name}</h3><dl><div><dt>Marca</dt><dd>{selected.brand || "No indicada en el catálogo"}</dd></div>{selected.code && <div><dt>Código</dt><dd>{selected.code}</dd></div>}<div><dt>Tablero</dt><dd>{materialBoardLabel(selected.board)}</dd></div><div><dt>Espesor del mueble</dt><dd>Melamina de 18 mm</dd></div>{selected.texture && <div><dt>Textura descrita</dt><dd>{selected.texture}</dd></div>}</dl><MaterialSource material={selected} /><p className="material-library-disclaimer">Una pantalla no reemplaza una muestra física. Confirmamos contigo el tono, el acabado y su disponibilidad antes de fabricar.</p></div>
        </> : <div className="material-library-detail-empty"><Layers3 size={44} strokeWidth={1} aria-hidden="true" /><p>Elige un acabado para verlo de cerca.</p></div>}</aside>
      </div>
      <footer className="material-library-footer"><div><small>{selected ? "Acabado elegido" : "La colección del taller"}</small><strong>{selected ? selected.name : "Descubre los muebles publicados"}</strong></div><div className="material-library-footer-actions"><DialogClose asChild><button type="button" className="material-library-done">Seguir explorando aquí</button></DialogClose><a href={continuation ?? "/coleccion"} className="material-library-continue">{selected ? "Encontrar un mueble con este acabado" : "Explorar la colección"} <ArrowRight size={19} aria-hidden="true" /></a></div></footer>
    </DialogContent>
  </Dialog>;
}
