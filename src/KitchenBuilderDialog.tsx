import { useMemo, useState } from "react";
import { ArrowRight, Check, Plus, X } from "lucide-react";
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
import { fitKitchenSlotProduct } from "./kitchen-placement";
import { DoorLayoutSelector, FrontIcon, FrontSelector } from "./FrontSelector";
import { MaterialDetails, MaterialSwatch } from "./MaterialSwatch";
import { materialBrands, materialLabel } from "./materials";

export function KitchenBuilderDialog({
  space,
  products,
  settings,
  onClose,
  onAdd,
}: {
  space: KitchenSlot;
  products: PublicProduct[];
  settings: PublicSettings;
  onClose: () => void;
  onAdd: (product: PublicProduct, config: Config) => void;
}) {
  const candidates = useMemo(
    () =>
      products.flatMap((product) => {
        const config = fitKitchenSlotProduct(product, space);
        return config ? [{ product, config }] : [];
      }),
    [products, space],
  );
  const [selectedId, setSelectedId] = useState(candidates[0]?.product.id ?? "");
  const [config, setConfig] = useState<Config | undefined>(
    candidates[0]?.config,
  );
  const [error, setError] = useState("");
  const [brand, setBrand] = useState("all");
  const selected = candidates.find(
    (candidate) => candidate.product.id === selectedId,
  )?.product;
  const finishes = settings.materials.filter(
    (material) =>
      material.active && (brand === "all" || material.brand === brand),
  );
  const update = (next: Config) => {
    if (!selected) return;
    const fitted = fitKitchenSlotProduct(
      { ...selected, defaults: next },
      space,
    );
    if (!fitted) {
      setError(
        "Esta combinación necesita otro tamaño de espacio. Prueba otra distribución o material de puertas.",
      );
      return;
    }
    setConfig(fitted);
    setError("");
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent showCloseButton={false} className="kitchen-build-dialog">
        <DialogClose
          className="kitchen-build-close"
          aria-label="Cerrar selección de módulo"
        >
          <X size={20} />
        </DialogClose>
        <DialogHeader>
          <p className="eyebrow">
            CONSTRUYE TU COCINA / PARED {space.wall.toUpperCase()}
          </p>
          <DialogTitle>
            {space.replaceId
              ? "Dale vida a este espacio."
              : "Añade la siguiente pieza."}
          </DialogTitle>
          <DialogDescription>
            {space.row === "wall" ? "Alacena" : "Mueble bajo"} · hasta{" "}
            {space.widthAvailable / 10} cm de ancho. Elige un modelo, sus
            puertas y su color.
          </DialogDescription>
        </DialogHeader>
        <div className="kitchen-build-body">
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
                    setSelectedId(product.id);
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
                  <FrontIcon
                    kind={
                      fitted.doors === "none"
                        ? "none"
                        : (fitted.front ?? "melamine")
                    }
                  />
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
          {selected && config && (
            <section className="kitchen-build-details">
              <h3>2. Tu estilo</h3>
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
            </section>
          )}
        </div>
        <div className="kitchen-build-footer">
          {config && (
            <p>
              {config.width / 10} cm de ancho · {config.modules}{" "}
              {config.modules === 1 ? "columna" : "columnas"}
              {space.replaceId && space.widthAvailable > config.width
                ? ` · quedan ${(space.widthAvailable - config.width) / 10} cm libres`
                : ""}
            </p>
          )}
          {error && (
            <p role="alert" className="kitchen-build-error">
              {error}
            </p>
          )}
          <button
            className="button"
            disabled={!selected || !config}
            onClick={() => {
              if (!selected || !config) return;
              try {
                onAdd(selected, config);
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Revisa el espacio e inténtalo de nuevo.",
                );
              }
            }}
          >
            <Plus size={17} /> Añadir este módulo <ArrowRight size={17} />
          </button>
          <small>El precio de tu cocina se actualiza al añadirlo.</small>
        </div>
      </DialogContent>
    </Dialog>
  );
}
