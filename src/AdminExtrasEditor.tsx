import { useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Config, Product } from "../lib/furniture";
import { uniqueProductId } from "./admin-catalog-draft";
import "./product-extras.css";

type Extra = NonNullable<Product["extras"]>[number];
const numberValue = (value: string) => value === "" ? Number.NaN : Number(value);

export function AdminExtrasEditor({ product, onChange }: {
  product: Product;
  onChange: (value: Product) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const extras = product.extras ?? [];
  const selections = product.defaults.extras ?? [];
  function update(next: Extra[], selected = selections) {
    const allowed = selected.filter(selection => next.some(extra => extra.id === selection.id && extra.active));
    const defaults: Config = { ...product.defaults };
    if (allowed.length) defaults.extras = allowed;
    else delete defaults.extras;
    const value = { ...product, defaults };
    if (next.length) value.extras = next;
    else delete value.extras;
    onChange(value);
  }
  function edit(id: string, next: Extra) {
    update(extras.map(extra => extra.id === id ? next : extra));
  }
  return <div className="admin-extras-editor">
    <div className="admin-extras-heading">
      <div><h4>Acabados y complementos con tarifa propia</h4>
        <p>Crea parámetros opcionales para este modelo, como un perfil, una protección o un accesorio. Cada uno tiene su nombre, cantidad y forma de cobro.</p></div>
      <button type="button" className="button outline" disabled={extras.length >= 20} onClick={() => {
        update([...extras, {
          id: uniqueProductId("opcion", extras.map(extra => extra.id)),
          name: "Nuevo complemento", description: "", active: false,
          pricing: { basis: "unit", amount: 0 }, maxQuantity: 1,
        }]);
        requestAnimationFrame(() => {
          const row = list.current?.lastElementChild;
          row?.scrollIntoView({ block: "center", behavior: "smooth" });
          row?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
        });
      }}><Plus size={16} /> Añadir parámetro</button>
    </div>
    {!extras.length && <p className="admin-help">No hay complementos definidos. El color de la melamina se elige arriba; vidrio y aluminio usan las tarifas de frentes especiales del taller.</p>}
    <div ref={list} className="admin-extras-list">
      {extras.map((extra, index) => {
        const selected = selections.find(selection => selection.id === extra.id);
        return <fieldset className="admin-extra-card" key={extra.id}>
          <legend>Parámetro {index + 1} · {extra.active ? "Disponible" : "Oculto"}</legend>
          <div className="admin-form-grid">
            <label className="admin-field"><span>Nombre del complemento</span><input value={extra.name} maxLength={70} required onChange={event => edit(extra.id, { ...extra, name: event.target.value })} /></label>
            <label className="admin-field"><span>Cobrar por</span><select value={extra.pricing.basis} onChange={event => {
              const basis = event.target.value;
              const amount = extra.pricing.amount;
              edit(extra.id, { ...extra, pricing: basis === "linear-meter" ? { basis, amount, dimension: "width" } : basis === "square-meter" ? { basis, amount, plane: "front" } : { basis: "unit", amount } });
            }}><option value="unit">Unidad</option><option value="linear-meter">Metro lineal</option><option value="square-meter">Metro cuadrado</option></select></label>
            <label className="admin-field"><span>Tarifa de venta · S/ por {extra.pricing.basis === "unit" ? "unidad" : extra.pricing.basis === "linear-meter" ? "metro" : "m²"}</span><input type="number" min={0} max={100000} step={0.01} required value={Number.isNaN(extra.pricing.amount) ? "" : extra.pricing.amount} onChange={event => edit(extra.id, { ...extra, pricing: { ...extra.pricing, amount: numberValue(event.target.value) } })} /><small>Precio final del complemento; no se vuelve a aplicar el margen.</small></label>
            <label className="admin-field"><span>Cantidad máxima por mueble</span><input type="number" min={1} max={100} step={1} required value={Number.isNaN(extra.maxQuantity) ? "" : extra.maxQuantity} onChange={event => edit(extra.id, { ...extra, maxQuantity: numberValue(event.target.value) })} /><small>El cliente puede elegir cuántas unidades o tramos iguales necesita.</small></label>
            {extra.pricing.basis === "linear-meter" && <label className="admin-field"><span>Medida que determina cada tramo</span><select value={extra.pricing.dimension} onChange={event => edit(extra.id, { ...extra, pricing: { basis: "linear-meter", amount: extra.pricing.amount, dimension: event.target.value as "width" | "height" | "depth" } })}><option value="width">Ancho del mueble</option><option value="height">Alto del mueble</option><option value="depth">Fondo del mueble</option></select><small>Metros = medida en mm ÷ 1000 × cantidad.</small></label>}
            {extra.pricing.basis === "square-meter" && <label className="admin-field"><span>Superficie de cada unidad</span><select value={extra.pricing.plane} onChange={event => edit(extra.id, { ...extra, pricing: { basis: "square-meter", amount: extra.pricing.amount, plane: event.target.value as "front" | "side" | "top" } })}><option value="front">Frente · ancho × alto</option><option value="side">Lateral · fondo × alto</option><option value="top">Tapa · ancho × fondo</option></select><small>Superficie exterior completa; no descuenta huecos ni calcula recortes.</small></label>}
            <label className="admin-field admin-field-wide"><span>Descripción para el cliente</span><textarea rows={2} maxLength={180} value={extra.description ?? ""} placeholder="Indica qué incluye y dónde se aplica." onChange={event => edit(extra.id, { ...extra, description: event.target.value })} /></label>
          </div>
          <div className="admin-extra-actions">
            <label><input type="checkbox" checked={extra.active} onChange={event => edit(extra.id, { ...extra, active: event.target.checked })} /> Ofrecer al cliente</label>
            <label><input type="checkbox" disabled={!extra.active} checked={!!selected} onChange={event => update(extras, event.target.checked ? [...selections, { id: extra.id, quantity: 1 }] : selections.filter(selection => selection.id !== extra.id))} /> Seleccionado inicialmente</label>
            {selected && <label>Cantidad inicial <input className="admin-extra-default-count" type="number" min={1} max={extra.maxQuantity} step={1} value={Number.isNaN(selected.quantity) ? "" : selected.quantity} onChange={event => update(extras, selections.map(selection => selection.id === extra.id ? { ...selection, quantity: numberValue(event.target.value) } : selection))} /></label>}
            <button type="button" className="admin-extra-remove" onClick={() => update(extras.filter(item => item.id !== extra.id))} aria-label={`Quitar parámetro ${extra.name}`}><Trash2 size={15} /> Quitar</button>
          </div>
          <small className="admin-help">Código estable: {extra.id}. Se suma al presupuesto; no crea ni coloca una pieza en el modelo 3D.</small>
        </fieldset>;
      })}
    </div>
    {!!extras.length && <p className="admin-help">Máximo 20 parámetros por modelo. Guarda el mueble para publicarlos. Los diseños ya guardados conservan sus opciones y precios originales.</p>}
  </div>;
}

