import { money, type Result } from "../lib/furniture";
import "./product-extras.css";

export function AdminExtrasSummary({ extras }: { extras?: Result["extras"] }) {
  if (!extras?.length) return null;
  return <section className="admin-extras-summary">
    <h4>Complementos cotizados</h4>
    <p>Tarifas de venta de esta versión. No son piezas de corte.</p>
    <ul>{extras.map(extra => {
      const unit = extra.basis === "unit" ? "ud" : extra.basis === "linear-meter" ? "m" : "m²";
      const measured = (extra.measurement * extra.quantity).toLocaleString("es-PE", { maximumFractionDigits: 3 });
      return <li key={extra.id}><div><strong>{extra.name}</strong><span>{measured} {unit} × {money(extra.unitPrice)} / {unit}{extra.basis !== "unit" ? ` · ${extra.quantity} tramo(s) o superficie(s)` : ""}</span></div><b>{money(extra.amount)}</b></li>;
    })}</ul>
  </section>;
}
