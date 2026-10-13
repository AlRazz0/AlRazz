import { useEffect, useId, useState } from "react";
import { Layers3, Ruler } from "lucide-react";
import type { Config } from "../lib/furniture";
import type { PublicProduct } from "./types";
import "./product-extras.css";

type Extra = NonNullable<PublicProduct["extras"]>[number];
const dimensions = { width: "ancho", height: "alto", depth: "fondo" };
const planes = { front: "ancho × alto", side: "fondo × alto", top: "ancho × fondo" };
const format = (value: number) => value.toLocaleString("es-PE", { maximumFractionDigits: 3 });
function measure(extra: Extra, config: Config, quantity: number) {
  if (extra.pricing.basis === "unit") return `${quantity} ${quantity === 1 ? "unidad" : "unidades"}`;
  if (extra.pricing.basis === "linear-meter") return `${format(config[extra.pricing.dimension] / 1000 * quantity)} m · ${dimensions[extra.pricing.dimension]} × cantidad`;
  const area = extra.pricing.plane === "front" ? config.width * config.height : extra.pricing.plane === "side" ? config.depth * config.height : config.width * config.depth;
  return `${format(area / 1e6 * quantity)} m² · ${planes[extra.pricing.plane]} × cantidad`;
}
function Quantity({ value, maximum, name, onChange }: { value: number; maximum: number; name: string; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState("");
  const id = useId();
  useEffect(() => { setDraft(String(value)); setError(""); }, [value]);
  function commit() {
    const next = Number(draft);
    if (!Number.isInteger(next) || next < 1 || next > maximum) {
      setError(`Usa una cantidad entera entre 1 y ${maximum}. Se conserva ${value}.`);
      setDraft(String(value));
      return;
    }
    setError(""); onChange(next);
  }
  return <div className="extra-quantity"><label>Cantidad <input type="number" value={draft} min={1} max={maximum} step={1} aria-label={`Cantidad de ${name}`} aria-describedby={error ? id : undefined} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commit(); } }} /></label>{error && <small id={id} role="status">{error}</small>}</div>;
}

export function ExtraSelector({ product, config, onChange }: {
  product: Pick<PublicProduct, "extras">;
  config: Config;
  onChange: (value: Config) => void;
}) {
  const extras = (product.extras ?? []).filter(extra => extra.active);
  const selected = config.extras ?? [];
  const missing = selected.filter(selection => !extras.some(extra => extra.id === selection.id));
  if (!extras.length && !missing.length) return null;
  function select(id: string, quantity?: number) {
    const next = selected.filter(selection => selection.id !== id);
    if (quantity !== undefined) next.push({ id, quantity });
    const value = { ...config };
    if (next.length) value.extras = next;
    else delete value.extras;
    onChange(value);
  }
  return <section className="extra-selector" aria-label="Acabados y complementos opcionales">
    <h3><Layers3 size={17} /> Acabados y complementos</h3>
    <p>Elige las opciones disponibles para este modelo. El presupuesto se actualiza según tus medidas.</p>
    {extras.map(extra => {
      const selection = selected.find(item => item.id === extra.id);
      return <div className={`extra-option${selection ? " selected" : ""}`} key={extra.id}>
        <label className="extra-choice"><input type="checkbox" checked={!!selection} onChange={event => select(extra.id, event.target.checked ? 1 : undefined)} /><span><strong>{extra.name}</strong>{extra.description && <small>{extra.description}</small>}</span></label>
        <small className="extra-basis"><Ruler size={13} /> {selection ? measure(extra, config, selection.quantity) : extra.pricing.basis === "unit" ? "Por unidad" : extra.pricing.basis === "linear-meter" ? `Por metro de ${dimensions[extra.pricing.dimension]}` : `Por m² de ${planes[extra.pricing.plane]}`}</small>
        {selection && extra.maxQuantity > 1 && <Quantity value={selection.quantity} maximum={extra.maxQuantity} name={extra.name} onChange={quantity => select(extra.id, quantity)} />}
      </div>;
    })}
    {!!missing.length && <div className="extra-unavailable" role="status">Hay opciones de una versión anterior que ya no están disponibles. <button type="button" onClick={() => { const next = { ...config, extras: selected.filter(selection => extras.some(extra => extra.id === selection.id)) }; if (!next.extras.length) delete (next as Config).extras; onChange(next); }}>Quitar opciones no disponibles</button></div>}
    <small className="extra-note">Estos complementos se cotizan; su ubicación o forma no se representa en el 3D.</small>
  </section>;
}
