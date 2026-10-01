import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, Download, Loader2, RefreshCw } from "lucide-react";
import { api, download } from "../lib/api";
import { money, type Config, type Result } from "../lib/furniture";
import type { KitchenPlan } from "../lib/kitchen";
import { kitchenCutCSV, kitchenReferenceId } from "./kitchen-admin-export";

export type KitchenCutSnapshot = {
  source: "saved" | "current";
  kitchen: {
    id: string;
    name: string;
    version: number;
    created_at: string;
  } | null;
  plan: KitchenPlan;
  price: number;
  modules: {
    itemId: string;
    product: { id: string; name: string };
    config: Config;
    result: Result;
  }[];
  warning: string;
};
type Summary = { id: string; name: string; version: number; created: string };

export function KitchenAdmin() {
  const [kitchens, setKitchens] = useState<Summary[]>([]);
  const [reference, setReference] = useState("");
  const [snapshot, setSnapshot] = useState<KitchenCutSnapshot>();
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  async function refresh() {
    setLoading(true);
    setListError("");
    try {
      const data = await api<{ kitchens: Summary[] }>("action=admin-kitchens");
      setKitchens(data.kitchens);
    } catch (cause) {
      setListError(
        cause instanceof Error
          ? cause.message
          : "No se pudieron cargar las cocinas.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function inspect(value: string) {
    if (busy) return;
    setBusy(true);
    setSnapshot(undefined);
    setError("");
    try {
      const kitchenId = kitchenReferenceId(value);
      setSnapshot(
        await api<KitchenCutSnapshot>("", {
          op: "kitchen-cut-list",
          kitchenId,
        }),
      );
      setReference(kitchenId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo consultar la cocina.",
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void inspect(reference);
  }
  return (
    <section className="admin-panel admin-kitchens">
      <div className="admin-panel-heading">
        <div>
          <h2>Cocinas completas</h2>
          <p>Consulta distribuciones guardadas y su despiece por módulo.</p>
        </div>
        <a
          className="button outline"
          href="/cocinas"
          target="_blank"
          rel="noopener noreferrer"
        >
          Planificar cocina <ArrowUpRight size={17} />
        </a>
      </div>
      <p className="admin-help">
        Los modelos, medidas y frentes permitidos se editan en Catálogo. Las
        tarifas de vidrio, aluminio y herrajes están en Ajustes del taller. Las
        cocinas ya guardadas conservan sus medidas y precios originales.
      </p>
      <form onSubmit={submit} className="admin-kitchen-reference">
        <label>
          Enlace o identificador de cocina
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Pega el enlace que te envió el cliente"
            required
            disabled={busy}
          />
        </label>
        <button className="button rust" disabled={busy}>
          {busy ? <Loader2 className="spin" size={17} /> : null} Consultar
          despiece
        </button>
      </form>
      {error && (
        <p className="admin-message is-error" role="alert">
          {error}
        </p>
      )}
      <div className="admin-kitchen-list-heading">
        <h3>Últimas cocinas guardadas</h3>
        <button
          type="button"
          className="button outline"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw size={15} /> Actualizar
        </button>
      </div>
      {listError && (
        <p className="admin-message is-error" role="alert">
          {listError}
        </p>
      )}
      {loading ? (
        <p role="status">Cargando cocinas…</p>
      ) : !kitchens.length && !listError ? (
        <p className="admin-help">
          Las cocinas aparecerán aquí cuando alguien guarde su distribución.
        </p>
      ) : null}
      {!!kitchens.length && (
        <div className="admin-kitchen-list">
          {kitchens.map((kitchen) => (
            <button
              type="button"
              key={kitchen.id}
              onClick={() => void inspect(kitchen.id)}
              disabled={busy}
              className={snapshot?.kitchen?.id === kitchen.id ? "selected" : ""}
            >
              <strong>{kitchen.name}</strong>
              <span>
                {new Date(kitchen.created).toLocaleDateString("es-PE")} ·
                versión {kitchen.version}
              </span>
            </button>
          ))}
        </div>
      )}
      {snapshot && (
        <div className="admin-cut-result">
          <div className="admin-cut-heading">
            <div>
              <h3>{snapshot.kitchen?.name ?? "Cocina"}</h3>
              <p>
                {snapshot.plan.layout === "l"
                  ? "Distribución en L"
                  : "Distribución lineal"}{" "}
                · {snapshot.modules.length} módulos · {money(snapshot.price)}
              </p>
            </div>
            <div className="admin-kitchen-export-actions">
              {snapshot.kitchen && (
                <a
                  className="button outline"
                  href={`/cocinas?cocina=${snapshot.kitchen.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ver distribución <ArrowUpRight size={16} />
                </a>
              )}
              <button
                type="button"
                className="button outline"
                onClick={() =>
                  download(
                    `${snapshot.kitchen?.id ?? "cocina"}-despiece.csv`,
                    kitchenCutCSV(snapshot.modules),
                    "text/csv;charset=utf-8",
                  )
                }
              >
                <Download size={16} /> Despiece CSV
              </button>
            </div>
          </div>
          <p className="admin-editor-note">
            <strong>Despiece preliminar. No autorizado para producción.</strong>
            <br />
            {snapshot.warning} Los espacios para equipos no incluyen
            electrodomésticos, lavadero ni encimera.
          </p>
          {snapshot.modules.map((module, index) => (
            <details
              className="admin-kitchen-module"
              key={module.itemId}
              open={snapshot.modules.length === 1}
            >
              <summary>
                <strong>
                  {index + 1}. {module.product.name}
                </strong>
                <span>
                  {module.config.width} × {module.config.height} ×{" "}
                  {module.config.depth} mm · {module.result.panels.length}{" "}
                  piezas
                </span>
              </summary>
              <p className="admin-help">
                Módulo {module.itemId} · {money(module.result.price)} ·{" "}
                {module.result.area.toFixed(2)} m² de melamina ·{" "}
                {module.result.edges.toFixed(2)} m de tapacanto
              </p>
              <div className="admin-kitchen-table-scroll">
                <table className="admin-kitchen-table">
                  <thead>
                    <tr>
                      <th>Pieza de melamina</th>
                      <th>Largo/alto</th>
                      <th>Ancho</th>
                      <th>Espesor</th>
                      <th>Acabado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {module.result.panels.map((panel) => (
                      <tr key={panel.id}>
                        <td>{panel.name}</td>
                        <td>{panel.length} mm</td>
                        <td>{panel.width} mm</td>
                        <td>18 mm</td>
                        <td>{panel.materialName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!!module.result.fixtures?.filter(
                (fixture) => fixture.kind === "front-door",
              ).length && (
                <div className="admin-kitchen-glass">
                  <h4>Vidrio y perfiles, separados de la melamina</h4>
                  {module.result.fixtures
                    .filter((fixture) => fixture.kind === "front-door")
                    .map((front) => (
                      <p key={front.id}>
                        {front.name}: vidrio {front.glassWidth} ×{" "}
                        {front.glassHeight} × {front.glassThickness} mm
                        {front.frameMeters > 0
                          ? ` · ${front.frameMeters.toFixed(2)} m de perfil`
                          : ""}
                      </p>
                    ))}
                </div>
              )}
              <h4>Accesorios</h4>
              <ul className="admin-kitchen-accessories">
                {module.result.accessories.map((accessory, i) => (
                  <li key={i}>
                    {accessory.name}: {Number(accessory.quantity.toFixed(3))}{" "}
                    {accessory.unit ?? "ud"}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
