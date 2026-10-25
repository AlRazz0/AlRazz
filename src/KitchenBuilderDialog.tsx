import { useMemo, useState } from "react";
import { ArrowRight, Check, Loader2, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  getConstructionOptions,
  getFrontOptions,
  type Config,
} from "../lib/furniture";
import type { PublicProduct, PublicSettings } from "./types";
import type { KitchenSlot } from "./kitchen-slots";
import { fitKitchenSlotProduct, kitchenConfigIssue, kitchenDimensionLimits } from "./kitchen-placement";
import { DoorLayoutSelector, FrontSelector } from "./FrontSelector";
import { KitchenDimensionInput } from "./KitchenDimensionInput";
import { KitchenModelPreview } from "./KitchenModelPreview";
import { ExtraSelector } from "./ExtraSelector";
import { MaterialDetails, MaterialSwatch } from "./MaterialSwatch";
import { materialBrands, materialLabel } from "./materials";

export function KitchenBuilderDialog({
  space,
  products,
  settings,
  onClose,
  onAdd,
  initialProductId = "",
  initialConfig,
}: {
  space: KitchenSlot;
  products: PublicProduct[];
  settings: PublicSettings;
  onClose: () => void;
  onAdd: (product: PublicProduct, config: Config) => void | Promise<void>;
  initialProductId?: string;
  initialConfig?: Config;
}) {
  const candidates = useMemo(
    () =>
      products.flatMap((product) => {
        const config = fitKitchenSlotProduct(product, space);
        return config ? [{ product, config }] : [];
      }),
    [products, space],
  );
  const initial = candidates.find(candidate => candidate.product.id === initialProductId) ?? candidates[0];
  const [selectedId, setSelectedId] = useState(initial?.product.id ?? "");
  const [config, setConfig] = useState<Config | undefined>(
    initial && initialConfig && initial.product.id === initialProductId && !kitchenConfigIssue(initial.product, initialConfig, space)
      ? structuredClone(initialConfig) : initial?.config,
  );
  const [visualConfig, setVisualConfig] = useState<Config>();
  const [measureReset, setMeasureReset] = useState(0);
  const [error, setError] = useState("");
  const [invalidMeasures, setInvalidMeasures] = useState<string[]>([]);
  const [brand, setBrand] = useState("all");
  const [submitting, setSubmitting] = useState(false);
  const selected = candidates.find(
    (candidate) => candidate.product.id === selectedId,
  )?.product;
  const finishes = settings.materials.filter(
    (material) =>
      material.active && (brand === "all" || material.brand === brand),
  );
  const update = (next: Config) => {
    if (!selected) return;
    setConfig(next);
    setVisualConfig(undefined);
    setError("");
  };
  const effectiveConfig = visualConfig ?? config;
  const issue = selected && effectiveConfig ? kitchenConfigIssue(selected, effectiveConfig, space) : "";
  const limits = selected ? kitchenDimensionLimits(selected, space) : undefined;
  const replacingFurniture = space.replaceKind === "furniture";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
    >
      <DialogContent showCloseButton={false} className="kitchen-build-dialog">
        <DialogClose
          className="kitchen-build-close"
          aria-label="Cerrar selección de módulo"
          disabled={submitting}
        >
          <X size={20} />
        </DialogClose>
        <DialogHeader>
          <p className="eyebrow">
            CONSTRUYE TU COCINA / PARED {space.wall.toUpperCase()}
          </p>
          <DialogTitle>
            {replacingFurniture ? "Otra pieza, tu mismo espacio." : space.replaceId
              ? "Dale vida a este espacio."
              : "Añade la siguiente pieza."}
          </DialogTitle>
          <DialogDescription>
            {space.row === "wall" ? "Alacena" : space.row === "tall" ? "Columna alta" : "Mueble bajo"} · hasta{" "}
            {space.widthAvailable / 10} cm de ancho. Elige un modelo, sus
            puertas y su color.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="kitchen-build-body" disabled={submitting} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <section className="kitchen-build-models">
            <h3>1. El diseño</h3>
            <div className="kitchen-build-candidates">
              {candidates.map(({ product, config: fitted }) => (
                <button
                  type="button"
                  key={product.id}
                  className={selectedId === product.id ? "selected" : ""}
                  aria-pressed={selectedId === product.id}
                  onClick={() => {
                    setMeasureReset(value => value + 1);
                    setSelectedId(product.id);
                    setInvalidMeasures([]);
                    setVisualConfig(undefined);
                    setConfig({
                      ...fitted,
                      ...(config &&
                      settings.materials.some(
                        (material) =>
                          material.active && material.id === config.finish,
                      )
                        ? { finish: config.finish }
                        : {}),
                    });
                    setError("");
                  }}
                >
                  <KitchenModelPreview product={product} config={fitted}
                    color={settings.materials.find(material => material.id === fitted.finish)?.color} />
                  <strong>{product.name}</strong>
                  <small>
                    {fitted.width / 10} × {fitted.height / 10} ×{" "}
                    {fitted.depth / 10} cm
                  </small>
                  {selectedId === product.id && (
                    <Check size={14} className="kitchen-candidate-check" />
                  )}
                </button>
              ))}
            </div>
            {!candidates.length && (
              <p className="kitchen-help">
                Ningún modelo publicado cabe con estas medidas. Amplía el
                espacio desde sus parámetros o elige otro botón +.
              </p>
            )}
          </section>
          {selected && config && effectiveConfig && (
            <section className="kitchen-build-details">
              <h3>2. Sus medidas y distribución</h3>
              <div className="kitchen-build-selected-preview">
                <KitchenModelPreview product={selected} config={effectiveConfig}
                  color={settings.materials.find(material => material.id === effectiveConfig.finish)?.color} />
                <p>Vista esquemática inmediata. La cocina completa se comprueba al confirmar.</p>
              </div>
              {limits && <div className="kitchen-measures three">
                {(["width", "height", "depth"] as const).map(key => <KitchenDimensionInput
                  key={`${selected.id}-${key}`} label={{ width: "Ancho", height: "Alto", depth: "Fondo" }[key]}
                  slider
                  resetKey={measureReset}
                  disabled={submitting}
                  value={config[key]} min={limits[key].min} max={limits[key].max}
                  onCommit={value => update({ ...config, [key]: value })}
                  onPreview={(value, dirty) => {
                    if (!dirty) { setVisualConfig(undefined); return; }
                    // Incomplete or invalid typing keeps the last valid schematic.
                    if (value === null) return;
                    setVisualConfig({ ...config, [key]: value });
                    setError("");
                  }}
                  onValidityChange={valid => setInvalidMeasures(previous => valid ? previous.filter(field => field !== key) : [...new Set([...previous, key])])} />)}
              </div>}
              <p className="kitchen-help">Escribe la medida exacta y pulsa Enter o sal del campo. El rango depende del modelo y del espacio disponible.</p>
              <div className="kitchen-measures">
                <label>Columnas<select value={config.modules} onChange={event => update({ ...config, modules: Number(event.target.value) })}>
                  {getConstructionOptions(selected, config).modules.map(value => <option key={value}>{value}</option>)}
                </select></label>
                <label>Repisas por columna<select value={config.shelves} onChange={event => update({ ...config, shelves: Number(event.target.value) })}>
                  {getConstructionOptions(selected, config).shelves.map(value => <option key={value}>{value}</option>)}
                </select></label>
              </div>
              <h3>3. Puertas y acabado</h3>
              <DoorLayoutSelector
                value={config.doors}
                options={getConstructionOptions(selected, config).doors}
                onChange={(doors) => {
                  const front =
                    doors === "none"
                      ? "melamine"
                      : getFrontOptions(selected).includes(
                            config.front ?? "melamine",
                          )
                        ? config.front
                        : getFrontOptions(selected)[0];
                  update({
                    ...config,
                    doors,
                    front,
                    ...(front && front !== "melamine"
                      ? { handle: "exterior" as const }
                      : {}),
                  });
                }}
              />
              {config.doors !== "none" && (
                <FrontSelector
                  value={config.front}
                  options={getFrontOptions(selected)}
                  onChange={(front) =>
                    update({
                      ...config,
                      front,
                      ...(front !== "melamine"
                        ? { handle: "exterior" as const }
                        : {}),
                    })
                  }
                />
              )}
              <label className="kitchen-name">
                Marca del tablero
                <select
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                >
                  <option value="all">Todas las marcas</option>
                  {materialBrands(
                    settings.materials.filter((material) => material.active),
                  ).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <div className="kitchen-finish-strip">
                {finishes.map((material) => (
                  <button
                    type="button"
                    key={material.id}
                    aria-label={materialLabel(material)}
                    title={materialLabel(material)}
                    aria-pressed={config.finish === material.id}
                    onClick={() => update({ ...config, finish: material.id })}
                  >
                    <MaterialSwatch material={material} />
                  </button>
                ))}
              </div>
              <MaterialDetails
                material={settings.materials.find(
                  (material) => material.id === config.finish,
                )}
                label="Melamina del módulo"
              />
              <ExtraSelector product={selected} config={config} onChange={update} />
            </section>
          )}
        </fieldset>
        <div className="kitchen-build-footer">
          {effectiveConfig && (
            <p>
              {effectiveConfig.width / 10} cm de ancho · {effectiveConfig.modules}{" "}
              {effectiveConfig.modules === 1 ? "columna" : "columnas"}
              {space.replaceId && space.widthAvailable > effectiveConfig.width
                ? ` · quedan ${(space.widthAvailable - effectiveConfig.width) / 10} cm libres`
                : ""}
            </p>
          )}
          {(error || issue) && (
            <p role="alert" className="kitchen-build-error">
              {error || issue}
            </p>
          )}
          <button
            className="button"
            disabled={submitting || !selected || !effectiveConfig || !!issue || invalidMeasures.length > 0}
            aria-busy={submitting}
            onClick={async () => {
              if (!selected || !effectiveConfig) return;
              setSubmitting(true); setError("");
              try {
                await onAdd(selected, effectiveConfig);
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Revisa el espacio e inténtalo de nuevo.",
                );
              } finally { setSubmitting(false); }
            }}
          >
            {submitting ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} />} {submitting ? "Comprobando encaje…" : replacingFurniture ? "Sustituir este módulo" : "Añadir este módulo"} <ArrowRight size={17} />
          </button>
          <small>Comprobamos el encaje y el precio en el servidor antes de incorporarlo. Si no encaja, tu distribución se conserva.</small>
        </div>
      </DialogContent>
    </Dialog>
  );
}
