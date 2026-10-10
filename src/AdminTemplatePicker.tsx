import { ArrowUpRight, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import { getConstruction, type Product } from "../lib/furniture";
import { constructionTemplates } from "../lib/product-templates";
import { constructionDescriptions, constructionLabels } from "./construction-labels";
import "./admin-catalog.css";

/** A lightweight front outline for browsing; the editor uses the shared 3D engine. */
export function ModelOutline({ product }: { product: Product }) {
  const construction = getConstruction(product);
  const { width, height, modules, shelves, doors } = product.defaults;
  const scale = Math.min(156 / width, 112 / height);
  const w = width * scale, h = height * scale;
  const x = (200 - w) / 2, y = 130 - h;
  const isDesk = construction.kind === "desk" || construction.kind === "desk-storage";
  const storage = construction.kind === "desk-storage" ? construction.storageWidth * scale : 0;
  const sx = construction.kind === "desk-storage" && construction.storageSide === "left" ? x : x + w - storage;
  const floor = construction.kind === "kitchen-base" ? construction.plinthHeight * scale : 0;
  const loft = construction.kind === "wardrobe" ? construction.loftHeight * scale : 0;
  const count = Math.max(1, Math.min(6, modules));
  return (
    <svg viewBox="0 0 200 152" aria-hidden="true" className="admin-model-outline">
      <path d="M14 133H186" stroke="currentColor" opacity=".18" />
      <g stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
        <path d={`M${x} 130V${y}H${x + w}V130`} fill="none" />
        <path d={`M${x} ${y + 3}H${x + w}`} opacity=".5" />
        {isDesk ? <>
          {storage > 0 && <>
            <rect x={sx} y={y + 3} width={storage} height={h - 3} fill="currentColor" fillOpacity=".06" />
            {Array.from({ length: shelves }, (_, i) => <path key={i} d={`M${sx} ${y + h * (i + 1) / (shelves + 1)}h${storage}`} opacity=".35" />)}
            {doors !== "none" && <path d={`M${sx + storage - 5} ${y + h / 2 - 4}v8`} />}
          </>}
        </> : <>
          <rect x={x} y={y + 3} width={w} height={h - 3 - floor} fill="currentColor" fillOpacity=".045" />
          {floor > 0 && <path d={`M${x + 4} ${130 - floor}V130H${x + w - 4}V${130 - floor}`} fill="currentColor" fillOpacity=".08" />}
          {loft > 0 && <path d={`M${x} ${y + loft}h${w}`} />}
          {Array.from({ length: count }, (_, column) => {
            const left = x + column * w / count;
            const cell = w / count;
            const hanging = construction.kind === "wardrobe" && column < construction.hangingModules;
            return <g key={column}>
              {column > 0 && <path d={`M${left} ${y + 3}V${130 - floor}`} />}
              {hanging ? <path d={`M${left + 5} ${y + loft + 10}h${cell - 10}`} strokeWidth="2.5" opacity=".5" /> :
                Array.from({ length: Math.min(5, shelves) }, (_, i) => <path key={i} d={`M${left} ${y + loft + (h - loft - floor) * (i + 1) / (Math.min(5, shelves) + 1)}h${cell}`} opacity=".35" />)}
              {doors !== "none" && <>
                <rect x={left + 2} y={doors === "lower" ? y + h / 2 : y + 4} width={Math.max(1, cell - 4)} height={Math.max(1, (doors === "lower" ? h / 2 : h - 4) - floor - 2)} fill="currentColor" fillOpacity=".04" strokeWidth=".6" />
                <path d={`M${left + cell - 6} ${y + h * (doors === "lower" ? .75 : .5) - 4}v8`} />
              </>}
            </g>;
          })}
        </>}
      </g>
    </svg>
  );
}

export function AdminTemplatePicker({ open, onOpenChange, onSelect }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (product: Product) => void;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="admin-dialog admin-template-dialog" showCloseButton={false}>
      <DialogHeader>
        <div className="admin-dialog-kicker">CATÁLOGO / NUEVO MUEBLE</div>
        <DialogTitle>Empieza por su estructura.</DialogTitle>
        <DialogDescription>Elige una base y adapta sus medidas a tu plano. Se creará como borrador para que puedas revisarlo antes de publicarlo.</DialogDescription>
      </DialogHeader>
      <button className="admin-dialog-close" aria-label="Cerrar selección de estructura" onClick={() => onOpenChange(false)}><X size={21} /></button>
      <div className="admin-template-grid">
        {constructionTemplates.map(template => {
          const kind = getConstruction(template).kind;
          return <button type="button" className="admin-template-card" key={kind} onClick={() => onSelect(template)} aria-label={`Crear ${constructionLabels[kind]}`}>
            <div className="admin-template-drawing"><ModelOutline product={template} /><span>18 mm</span></div>
            <div className="admin-template-copy">
              <strong>{constructionLabels[kind]} <ArrowUpRight size={17} /></strong>
              <p>{constructionDescriptions[kind]}</p>
              <small>Base: {template.defaults.width} × {template.defaults.height} × {template.defaults.depth} mm</small>
            </div>
          </button>;
        })}
      </div>
      <p className="admin-template-note">¿Ya tienes un mueble parecido? Cierra esta ventana y usa <strong>Duplicar</strong> en el catálogo para conservar sus opciones y tarifas.</p>
    </DialogContent>
  </Dialog>;
}
