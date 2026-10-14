import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Box, ChevronDown, Eye, LockKeyhole, Ruler } from "lucide-react";
import { Switch } from "../components/ui/switch";
import {
  getConstruction,
  getConstructionOptions,
  getFrontOptions,
  frontKinds,
  money,
  productCategories,
  type Config,
  type Construction,
  type Product,
  type Settings,
} from "../lib/furniture";
import { constructionTemplates } from "../lib/product-templates";
import { buildAdminPreview, productEditorError } from "./admin-product-preview";
import { changeDraftConstruction, getEditorIssue, type EditorSection } from "./admin-catalog-draft";
import {
  constructionDescriptions,
  constructionLabels,
} from "./construction-labels";
import {
  MaterialDetails,
  MaterialSource,
  MaterialSwatch,
} from "./MaterialSwatch";
import { FrontSelector, frontLabels } from "./FrontSelector";
import { AdminExtrasEditor } from "./AdminExtrasEditor";
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
  { id: "finishes", name: "Opciones y acabados" },
  { id: "gallery", name: "Imagen y galería" },
  { id: "publication", name: "Precio y publicación" },
] as const;
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
  validationAttempt = 0,
  existingIds = [],
  change,
}: {
  value: Product;
  settings: Settings;
  isNew: boolean;
  settingsDirty: boolean;
  validationAttempt?: number;
  existingIds?: string[];
  change: (value: Product) => void;
}) {
  const prefix = useId();
  const [view, setView] = useState<View>("iso");
  const [openDoors, setOpenDoors] = useState(false);
  const [showDimensions, setShowDimensions] = useState(true);
  const [activeSection, setActiveSection] = useState<EditorSection>("general");
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [pendingConstruction, setPendingConstruction] = useState<Construction["kind"] | null>(null);
  const [advancedIdOpen, setAdvancedIdOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const lastValidationAttempt = useRef(validationAttempt);
  const activeIndex = sections.findIndex((section) => section.id === activeSection);
  const issue = isNew && existingIds.includes(value.id)
    ? { section: "general" as const, message: "Este identificador ya pertenece a otro mueble. Abre «Identificador del modelo» y elige otro." }
    : getEditorIssue(value, settings);
  const issueRef = useRef(issue);
  issueRef.current = issue;
  useEffect(() => {
    if (lastValidationAttempt.current === validationAttempt) return;
    lastValidationAttempt.current = validationAttempt;
    if (!issueRef.current) return;
    setActiveSection(issueRef.current.section);
    setPreviewExpanded(false);
    if (issueRef.current.section === "general") setAdvancedIdOpen(true);
    setFocusRequest((request) => request + 1);
  }, [validationAttempt]);
  useEffect(() => {
    if (!focusRequest) return;
    const heading = document.getElementById(`${prefix}-${activeSection}`);
    heading?.scrollIntoView({ block: "start", behavior: "instant" });
    heading?.focus({ preventScroll: true });
  }, [focusRequest, activeSection, prefix]);
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
    value.showPrice,
    value.pricing,
    value.frontOptions,
    value.extras,
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
  const goTo = (name: EditorSection) => {
    setPendingConstruction(null);
    setPreviewExpanded(false);
    setActiveSection(name);
    setFocusRequest((request) => request + 1);
  };
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

  function changeFrontOptions(
    front: NonNullable<Config["front"]>,
    enabled: boolean,
  ) {
    const current = getFrontOptions(value);
    const next = enabled
      ? [...current, front]
      : current.filter((item) => item !== front);
    if (!next.length) return;
    const defaultFront = next.includes(value.defaults.front ?? "melamine")
      ? value.defaults.front
      : next[0];
    change({
      ...value,
      frontOptions: next,
      defaults: {
        ...value.defaults,
        ...(value.defaults.doors === "none"
          ? {}
          : {
              front: defaultFront,
              ...(defaultFront && defaultFront !== "melamine"
                ? { handle: "exterior" as const }
                : {}),
            }),
      },
    });
  }

  return (
    <>
      <div className="admin-editor-progress">
        <span>Sección {activeIndex + 1} de {sections.length}</span>
        <span>Melamina de 18 mm · cambios al guardar</span>
      </div>
      <nav className="admin-editor-nav" aria-label="Secciones del editor">
        {sections.map((section, index) => (
          <button
            key={section.id}
            type="button"
            aria-current={activeSection === section.id ? "step" : undefined}
            aria-controls={`${sectionId(section.id)}-panel`}
            onClick={() => goTo(section.id)}
          >
            <span>{index + 1}</span>
            {section.name}
          </button>
        ))}
      </nav>
      <div className="admin-model-layout">
        <div className="admin-model-fields">
          {issue && (validationAttempt > 0 || (issue.section !== "general" && issue.section === activeSection)) && (
            <div className="admin-section-warning" role="status">
              <AlertCircle size={18} aria-hidden="true" />
              <div>
                <strong>Revisa este dato antes de guardar</strong>
                <p>{issue.message}</p>
                {issue.section !== activeSection && (
                  <button type="button" onClick={() => goTo(issue.section)}>
                    Ir a {sections.find((section) => section.id === issue.section)?.name}
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          )}
          <section
            className="admin-model-section"
            id={`${sectionId("general")}-panel`}
            hidden={activeSection !== "general"}
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
            <details
              className="admin-advanced-field"
              open={advancedIdOpen}
              onToggle={(event) => setAdvancedIdOpen(event.currentTarget.open)}
            >
              <summary>Identificador del modelo <span>{isNew ? "Opcional · avanzado" : "Permanente"}</span></summary>
              <Field
                title="Identificador único"
                note={isNew
                  ? "Se propone a partir del nombre. Puedes ajustarlo antes de crear el mueble: minúsculas, números y guiones."
                  : "Conecta este mueble con sus diseños guardados y no se puede cambiar."}
              >
                <input
                  value={value.id}
                  onChange={(event) => setProduct("id", event.target.value.toLowerCase())}
                  readOnly={!isNew}
                  pattern="[a-z0-9-]{2,60}"
                  required
                />
              </Field>
            </details>
          </section>

          <section
            className="admin-model-section"
            id={`${sectionId("dimensions")}-panel`}
            hidden={activeSection !== "dimensions"}
            aria-labelledby={sectionId("dimensions")}
          >
            <h3 id={sectionId("dimensions")} tabIndex={-1}>
              Medidas y distribución
            </h3>
            <Field
              title="Tipo de construcción"
              note="Elige la estructura del mueble. Si la cambias, podrás revisar y confirmar antes de reemplazar su distribución."
            >
              <select
                value={pendingConstruction ?? construction.kind}
                onChange={(event) =>
                  setPendingConstruction(event.target.value === construction.kind ? null : event.target.value as Construction["kind"])
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
            {pendingConstruction && (
              <div className="admin-construction-confirm" role="status">
                <strong>¿Cambiar a {constructionLabels[pendingConstruction]}?</strong>
                <p>Este cambio aún no se aplicó. Se reemplazarán el tamaño inicial, el rango permitido y la distribución por los de esta plantilla. Se conservarán el nombre, la descripción, los acabados compatibles y los precios.</p>
                <div>
                  <button type="button" onClick={() => setPendingConstruction(null)}>Conservar estructura actual</button>
                  <button type="button" className="admin-confirm-construction" onClick={() => {
                    change(changeDraftConstruction(value, pendingConstruction));
                    setPendingConstruction(null);
                  }}>Sí, cambiar estructura</button>
                </div>
              </div>
            )}
            <p className="admin-section-intro">
              {constructionDescriptions[construction.kind]}
            </p>
            <p className="admin-help">
              Todas las medidas están en milímetros: 1 metro = 1000 mm.
              Usa incrementos de 10 mm. El espesor del tablero es siempre 18 mm.
            </p>
            <div className="admin-measure-group">
              <h4>Tamaño inicial</h4>
              <p>Así aparecerá el modelo cuando el cliente lo abra.</p>
              <div className="admin-initial-dimensions">
                {dimensions.map(({ key, name }) => (
                  <NumberField
                    key={key}
                    title={`${name} · mm`}
                    min={100}
                    max={3000}
                    step={10}
                    value={value.defaults[key]}
                    change={(next) => setConfig(key, next)}
                  />
                ))}
              </div>
            </div>
            <div className="admin-measure-group">
              <h4>Rango permitido al cliente</h4>
              <p>El tamaño inicial debe quedar entre estos límites. Usa el mismo mínimo y máximo si la medida es fija.</p>
              <div className="admin-dimension-grid admin-dimension-ranges">
              <span>Medida</span>
              <span>Mínimo · mm</span>
              <span>Máximo · mm</span>
              {dimensions.map(({ key, name }) => (
                <div className="admin-dimension-row" key={key}>
                  <strong>{name}</strong>
                  {(["min", "max"] as const).map((position) => {
                    const current = value.limits[key][position];
                    return (
                      <input
                        key={position}
                        type="number"
                        aria-label={`${name} ${position === "min" ? "mínimo" : "máximo"} en mm`}
                        required
                        min={100}
                        max={3000}
                        step={10}
                        value={Number.isNaN(current) ? "" : current}
                        onChange={(event) =>
                          setProduct("limits", {
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
                    onChange={(event) => {
                      const doors = event.target.value as Config["doors"];
                      const front =
                        doors === "none"
                          ? "melamine"
                          : getFrontOptions(value).includes(
                                value.defaults.front ?? "melamine",
                              )
                            ? value.defaults.front
                            : getFrontOptions(value)[0];
                      change({
                        ...value,
                        defaults: {
                          ...value.defaults,
                          doors,
                          front,
                          ...(front && front !== "melamine"
                            ? { handle: "exterior" as const }
                            : {}),
                        },
                      });
                    }}
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
            id={`${sectionId("finishes")}-panel`}
            hidden={activeSection !== "finishes"}
            aria-labelledby={sectionId("finishes")}
          >
            <h3 id={sectionId("finishes")} tabIndex={-1}>
              Opciones y acabados
            </h3>
            <p className="admin-section-intro">
              Define el aspecto inicial. Los clientes podrán elegir entre los
              acabados activos.
            </p>
            {options.doors.some((door) => door !== "none") && (
              <>
                <p className="admin-help">
                  Materiales de puerta que el cliente puede elegir en este
                  modelo:
                </p>
                <div className="admin-front-allowances">
                  {frontKinds.map((front) => (
                    <label key={front}>
                      <input
                        type="checkbox"
                        checked={getFrontOptions(value).includes(front)}
                        disabled={
                          getFrontOptions(value).length === 1 &&
                          getFrontOptions(value).includes(front)
                        }
                        onChange={(event) =>
                          changeFrontOptions(front, event.target.checked)
                        }
                      />
                      {frontLabels[front]}
                    </label>
                  ))}
                </div>
                {value.defaults.doors !== "none" && (
                  <FrontSelector
                    value={value.defaults.front}
                    options={getFrontOptions(value)}
                    onChange={(front) =>
                      change({
                        ...value,
                        defaults: {
                          ...value.defaults,
                          front,
                          ...(front !== "melamine"
                            ? { handle: "exterior" as const }
                            : {}),
                        },
                      })
                    }
                  />
                )}
                <p className="admin-help">
                  Los frentes de vidrio se limitan a 150 cm de alto por hoja y
                  usan jalador exterior. El resto del mueble conserva melamina
                  de 18 mm.
                </p>
              </>
            )}
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
                    disabled={
                      !!value.defaults.front &&
                      value.defaults.front !== "melamine"
                    }
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
            <MaterialDetails material={exterior} label="Tablero exterior" />
            <p className="admin-help">
              Los colores en pantalla son aproximados. Confirma la muestra
              física antes de fabricar.
            </p>
            <AdminExtrasEditor product={value} onChange={change} />
          </section>

          <section
            className="admin-model-section"
            id={`${sectionId("gallery")}-panel`}
            hidden={activeSection !== "gallery"}
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
            id={`${sectionId("publication")}-panel`}
            hidden={activeSection !== "publication"}
            aria-labelledby={sectionId("publication")}
          >
            <h3 id={sectionId("publication")} tabIndex={-1}>
              Precio y publicación
            </h3>
            <div className="admin-form-grid">
              <NumberField
                title="Orden en catálogo"
                value={value.order}
                max={999}
                change={(next) => setProduct("order", next)}
                note="Los números menores aparecen primero."
              />
              <Field title="Precio en la web" note="Puedes publicar este modelo sin indicar un importe. El cliente verá un botón Cotizar plateado y podrá enviarte su diseño.">
                <select value={value.showPrice === false ? "quote" : "price"} onChange={(event) => {
                  const showPrice = event.target.value === "price";
                  change({
                    ...value,
                    showPrice,
                    basePrice: !showPrice && !Number.isFinite(value.basePrice) ? 0 : value.basePrice,
                    pricing: !showPrice && value.pricing && value.pricing.basis !== "calculated" && !Number.isFinite(value.pricing.amount)
                      ? { ...value.pricing, amount: 0 }
                      : value.pricing,
                  });
                }}>
                  <option value="price">Mostrar precio referencial</option>
                  <option value="quote">Sin precio · botón Cotizar</option>
                </select>
              </Field>
              {value.showPrice !== false && <>
              <NumberField
                title="Mano de obra base · S/"
                value={value.basePrice}
                max={50000}
                step={0.1}
                change={(next) => setProduct("basePrice", next)}
                note="Costo interno utilizado solo con cotización por materiales y herrajes."
              />
              <Field
                title="Forma de cotizar este modelo"
                note="La tarifa de venta por unidad o por metro incluye materiales, herrajes comunes y mano de obra. Frentes especiales con margen y servicios se suman aparte; el total se redondea a S/ 10."
              >
                <select
                  value={value.pricing?.basis ?? "calculated"}
                  onChange={(event) => {
                    const basis = event.target.value as
                      "calculated" | "unit" | "linear-meter";
                    setProduct(
                      "pricing",
                      basis === "calculated"
                        ? { basis }
                        : {
                            basis,
                            amount:
                              value.pricing &&
                              value.pricing.basis !== "calculated"
                                ? value.pricing.amount
                                : 0,
                          },
                    );
                  }}
                >
                  <option value="calculated">Por materiales y herrajes</option>
                  <option value="unit">Tarifa por unidad</option>
                  <option value="linear-meter">
                    Tarifa por metro lineal de ancho
                  </option>
                </select>
              </Field>
              {value.pricing && value.pricing.basis !== "calculated" && (
                <NumberField
                  title={
                    value.pricing.basis === "unit"
                      ? "Precio base de venta · S/ por unidad"
                      : "Precio base de venta · S/ por metro lineal"
                  }
                  value={value.pricing.amount}
                  max={100000}
                  step={0.1}
                  change={(amount) =>
                    setProduct("pricing", {
                      basis: value.pricing!.basis as "unit" | "linear-meter",
                      amount,
                    })
                  }
                  note={
                    value.pricing.basis === "unit"
                      ? "Una unidad es un mueble completo de este modelo, a cualquier medida admitida."
                      : "Cantidad facturada = ancho configurado ÷ 1000. El alto y fondo no multiplican esta tarifa."
                  }
                />
              )}
              </>}
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
          <div className="admin-editor-step-actions">
            <button
              type="button"
              disabled={activeIndex === 0}
              onClick={() => goTo(sections[activeIndex - 1].id)}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Anterior
            </button>
            {activeIndex < sections.length - 1 ? (
              <button type="button" onClick={() => goTo(sections[activeIndex + 1].id)}>
                Siguiente
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : (
              <span>Al terminar, guarda los cambios con el botón de abajo.</span>
            )}
          </div>
        </div>

        <aside
          className={`admin-model-preview${previewExpanded ? " is-expanded" : ""}`}
          aria-label="Vista previa del modelo en edición"
        >
          <button
            type="button"
            className="admin-mobile-preview-toggle"
            aria-expanded={previewExpanded}
            aria-controls={sectionId("preview-content")}
            onClick={() => setPreviewExpanded(!previewExpanded)}
          >
            <Box size={18} aria-hidden="true" />
            <span>{previewExpanded ? "Ocultar vista 3D" : "Ver modelo 3D"}</span>
            {shown && <strong>{value.showPrice === false ? "Por cotizar" : money(shown.result.price)}{preview.error ? " *" : ""}</strong>}
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          <div className="admin-preview-content" id={sectionId("preview-content")}>
          <div className="admin-preview-heading">
            <div>
              <span>VISTA PREVIA</span>
              <h4>{value.name.trim() || "Tu nuevo modelo"}</h4>
            </div>
            {shown ? (
              <div className="admin-preview-price">
                <span>{value.showPrice === false ? "EN LA WEB" : `ESTIMADO${preview.error ? " ANTERIOR" : ""}`}</span>
                {value.showPrice === false
                  ? <span className="chrome-quote chrome-quote--compact">Cotizar <ArrowRight size={15} aria-hidden="true" /></span>
                  : <strong>{money(shown.result.price)}</strong>}
              </div>
            ) : <Box size={21} aria-hidden="true" />}
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
            <details className="admin-preview-summary">
              <summary>
                <LockKeyhole size={13} />
                Resumen privado
                {preview.error ? " · última configuración válida" : ""}
                <ChevronDown size={13} aria-hidden="true" />
              </summary>
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
            </details>
          )}
          </div>
        </aside>
      </div>
    </>
  );
}
