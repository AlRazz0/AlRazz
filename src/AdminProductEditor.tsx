import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Box, Eye, LockKeyhole, Ruler } from "lucide-react";
import { Switch } from "../components/ui/switch";
import {
  getConstruction,
  getConstructionOptions,
  money,
  productCategories,
  type Config,
  type Construction,
  type Product,
  type Settings,
} from "../lib/furniture";
import {
  constructionTemplates,
  productTemplate,
} from "../lib/product-templates";
import { buildAdminPreview, productEditorError } from "./admin-product-preview";
import {
  constructionDescriptions,
  constructionLabels,
} from "./construction-labels";
import { MaterialSource, MaterialSwatch } from "./MaterialSwatch";
import { materialLabel } from "./materials";
import Viewer, { type View } from "./Viewer";
import "./admin-model-editor.css";

const dimensions = [
  { key: "width", name: "Ancho" },
  { key: "height", name: "Alto" },
  { key: "depth", name: "Fondo" },
] as const;
const sections = [
  { id: "general", name: "General" },
  { id: "dimensions", name: "Medidas y distribución" },
  { id: "finishes", name: "Acabados" },
  { id: "gallery", name: "Imagen y galería" },
  { id: "publication", name: "Publicación" },
];
const numericValue = (value: string) =>
  value === "" ? Number.NaN : Number(value);

function Field({
  title,
  note,
  children,
  wide = false,
}: {
  title: string;
  note?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`admin-field${wide ? " admin-field-wide" : ""}`}>
      <span>{title}</span>
      {children}
      {note && <small>{note}</small>}
    </label>
  );
}

function NumberField({
  title,
  value,
  change,
  min = 0,
  max,
  step = 1,
  note,
}: {
  title: string;
  value: number;
  change: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  note?: string;
}) {
  return (
    <Field title={title} note={note}>
      <input
        type="number"
        value={Number.isNaN(value) ? "" : value}
        min={min}
        max={max}
        step={step}
        required
        onChange={(event) => change(numericValue(event.target.value))}
      />
    </Field>
  );
}

export function AdminProductEditor({
  value,
  settings,
  isNew,
  settingsDirty,
  change,
}: {
  value: Product;
  settings: Settings;
  isNew: boolean;
  settingsDirty: boolean;
  change: (value: Product) => void;
}) {
  const prefix = useId();
  const [view, setView] = useState<View>("iso");
  const [openDoors, setOpenDoors] = useState(false);
  const [showDimensions, setShowDimensions] = useState(true);
  // Resolve only the kind here: an empty numeric draft must remain editable.
  const base = getConstruction({
    construction: value.construction
      ? { kind: value.construction.kind }
      : undefined,
  });
  const construction = { ...base, ...value.construction } as ReturnType<
    typeof getConstruction
  >;
  const options = {
    ...getConstructionOptions(
      {
        construction:
          construction.kind === "wardrobe"
            ? {
                kind: "wardrobe",
                hangingModules: Number.isFinite(construction.hangingModules)
                  ? construction.hangingModules
                  : 1,
              }
            : { kind: construction.kind },
      },
      value.defaults,
    ),
    modules: getConstructionOptions({ construction: base }).modules,
  };
  const setProduct = <K extends keyof Product>(key: K, next: Product[K]) =>
    change({ ...value, [key]: next });
  const setConfig = <K extends keyof Config>(key: K, next: Config[K]) =>
    change({ ...value, defaults: { ...value.defaults, [key]: next } });
  const preview = useMemo(() => {
    try {
      return { valid: buildAdminPreview(value, settings), error: "" };
    } catch (cause) {
      return { valid: null, error: productEditorError(cause) };
    }
  }, [
    value.construction,
    value.defaults,
    value.limits,
    value.basePrice,
    value.category,
    settings,
  ]);
  const [lastValid, setLastValid] = useState(preview.valid);
  useEffect(() => {
    if (preview.valid) setLastValid(preview.valid);
  }, [preview.valid]);
  const shown = preview.valid ?? lastValid;
  const exterior = settings.materials.find(
    (material) => material.id === value.defaults.finish,
  );
  const interior =
    value.defaults.interior === "same"
      ? exterior
      : settings.materials.find(
          (material) => material.id === value.defaults.interior,
        );
  const sectionId = (name: string) => `${prefix}-${name}`;
  const goTo = (name: string) => {
    const heading = document.getElementById(sectionId(name));
    heading?.scrollIntoView({ block: "start", behavior: "instant" });
    heading?.focus({ preventScroll: true });
  };
  function changeConstruction(kind: Construction["kind"]) {
    const template = productTemplate(kind);
    change({
      ...value,
      construction: template.construction,
      limits: structuredClone(template.limits),
      defaults: {
        ...value.defaults,
        width: template.defaults.width,
        height: template.defaults.height,
        depth: template.defaults.depth,
        modules: template.defaults.modules,
        shelves: template.defaults.shelves,
        doors: template.defaults.doors,
      },
    });
  }
  function changeModules(modules: number) {
    if (construction.kind !== "wardrobe") return setConfig("modules", modules);
    const hangingModules = Math.min(
      Number.isFinite(construction.hangingModules)
        ? construction.hangingModules
        : 1,
      modules,
    );
    change({
      ...value,
      construction: { ...construction, hangingModules },
      defaults: {
        ...value.defaults,
        modules,
        shelves: hangingModules === modules ? 0 : value.defaults.shelves,
      },
    });
  }
  function changeHangingModules(hangingModules: number) {
    if (construction.kind !== "wardrobe") return;
    change({
      ...value,
      construction: { ...construction, hangingModules },
      defaults: {
        ...value.defaults,
        shelves:
          hangingModules === value.defaults.modules
            ? 0
            : value.defaults.shelves,
      },
    });
  }

  return (
    <>
      <nav className="admin-editor-nav" aria-label="Secciones del editor">
        {sections.map((section, index) => (
          <button
            key={section.id}
            type="button"
            onClick={() => goTo(section.id)}
          >
            <span>{index + 1}</span>
            {section.name}
          </button>
        ))}
      </nav>
      <div className="admin-model-layout">
        <div className="admin-model-fields">
          <section
            className="admin-model-section"
            aria-labelledby={sectionId("general")}
          >
            <h3 id={sectionId("general")} tabIndex={-1}>
              General
            </h3>
            <p className="admin-section-intro">
              La identidad y la descripción que tus clientes verán en el
              catálogo.
            </p>
            <div className="admin-form-grid">
              <Field title="Nombre del mueble">
                <input
                  value={value.name}
                  onChange={(event) => setProduct("name", event.target.value)}
                  minLength={2}
                  maxLength={70}
                  required
                  placeholder="Ej. Ropero de dos cuerpos"
                />
              </Field>
              <Field
                title="Identificador único"
                note={
                  isNew
                    ? "Minúsculas, números y guiones. Ej. ropero-dos-cuerpos"
                    : "Permanente: conecta el modelo con sus diseños guardados."
                }
              >
                <input
                  value={value.id}
                  onChange={(event) =>
                    setProduct("id", event.target.value.toLowerCase())
                  }
                  readOnly={!isNew}
                  pattern="[a-z0-9-]{2,60}"
                  required
                />
              </Field>
              <Field title="Categoría">
                <select
                  value={value.category}
                  onChange={(event) =>
                    setProduct(
                      "category",
                      event.target.value as Product["category"],
                    )
                  }
                >
                  {productCategories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </Field>
              <NumberField
                title="Fabricación · semanas"
                min={1}
                max={52}
                value={value.weeks}
                change={(next) => setProduct("weeks", next)}
              />
              <Field title="Descripción" wide>
                <textarea
                  rows={3}
                  minLength={5}
                  maxLength={350}
                  required
                  value={value.description}
                  onChange={(event) =>
                    setProduct("description", event.target.value)
                  }
                />
              </Field>
            </div>
          </section>

          <section
            className="admin-model-section"
            aria-labelledby={sectionId("dimensions")}
          >
            <h3 id={sectionId("dimensions")} tabIndex={-1}>
              Medidas y distribución
            </h3>
            <Field
              title="Tipo de construcción"
              note="Cambiar el tipo restablece las medidas, límites y distribución de su plantilla. El resto de los datos se conserva."
            >
              <select
                value={construction.kind}
                onChange={(event) =>
                  changeConstruction(event.target.value as Construction["kind"])
                }
              >
                {constructionTemplates.map((template) => (
                  <option
                    key={getConstruction(template).kind}
                    value={getConstruction(template).kind}
                  >
                    {constructionLabels[getConstruction(template).kind]}
                  </option>
                ))}
              </select>
            </Field>
            <p className="admin-section-intro">
              {constructionDescriptions[construction.kind]}
            </p>
            <p className="admin-help">
              Medidas en milímetros, de 10 en 10. La medida inicial debe quedar
              dentro de su rango. El espesor permanece en 18 mm.
            </p>
            <div className="admin-dimension-grid">
              <span />
              <span>Mínimo</span>
              <span>Inicial</span>
              <span>Máximo</span>
              {dimensions.map(({ key, name }) => (
                <div className="admin-dimension-row" key={key}>
                  <strong>{name}</strong>
                  {(["min", "initial", "max"] as const).map((position) => {
                    const current =
                      position === "initial"
                        ? value.defaults[key]
                        : value.limits[key][position];
                    return (
                      <input
                        key={position}
                        type="number"
                        aria-label={`${name} ${position === "initial" ? "inicial" : position === "min" ? "mínimo" : "máximo"} en mm`}
                        required
                        min={100}
                        max={3000}
                        step={10}
                        value={Number.isNaN(current) ? "" : current}
                        onChange={(event) =>
                          position === "initial"
                            ? setConfig(key, numericValue(event.target.value))
                            : setProduct("limits", {
                                ...value.limits,
                                [key]: {
                                  ...value.limits[key],
                                  [position]: numericValue(event.target.value),
                                },
                              })
                        }
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="admin-form-grid admin-construction-settings">
              {options.modules.length > 1 && (
                <Field title="Módulos verticales">
                  <select
                    value={value.defaults.modules}
                    onChange={(event) =>
                      changeModules(Number(event.target.value))
                    }
                  >
                    {options.modules.map((number) => (
                      <option key={number} value={number}>
                        {number}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {options.shelves.length > 1 && (
                <Field
                  title={
                    construction.kind === "desk-storage"
                      ? "Repisas en el módulo lateral"
                      : construction.kind === "wardrobe"
                        ? "Repisas por módulo sin colgado"
                        : "Repisas por módulo"
                  }
                >
                  <select
                    value={value.defaults.shelves}
                    onChange={(event) =>
                      setConfig("shelves", Number(event.target.value))
                    }
                  >
                    {options.shelves.map((number) => (
                      <option key={number} value={number}>
                        {number}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {options.doors.length > 1 && (
                <Field title="Puertas">
                  <select
                    value={value.defaults.doors}
                    onChange={(event) =>
                      setConfig("doors", event.target.value as Config["doors"])
                    }
                  >
                    {options.doors.map((doors) => (
                      <option key={doors} value={doors}>
                        {
                          {
                            none: "Sin puertas",
                            lower: "Puertas inferiores",
                            full: "Puertas completas",
                          }[doors]
                        }
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {construction.kind === "desk-storage" && (
                <>
                  <Field
                    title="Ubicación del módulo lateral"
                    note="Mirando el escritorio de frente."
                  >
                    <select
                      value={construction.storageSide}
                      onChange={(event) =>
                        setProduct("construction", {
                          ...construction,
                          storageSide: event.target.value as "left" | "right",
                        })
                      }
                    >
                      <option value="left">Izquierda</option>
                      <option value="right">Derecha</option>
                    </select>
                  </Field>
                  <NumberField
                    title="Ancho exterior del módulo · mm"
                    value={construction.storageWidth}
                    min={250}
                    max={650}
                    step={10}
                    change={(next) =>
                      setProduct("construction", {
                        ...construction,
                        storageWidth: next,
                      })
                    }
                    note="Incluye sus laterales de 18 mm."
                  />
                </>
              )}
              {construction.kind === "wardrobe" && (
                <>
                  <NumberField
                    title="Altura del altillo · mm"
                    value={construction.loftHeight}
                    min={200}
                    max={600}
                    step={10}
                    change={(next) =>
                      setProduct("construction", {
                        ...construction,
                        loftHeight: next,
                      })
                    }
                  />
                  <Field
                    title="Módulos para colgar"
                    note="Se cuentan desde la izquierda. Al reducir el número total de módulos, los de colgado se ajustan al espacio disponible."
                  >
                    <select
                      value={construction.hangingModules}
                      onChange={(event) =>
                        changeHangingModules(Number(event.target.value))
                      }
                    >
                      {Array.from(
                        { length: value.defaults.modules },
                        (_, index) => (
                          <option key={index + 1} value={index + 1}>
                            {index + 1}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                </>
              )}
              {construction.kind === "kitchen-base" && (
                <>
                  <NumberField
                    title="Altura del zócalo · mm"
                    value={construction.plinthHeight}
                    min={60}
                    max={180}
                    step={10}
                    change={(next) =>
                      setProduct("construction", {
                        ...construction,
                        plinthHeight: next,
                      })
                    }
                  />
                  <NumberField
                    title="Retiro frontal del zócalo · mm"
                    value={construction.plinthSetback}
                    min={30}
                    max={150}
                    step={10}
                    change={(next) =>
                      setProduct("construction", {
                        ...construction,
                        plinthSetback: next,
                      })
                    }
                    note="Distancia hacia dentro desde el frente del mueble."
                  />
                </>
              )}
            </div>
            {construction.kind === "wardrobe" &&
              construction.hangingModules === value.defaults.modules && (
                <p className="admin-help">
                  Todos los módulos llevan colgado. El altillo se conserva; las
                  repisas inferiores quedan en cero.
                </p>
              )}
          </section>

          <section
            className="admin-model-section"
            aria-labelledby={sectionId("finishes")}
          >
            <h3 id={sectionId("finishes")} tabIndex={-1}>
              Acabados
            </h3>
            <p className="admin-section-intro">
              Define el aspecto inicial. Los clientes podrán elegir entre los
              acabados activos.
            </p>
            <div className="admin-form-grid">
              <Field title="Acabado exterior">
                <select
                  value={value.defaults.finish}
                  onChange={(event) => setConfig("finish", event.target.value)}
                >
                  {settings.materials.map((material) => (
                    <option value={material.id} key={material.id}>
                      {materialLabel(material)}
                      {material.active ? "" : " · oculto"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field title="Acabado interior">
                <select
                  value={value.defaults.interior}
                  onChange={(event) =>
                    setConfig("interior", event.target.value)
                  }
                >
                  <option value="same">Igual al exterior</option>
                  {settings.materials.map((material) => (
                    <option value={material.id} key={material.id}>
                      {materialLabel(material)}
                      {material.active ? "" : " · oculto"}
                    </option>
                  ))}
                </select>
              </Field>
              {value.defaults.doors !== "none" && (
                <Field title="Sistema de apertura">
                  <select
                    value={value.defaults.handle}
                    onChange={(event) =>
                      setConfig(
                        "handle",
                        event.target.value as Config["handle"],
                      )
                    }
                  >
                    <option value="push">Push</option>
                    <option value="exterior">Jalador exterior</option>
                    <option value="embutido">Jalador embutido</option>
                  </select>
                </Field>
              )}
            </div>
            <div className="admin-editor-swatches">
              {[
                { name: "Exterior", material: exterior },
                { name: "Interior", material: interior },
              ].map(
                ({ name, material }) =>
                  material && (
                    <div key={name}>
                      <MaterialSwatch material={material} />
                      <div>
                        <small>{name}</small>
                        <strong>{materialLabel(material)}</strong>
                        <MaterialSource material={material} />
                      </div>
                    </div>
                  ),
              )}
            </div>
            <p className="admin-help">
              Los colores en pantalla son aproximados. Confirma la muestra
              física antes de fabricar.
            </p>
          </section>

          <section
            className="admin-model-section"
            aria-labelledby={sectionId("gallery")}
          >
            <h3 id={sectionId("gallery")} tabIndex={-1}>
              Imagen y galería
            </h3>
            <p className="admin-section-intro">
              La imagen ambientada se genera a partir de las medidas y acabados
              del modelo. Es una visualización, no una fotografía de un mueble
              fabricado.
            </p>
            <label className="admin-switch-label">
              <Switch
                checked={value.gallery?.enabled ?? true}
                onCheckedChange={(enabled) =>
                  setProduct("gallery", { ...value.gallery, enabled })
                }
              />
              Mostrar imagen ambientada en la galería
            </label>
            <div className="admin-form-grid admin-construction-settings">
              <Field title="Ambiente">
                <select
                  value={value.gallery?.scene ?? "warm"}
                  onChange={(event) =>
                    setProduct("gallery", {
                      ...value.gallery,
                      scene: event.target.value as "warm" | "light" | "dark",
                    })
                  }
                >
                  <option value="warm">Cálido</option>
                  <option value="light">Claro</option>
                  <option value="dark">Oscuro</option>
                </select>
              </Field>
              <Field
                title="Leyenda opcional"
                note="Acompaña la imagen del modelo en la galería."
                wide
              >
                <textarea
                  rows={2}
                  maxLength={220}
                  value={value.gallery?.caption ?? ""}
                  placeholder="Ej. Almacenaje para una habitación tranquila."
                  onChange={(event) =>
                    setProduct("gallery", {
                      ...value.gallery,
                      caption: event.target.value,
                    })
                  }
                />
              </Field>
            </div>
          </section>

          <section
            className="admin-model-section"
            aria-labelledby={sectionId("publication")}
          >
            <h3 id={sectionId("publication")} tabIndex={-1}>
              Publicación
            </h3>
            <div className="admin-form-grid">
              <NumberField
                title="Orden en catálogo"
                value={value.order}
                max={999}
                change={(next) => setProduct("order", next)}
                note="Los números menores aparecen primero."
              />
              <NumberField
                title="Mano de obra base · S/"
                value={value.basePrice}
                max={50000}
                step={0.1}
                change={(next) => setProduct("basePrice", next)}
                note="Costo interno; el precio final incluye materiales, herrajes, margen y servicios."
              />
              <label className="admin-switch-label">
                <Switch
                  checked={value.defaults.install}
                  onCheckedChange={(next) => setConfig("install", next)}
                />
                Instalación seleccionada por defecto
              </label>
              <label className="admin-switch-label">
                <Switch
                  checked={value.defaults.transport}
                  onCheckedChange={(next) => setConfig("transport", next)}
                />
                Transporte seleccionado por defecto
              </label>
            </div>
            <div className="admin-editor-publication">
              {isNew ? (
                <p>
                  Este modelo se creará como <strong>borrador</strong>. Podrás
                  publicarlo después de revisarlo.
                </p>
              ) : (
                <label className="admin-switch-label">
                  <Switch
                    checked={value.active}
                    onCheckedChange={(active) => setProduct("active", active)}
                  />
                  Visible en el catálogo al guardar
                </label>
              )}
            </div>
            <p className="admin-help">
              Los cambios se aplican al guardar. Los diseños que ya se guardaron
              conservan su versión original.
            </p>
          </section>
        </div>

        <aside
          className="admin-model-preview"
          aria-label="Vista previa del modelo en edición"
        >
          <div className="admin-preview-heading">
            <div>
              <span>VISTA PREVIA</span>
              <h4>{value.name.trim() || "Tu nuevo modelo"}</h4>
            </div>
            <Box size={21} aria-hidden="true" />
          </div>
          <div className="admin-preview-stage">
            {shown ? (
              <Viewer
                panels={shown.geometry}
                materials={shown.materials}
                {...shown.config}
                view={view}
                open={openDoors && shown.config.doors !== "none"}
                dimensions={showDimensions}
                environment={false}
                reference={false}
              />
            ) : (
              <div className="admin-preview-empty">
                <Box size={35} strokeWidth={1} />
                <p>
                  Completa medidas y distribución válidas para ver el modelo.
                </p>
              </div>
            )}
          </div>
          <div
            className="admin-preview-views"
            role="group"
            aria-label="Vista de la previsualización"
          >
            {(
              [
                { value: "iso", name: "3D" },
                { value: "front", name: "Frente" },
                { value: "side", name: "Lateral" },
              ] as const
            ).map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={view === item.value}
                onClick={() => setView(item.value)}
              >
                {item.name}
              </button>
            ))}
          </div>
          <div className="admin-preview-controls">
            <button
              type="button"
              aria-pressed={openDoors}
              disabled={!shown || shown.config.doors === "none"}
              onClick={() => setOpenDoors(!openDoors)}
            >
              <Eye size={14} />
              {openDoors ? "Cerrar puertas" : "Abrir puertas"}
            </button>
            <button
              type="button"
              aria-pressed={showDimensions}
              onClick={() => setShowDimensions(!showDimensions)}
            >
              <Ruler size={14} />
              Medidas
            </button>
          </div>
          {preview.error ? (
            <div className="admin-preview-warning" role="status">
              <strong>
                {shown
                  ? "Mostrando la última configuración válida."
                  : "La vista previa necesita un ajuste."}
              </strong>
              <p>{preview.error}</p>
              <span>Tus valores escritos se conservan.</span>
            </div>
          ) : (
            <p className="admin-preview-hint">
              Arrastra para girar y usa la rueda para acercar.
            </p>
          )}
          {shown && (
            <div className="admin-preview-summary">
              <p>
                <LockKeyhole size={13} />
                Resumen privado
                {preview.error ? " · última configuración válida" : ""}
              </p>
              <div>
                <span>Precio estimado</span>
                <strong>{money(shown.result.price)}</strong>
              </div>
              <div>
                <span>Piezas de melamina</span>
                <strong>{shown.result.panels.length}</strong>
              </div>
              <div>
                <span>Superficie de tablero</span>
                <strong>{shown.result.area.toFixed(2)} m²</strong>
              </div>
              <small>
                Despiece preliminar. Requiere validación del taller antes de
                fabricar.
              </small>
              {settingsDirty && (
                <small>
                  Esta vista utiliza tus tarifas y acabados aún sin guardar.
                  Guarda también los ajustes del negocio para aplicarlos.
                </small>
              )}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
