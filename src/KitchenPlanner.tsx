import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChefHat,
  CookingPot,
  Copy,
  DoorOpen,
  LayoutPanelTop,
  Plus,
  Refrigerator,
  Ruler,
  Save,
  Undo2,
  Redo2,
  Square,
  Trash2,
  Waves,
} from "lucide-react";
import { api } from "../lib/api";
import {
  getConstructionOptions,
  getFrontOptions,
  money,
  type Config,
} from "../lib/furniture";
import type { KitchenPlan, KitchenQuote } from "../lib/kitchen";
import type { PublicProduct, PublicSettings } from "./types";
import { Header, Footer } from "./App";
import Viewer, { type View } from "./Viewer";
import { FrontSelector, DoorLayoutSelector } from "./FrontSelector";
import { MaterialDetails, MaterialSwatch } from "./MaterialSwatch";
import { materialLabel } from "./materials";
import { ContactLinks } from "./ContactLinks";
import { moveKitchenItem, startingKitchen } from "./kitchen-planner-state";
import { KitchenTemplatePicker } from "./KitchenTemplatePicker";
import { KitchenBuilderDialog } from "./KitchenBuilderDialog";
import { getKitchenSlots, type KitchenSlot } from "./kitchen-slots";
import { insertKitchenModule } from "./kitchen-placement";
import "./kitchen-planner.css";

type Item = KitchenPlan["items"][number];
type SavedKitchen = {
  id: string;
  name: string;
  version: number;
  created: string;
  plan: KitchenPlan;
  result: KitchenQuote;
};
const gapNames = {
  fridge: "Refrigeradora",
  cooker: "Cocina / horno",
  "sink-gap": "Lavadero",
  space: "Espacio libre",
};
const gapIcons = {
  fridge: Refrigerator,
  cooker: CookingPot,
  "sink-gap": Waves,
  space: Square,
};
const names = { width: "Ancho", height: "Alto", depth: "Fondo" };
const mm = (value: number) =>
  `${(value / 1000).toLocaleString("es-PE", { maximumFractionDigits: 2 })} m`;

export default function KitchenPlanner() {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [settings, setSettings] = useState<PublicSettings>();
  const [plan, setPlan] = useState<KitchenPlan>();
  const [quote, setQuote] = useState<KitchenQuote>();
  const [quoteKey, setQuoteKey] = useState("");
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");
  const [actionError, setActionError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [snapshot, setSnapshot] = useState(false);
  const [saved, setSaved] = useState<SavedKitchen>();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("Mi cocina");
  const [stored, setStored] = useState<SavedKitchen[]>([]);
  const [view, setView] = useState<View>("iso");
  const [open, setOpen] = useState(false);
  const [dimensions, setDimensions] = useState(true);
  const [wall, setWall] = useState<"a" | "b">("a");
  const [row, setRow] = useState<"base" | "wall" | "tall">("base");
  const [addProduct, setAddProduct] = useState("");
  const [copied, setCopied] = useState(false);
  const [placement, setPlacement] = useState<KitchenSlot>();
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [pastPlans, setPastPlans] = useState<KitchenPlan[]>([]);
  const [futurePlans, setFuturePlans] = useState<KitchenPlan[]>([]);
  const request = useRef(0);
  const editRevision = useRef(0);
  const moduleEditor = useRef<HTMLDivElement>(null);
  const sceneElement = useRef<HTMLElement>(null);

  function load() {
    setLoading(true);
    setPageError("");
    void api("action=catalog")
      .then(async (data) => {
        const models = data.products as PublicProduct[];
        setProducts(models);
        setSettings(data.settings);
        setAddProduct(
          models.find((product) => product.category === "Cocina")?.id || "",
        );
        const id = new URLSearchParams(location.search).get("cocina");
        if (id) {
          const response = await api(
            "action=kitchen&id=" + encodeURIComponent(id),
          );
          const kitchen = response.kitchen as SavedKitchen;
          setPlan(kitchen.plan);
          setQuote(kitchen.result);
          setQuoteKey(JSON.stringify(kitchen.plan));
          setSaved(kitchen);
          setName(kitchen.name || "Mi cocina");
          setSnapshot(true);
          setSelected(kitchen.plan.items[0]?.id || "");
        } else {
          const initial = startingKitchen(models);
          setPlan(initial);
          setSelected(initial.items[0]?.id || "");
        }
        void api<{ kitchens: SavedKitchen[] }>("action=kitchens")
          .then((data) => setStored(data.kitchens))
          .catch(() =>
            setHistoryError(
              "No pudimos cargar tus cocinas guardadas. Puedes continuar diseñando y guardar esta cocina.",
            ),
          );
      })
      .catch((cause) => setPageError(cause.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);
  useEffect(() => {
    if (!plan || snapshot) return;
    const controller = new AbortController();
    const sequence = ++request.current;
    setPending(true);
    setError("");
    const timer = setTimeout(() => {
      void fetch("/api/kitchen-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const data = (await response.json()) as KitchenQuote & {
            error?: string;
          };
          if (!response.ok)
            throw Error(data.error || "Revisa la distribución de tu cocina.");
          return data as KitchenQuote;
        })
        .then((result) => {
          if (sequence === request.current && !controller.signal.aborted) {
            setQuote(result);
            setQuoteKey(JSON.stringify(plan));
          }
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(cause.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setPending(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [plan, snapshot]);

  function change(next: KitchenPlan, recordHistory = true) {
    if (
      recordHistory &&
      plan &&
      JSON.stringify(plan) !== JSON.stringify(next)
    ) {
      setPastPlans((previous) => [
        ...previous.slice(-19),
        structuredClone(plan),
      ]);
      setFuturePlans([]);
    }
    editRevision.current++;
    setPlan(next);
    setPending(true);
    setSaved(undefined);
    setSnapshot(false);
    setCopied(false);
    setActionError("");
    setSaveNotice("");
    history.replaceState(null, "", "/cocinas");
  }
  function restorePlan(direction: "undo" | "redo") {
    if (!plan) return;
    const history = direction === "undo" ? pastPlans : futurePlans;
    const next = history[history.length - 1];
    if (!next) return;
    if (direction === "undo") {
      setPastPlans(history.slice(0, -1));
      setFuturePlans((previous) => [
        ...previous.slice(-19),
        structuredClone(plan),
      ]);
    } else {
      setFuturePlans(history.slice(0, -1));
      setPastPlans((previous) => [
        ...previous.slice(-19),
        structuredClone(plan),
      ]);
    }
    change(structuredClone(next), false);
    setSelected(
      next.items.find((item) => item.id === selected)?.id ??
        next.items[0]?.id ??
        "",
    );
    setSelectedTemplate("");
    setPlacement(undefined);
  }
  function edit(next: Item) {
    if (plan)
      change({
        ...plan,
        items: plan.items.map((item) => (item.id === next.id ? next : item)),
      });
  }
  function configure(next: Config) {
    if (current?.kind === "furniture")
      edit({
        ...current,
        config: { ...next, install: false, transport: false },
      });
  }
  function add(kind: Item["kind"]) {
    if (!plan || plan.items.length >= 16) return;
    const id = crypto.randomUUID();
    let item: Item;
    if (kind === "furniture") {
      const product = products.find((value) => value.id === addProduct);
      if (!product) return;
      item = {
        id,
        kind,
        wall,
        row,
        productId: product.id,
        config: { ...product.defaults, install: false, transport: false },
      };
    } else {
      item = {
        id,
        kind,
        wall,
        row: kind === "fridge" ? "tall" : kind === "space" ? row : "base",
        width: kind === "fridge" ? 900 : 600,
        height:
          kind === "fridge"
            ? 2000
            : kind === "space" && row === "wall"
              ? 600
              : 900,
        depth: kind === "space" && row === "wall" ? 350 : 600,
      };
    }
    change({ ...plan, items: [...plan.items, item] });
    setSelected(id);
  }
  async function save() {
    if (!plan || !currentQuote) return;
    const submittedRevision = editRevision.current;
    setSaving(true);
    setActionError("");
    setSaveNotice("");
    try {
      const { kitchen } = await api<{ kitchen: SavedKitchen }>("", {
        op: "save-kitchen",
        name,
        plan,
      });
      setStored((previous) => [
        kitchen,
        ...previous.filter((item) => item.id !== kitchen.id),
      ]);
      if (submittedRevision === editRevision.current) {
        setSaved(kitchen);
        setSnapshot(true);
        setQuote(kitchen.result);
        setPlan(kitchen.plan);
        setQuoteKey(JSON.stringify(kitchen.plan));
        history.replaceState(null, "", "/cocinas?cocina=" + kitchen.id);
      } else {
        setSaveNotice(
          "Se guardó la versión enviada. Tus cambios más recientes siguen en pantalla; guárdalos cuando termines.",
        );
      }
      // Updating the history is independent: a failed refresh must not report a failed save.
      void api<{ kitchens: SavedKitchen[] }>("action=kitchens")
        .then((data) => {
          setStored(data.kitchens);
          setHistoryError("");
        })
        .catch(() =>
          setHistoryError(
            "Tu cocina se guardó correctamente. No pudimos actualizar el resto de la lista de cocinas guardadas.",
          ),
        );
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "No se pudo guardar.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function copyLink() {
    if (!saved) return;
    try {
      await navigator.clipboard.writeText(
        location.origin + "/cocinas?cocina=" + saved.id,
      );
      setCopied(true);
    } catch {
      setActionError(
        "No se pudo copiar. Puedes copiar la dirección de esta página.",
      );
    }
  }

  const current = plan?.items.find((item) => item.id === selected);
  const product =
    current?.kind === "furniture"
      ? products.find((item) => item.id === current.productId)
      : undefined;
  const currentQuote = Boolean(
    quote && plan && quoteKey === JSON.stringify(plan) && !pending && !error,
  );
  const placementSlots = useMemo(
    () => (plan && quote && currentQuote ? getKitchenSlots(plan, quote) : []),
    [plan, quote, currentQuote],
  );
  function placeModule(product: PublicProduct, config: Config) {
    if (!plan || !placement) return;
    const placed = insertKitchenModule(plan, placement, product, config, () =>
      crypto.randomUUID(),
    );
    change(placed.plan);
    setSelected(placed.selected);
    setPlacement(undefined);
    sceneElement.current?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
  }
  const modelName = (item: Item) =>
    item.kind === "furniture"
      ? products.find((product) => product.id === item.productId)?.name ||
        quote?.modules.find((module) => module.id === item.id)?.name ||
        "Modelo guardado"
      : gapNames[item.kind];
  const kitchenProducts = products.filter(
    (product) => product.category === "Cocina",
  );
  if (loading)
    return (
      <>
        <Header />
        <div className="kitchen-empty">Preparando tu cocina…</div>
        <Footer />
      </>
    );
  if (pageError || !plan || !settings)
    return (
      <>
        <Header />
        <div className="kitchen-empty">
          <p>{pageError || "No se pudo cargar el catálogo."}</p>
          <button className="button" onClick={load}>
            Volver a intentar
          </button>
          <a href="/cocinas">Empezar una cocina nueva</a>
        </div>
        <Footer />
      </>
    );

  return (
    <>
      <Header compact />
      <main className="kitchen-page">
        <section className="kitchen-intro">
          <div>
            <p className="eyebrow">EL CAPO / COCINAS A TU MEDIDA</p>
            <h1>
              Un lugar para
              <br />
              <em>vivir la cocina.</em>
            </h1>
          </div>
          <p>
            Combina muebles, elige sus acabados y deja sitio para lo que
            importa. Cada módulo se adapta a tu espacio.
          </p>
        </section>
        <KitchenTemplatePicker
          products={products}
          selected={selectedTemplate}
          onSelect={(template) => {
            change(structuredClone(template.plan));
            setName(template.name);
            setSelectedTemplate(template.id);
            setSelected(
              template.plan.items.find((item) => item.kind === "furniture")
                ?.id ?? "",
            );
            setWall("a");
            setView("iso");
            setPlacement(undefined);
            sceneElement.current?.scrollIntoView({
              block: "start",
              behavior: "instant",
            });
          }}
        />
        <div className="kitchen-workspace">
          <section
            className="kitchen-scene"
            aria-label="Vista de la cocina completa"
            ref={sceneElement}
          >
            <div className="kitchen-scene-head">
              <span>
                <ChefHat size={17} /> Tu cocina modular
              </span>
              <span>
                {plan.layout === "l"
                  ? "Distribución en L"
                  : "Distribución lineal"}
              </span>
            </div>
            <div className="kitchen-canvas">
              {quote ? (
                <Viewer
                  panels={quote.geometry}
                  materials={quote.materials}
                  {...quote.envelope}
                  view={view}
                  open={open}
                  dimensions={dimensions}
                  reference={false}
                  environment={false}
                  placementSlots={placementSlots}
                  onPlacementSelect={(id) =>
                    setPlacement(placementSlots.find((slot) => slot.id === id))
                  }
                />
              ) : (
                <div className="kitchen-empty">
                  <LayoutPanelTop size={42} strokeWidth={1} />
                  <p>Añade tus primeros módulos.</p>
                </div>
              )}
              {(pending || error) && (
                <span className="kitchen-scene-status" role="status">
                  {pending
                    ? "Actualizando tu distribución…"
                    : "Vista de la última distribución válida"}
                </span>
              )}
            </div>
            <div className="kitchen-view-controls">
              <div className="kitchen-history-controls">
                <button
                  disabled={!pastPlans.length}
                  onClick={() => restorePlan("undo")}
                  aria-label="Deshacer cambio de cocina"
                >
                  <Undo2 size={16} />
                  Deshacer
                </button>
                <button
                  disabled={!futurePlans.length}
                  onClick={() => restorePlan("redo")}
                  aria-label="Rehacer cambio de cocina"
                >
                  <Redo2 size={16} />
                  Rehacer
                </button>
              </div>
              <div>
                {(
                  [
                    ["iso", "3D"],
                    ["front", "Frente"],
                    ["top", "Planta"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={view === value}
                    onClick={() => setView(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button aria-pressed={open} onClick={() => setOpen(!open)}>
                <DoorOpen size={16} />
                {open ? "Cerrar" : "Abrir"} puertas
              </button>
              <button
                aria-pressed={dimensions}
                onClick={() => setDimensions(!dimensions)}
              >
                <Ruler size={16} /> Medidas
              </button>
            </div>
            <p className="kitchen-scene-note">
              <strong>
                Toca + para elegir un mueble, sus puertas y su color.
              </strong>{" "}
              Las zonas translúcidas reservan espacio. Los equipos, lavadero,
              cubierta e instalaciones se cotizan con el taller.
            </p>
          </section>
          <aside className="kitchen-space-panel">
            <p className="eyebrow">01 / TU ESPACIO</p>
            <h2>Todo empieza por las medidas.</h2>
            <div className="kitchen-layout-choices">
              <button
                aria-pressed={plan.layout === "straight"}
                onClick={() => {
                  if (plan.items.some((item) => item.wall === "b")) {
                    setActionError(
                      "Mueve o retira los módulos de la pared B antes de pasar a una cocina lineal.",
                    );
                    return;
                  }
                  change({ ...plan, layout: "straight" });
                  setWall("a");
                }}
              >
                <span className="layout-line" />
                Lineal
              </button>
              <button
                aria-pressed={plan.layout === "l"}
                onClick={() => change({ ...plan, layout: "l" })}
              >
                <span className="layout-corner" />
                En L
              </button>
            </div>
            <div className="kitchen-measures">
              <label>
                Pared A · mm
                <input
                  type="number"
                  min="1000"
                  max="6000"
                  step="10"
                  value={Number.isFinite(plan.walls.a) ? plan.walls.a : ""}
                  onChange={(event) =>
                    change({
                      ...plan,
                      walls: {
                        ...plan.walls,
                        a:
                          event.target.value === ""
                            ? NaN
                            : Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
              {plan.layout === "l" && (
                <label>
                  Pared B · mm
                  <input
                    type="number"
                    min="1000"
                    max="6000"
                    step="10"
                    value={Number.isFinite(plan.walls.b) ? plan.walls.b : ""}
                    onChange={(event) =>
                      change({
                        ...plan,
                        walls: {
                          ...plan.walls,
                          b:
                            event.target.value === ""
                              ? NaN
                              : Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>
              )}
              <label>
                Altura del ambiente · mm
                <input
                  type="number"
                  min="2000"
                  max="4000"
                  step="10"
                  value={
                    Number.isFinite(plan.roomHeight ?? 2600)
                      ? (plan.roomHeight ?? 2600)
                      : ""
                  }
                  onChange={(event) =>
                    change({
                      ...plan,
                      roomHeight:
                        event.target.value === ""
                          ? NaN
                          : Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Base de alacenas · mm
                <input
                  type="number"
                  min="1200"
                  max="2000"
                  step="10"
                  value={
                    Number.isFinite(plan.wallElevation)
                      ? plan.wallElevation
                      : ""
                  }
                  onChange={(event) =>
                    change({
                      ...plan,
                      wallElevation:
                        event.target.value === ""
                          ? NaN
                          : Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
            <p className="kitchen-help">
              Los módulos se colocan en el orden de cada fila. En L dejamos
              libre el encuentro entre paredes.
            </p>
            <div className="kitchen-total">
              <span>Presupuesto referencial</span>
              <strong aria-live="polite">
                {currentQuote && quote ? money(quote.price) : "Por calcular"}
              </strong>
              <small>
                {plan.items.filter((item) => item.kind === "furniture").length}{" "}
                muebles · melamina de 18 mm
              </small>
            </div>
            <div className="kitchen-services">
              <label>
                <input
                  type="checkbox"
                  checked={plan.install}
                  onChange={(event) =>
                    change({ ...plan, install: event.target.checked })
                  }
                />{" "}
                Incluir instalación
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={plan.transport}
                  onChange={(event) =>
                    change({ ...plan, transport: event.target.checked })
                  }
                />{" "}
                Incluir transporte
              </label>
            </div>
            <label className="kitchen-name">
              Nombre de tu cocina
              <input
                maxLength={80}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  change({ ...plan });
                }}
              />
            </label>
            <button
              className="button kitchen-save"
              disabled={
                !currentQuote ||
                saving ||
                plan.items.every((item) => item.kind !== "furniture")
              }
              onClick={save}
            >
              <Save size={17} />
              {saving
                ? "Guardando…"
                : saved
                  ? "Guardar otra versión"
                  : "Guardar mi cocina"}
            </button>
            {saved && (
              <div className="kitchen-saved">
                <Check size={16} />
                <span>Diseño guardado. Conserva esta versión y su precio.</span>
                <button onClick={copyLink}>
                  <Copy size={14} />
                  {copied ? "Copiado" : "Copiar enlace"}
                </button>
              </div>
            )}
            {snapshot && (
              <p className="kitchen-help">
                Estás viendo una versión guardada. Al editar, se consultan los
                modelos y tarifas actuales.
              </p>
            )}
            {saveNotice && (
              <p className="kitchen-help" role="status">
                {saveNotice}
              </p>
            )}
          </aside>
        </div>
        {error && (
          <div className="kitchen-alert" role="alert">
            {error}
          </div>
        )}
        {actionError && (
          <div className="kitchen-alert" role="alert">
            {actionError}
          </div>
        )}
        {quote && currentQuote && quote.warnings.length > 0 && (
          <div className="kitchen-warnings">
            {quote.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}
        <section className="kitchen-assembly">
          <div className="kitchen-section-heading">
            <div>
              <p className="eyebrow">02 / COMBINA TUS MÓDULOS</p>
              <h2>Una cocina, pieza a pieza.</h2>
            </div>
            <p>
              Selecciona un módulo para editarlo. Cambia su orden con las
              flechas.
            </p>
          </div>
          {(["a", ...(plan.layout === "l" ? ["b"] : [])] as const).map(
            (side) => (
              <div className="kitchen-wall" key={side}>
                <h3>
                  Pared {side.toUpperCase()}{" "}
                  <span>{mm(plan.walls[side as "a" | "b"])}</span>
                </h3>
                {(["wall", "base"] as const).map((lane) => (
                  <div className="kitchen-lane" key={lane}>
                    <span className="kitchen-lane-title">
                      {lane === "wall"
                        ? "Alacenas"
                        : "Muebles bajos y columnas"}
                    </span>
                    <div className="kitchen-module-list">
                      {plan.items
                        .filter(
                          (item) =>
                            item.wall === side &&
                            (lane === "wall"
                              ? item.row === "wall"
                              : item.row !== "wall"),
                        )
                        .map((item) => {
                          const Icon =
                            item.kind === "furniture"
                              ? LayoutPanelTop
                              : gapIcons[item.kind];
                          return (
                            <div
                              className={`kitchen-module ${selected === item.id ? "selected" : ""} ${item.kind !== "furniture" ? "reserved" : ""}`}
                              key={item.id}
                            >
                              <button
                                className="kitchen-module-select"
                                aria-pressed={selected === item.id}
                                onClick={() => {
                                  setSelected(item.id);
                                  moduleEditor.current?.scrollIntoView({
                                    block: "start",
                                    behavior: "instant",
                                  });
                                }}
                              >
                                <Icon size={27} strokeWidth={1.3} />
                                <strong>{modelName(item)}</strong>
                                <small>
                                  {mm(
                                    item.kind === "furniture"
                                      ? item.config.width
                                      : item.width,
                                  )}{" "}
                                  ·{" "}
                                  {item.kind === "furniture"
                                    ? "Mueble"
                                    : "Reserva de espacio"}
                                </small>
                              </button>
                              <div className="kitchen-module-actions">
                                <button
                                  aria-label={`Mover ${modelName(item)} antes`}
                                  onClick={() =>
                                    change(moveKitchenItem(plan, item.id, -1))
                                  }
                                >
                                  <ArrowUp size={15} />
                                </button>
                                <button
                                  aria-label={`Mover ${modelName(item)} después`}
                                  onClick={() =>
                                    change(moveKitchenItem(plan, item.id, 1))
                                  }
                                >
                                  <ArrowDown size={15} />
                                </button>
                                <button
                                  aria-label={`Retirar ${modelName(item)}`}
                                  onClick={() => {
                                    change({
                                      ...plan,
                                      items: plan.items.filter(
                                        (value) => value.id !== item.id,
                                      ),
                                    });
                                    if (selected === item.id) setSelected("");
                                  }}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      {!plan.items.some(
                        (item) =>
                          item.wall === side &&
                          (lane === "wall"
                            ? item.row === "wall"
                            : item.row !== "wall"),
                      ) && (
                        <span className="kitchen-empty-lane">
                          Una fila lista para tus ideas.
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ),
          )}
        </section>
        <section className="kitchen-edit-grid">
          <div className="kitchen-add-panel">
            <p className="eyebrow">AÑADIR A TU COCINA</p>
            <h2>El siguiente módulo.</h2>
            <div className="kitchen-measures">
              <label>
                Pared
                <select
                  value={wall}
                  onChange={(event) => setWall(event.target.value as "a" | "b")}
                >
                  <option value="a">Pared A</option>
                  {plan.layout === "l" && <option value="b">Pared B</option>}
                </select>
              </label>
              <label>
                Ubicación
                <select
                  value={row}
                  onChange={(event) => setRow(event.target.value as typeof row)}
                >
                  <option value="base">Mueble bajo</option>
                  <option value="wall">Alacena</option>
                  <option value="tall">Columna alta</option>
                </select>
              </label>
            </div>
            <label className="kitchen-name">
              Modelo del catálogo
              <select
                value={addProduct}
                onChange={(event) => setAddProduct(event.target.value)}
              >
                {kitchenProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button"
              disabled={!addProduct || plan.items.length >= 16}
              onClick={() => add("furniture")}
            >
              <Plus size={17} />
              Añadir mueble
            </button>
            <p className="kitchen-help">
              O reserva el espacio para un equipo. No se añade a la cotización.
            </p>
            <div className="kitchen-gap-options">
              {Object.entries(gapNames).map(([kind, label]) => {
                const Icon = gapIcons[kind as keyof typeof gapIcons];
                return (
                  <button
                    disabled={plan.items.length >= 16}
                    key={kind}
                    onClick={() => add(kind as Item["kind"])}
                  >
                    <Icon size={24} strokeWidth={1.3} />
                    {label}
                  </button>
                );
              })}
            </div>
            <small>{plan.items.length} / 16 elementos</small>
          </div>
          <div className="kitchen-item-editor" ref={moduleEditor}>
            <p className="eyebrow">03 / LOS DETALLES</p>
            {current ? (
              <>
                <h2>{modelName(current)}</h2>
                {current.kind === "space" && (
                  <button
                    className="button kitchen-fill-space"
                    disabled={
                      !placementSlots.some(
                        (slot) => slot.replaceId === current.id,
                      )
                    }
                    onClick={() =>
                      setPlacement(
                        placementSlots.find(
                          (slot) => slot.replaceId === current.id,
                        ),
                      )
                    }
                  >
                    <Plus size={17} /> Elegir un mueble para este espacio
                  </button>
                )}
                <div className="kitchen-measures">
                  <label>
                    Pared
                    <select
                      value={current.wall}
                      onChange={(event) =>
                        edit({
                          ...current,
                          wall: event.target.value as "a" | "b",
                        })
                      }
                    >
                      <option value="a">Pared A</option>
                      {plan.layout === "l" && (
                        <option value="b">Pared B</option>
                      )}
                    </select>
                  </label>
                  <label>
                    Ubicación
                    <select
                      value={current.row}
                      onChange={(event) =>
                        edit({
                          ...current,
                          row: event.target.value as Item["row"],
                        })
                      }
                    >
                      <option value="base">Bajo</option>
                      <option
                        value="wall"
                        disabled={
                          current.kind !== "furniture" &&
                          current.kind !== "space"
                        }
                      >
                        Alacena
                      </option>
                      <option value="tall">Columna alta</option>
                    </select>
                  </label>
                </div>
                <div className="kitchen-measures three">
                  {(["width", "height", "depth"] as const).map((key) => (
                    <label key={key}>
                      {names[key]} · mm
                      <input
                        type="number"
                        step="10"
                        min={
                          current.kind === "furniture"
                            ? product?.limits[key].min
                            : 100
                        }
                        max={
                          current.kind === "furniture"
                            ? product?.limits[key].max
                            : { width: 2000, height: 2600, depth: 1000 }[key]
                        }
                        value={
                          current.kind === "furniture"
                            ? current.config[key]
                            : current[key]
                        }
                        onChange={(event) =>
                          current.kind === "furniture"
                            ? configure({
                                ...current.config,
                                [key]: Number(event.target.value),
                              })
                            : edit({
                                ...current,
                                [key]: Number(event.target.value),
                              })
                        }
                      />
                    </label>
                  ))}
                </div>
                {current.kind === "furniture" && product ? (
                  <>
                    <div className="kitchen-measures">
                      <label>
                        Columnas
                        <select
                          value={current.config.modules}
                          onChange={(event) =>
                            configure({
                              ...current.config,
                              modules: Number(event.target.value),
                            })
                          }
                        >
                          {getConstructionOptions(
                            product,
                            current.config,
                          ).modules.map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Repisas por columna
                        <select
                          value={current.config.shelves}
                          onChange={(event) =>
                            configure({
                              ...current.config,
                              shelves: Number(event.target.value),
                            })
                          }
                        >
                          {getConstructionOptions(
                            product,
                            current.config,
                          ).shelves.map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <DoorLayoutSelector
                      value={current.config.doors}
                      options={
                        getConstructionOptions(product, current.config).doors
                      }
                      onChange={(doors) => {
                        const front =
                          doors === "none"
                            ? "melamine"
                            : getFrontOptions(product).includes(
                                  current.config.front ?? "melamine",
                                )
                              ? current.config.front
                              : getFrontOptions(product)[0];
                        configure({
                          ...current.config,
                          doors,
                          front,
                          ...(front && front !== "melamine"
                            ? { handle: "exterior" as const }
                            : {}),
                        });
                      }}
                    />
                    {current.config.doors !== "none" && (
                      <FrontSelector
                        value={current.config.front}
                        options={getFrontOptions(product)}
                        onChange={(front) =>
                          configure({
                            ...current.config,
                            front,
                            ...(front !== "melamine"
                              ? { handle: "exterior" as const }
                              : {}),
                          })
                        }
                      />
                    )}
                    {current.config.doors !== "none" && (
                      <label className="kitchen-name">
                        Tipo de apertura
                        <select
                          value={current.config.handle}
                          disabled={
                            !!current.config.front &&
                            current.config.front !== "melamine"
                          }
                          onChange={(event) =>
                            configure({
                              ...current.config,
                              handle: event.target.value as Config["handle"],
                            })
                          }
                        >
                          <option value="push">Sin jalador · Push</option>
                          <option value="exterior">Jalador exterior</option>
                          <option value="embutido">Jalador embutido</option>
                        </select>
                      </label>
                    )}
                    <label className="kitchen-name">
                      Acabado exterior
                      <select
                        value={current.config.finish}
                        onChange={(event) =>
                          configure({
                            ...current.config,
                            finish: event.target.value,
                          })
                        }
                      >
                        {settings.materials.map((material) => (
                          <option value={material.id} key={material.id}>
                            {materialLabel(material)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="kitchen-finish-strip">
                      {settings.materials
                        .filter((material) => material.active)
                        .map((material) => (
                          <button
                            key={material.id}
                            title={materialLabel(material)}
                            aria-label={materialLabel(material)}
                            aria-pressed={current.config.finish === material.id}
                            onClick={() =>
                              configure({
                                ...current.config,
                                finish: material.id,
                              })
                            }
                          >
                            <MaterialSwatch material={material} />
                          </button>
                        ))}
                    </div>
                    <MaterialDetails
                      material={(snapshot
                        ? (quote?.materials ?? settings.materials)
                        : settings.materials
                      ).find(
                        (material) => material.id === current.config.finish,
                      )}
                      label="Exterior del módulo"
                    />
                    <label className="kitchen-name">
                      Acabado interior
                      <select
                        value={current.config.interior}
                        onChange={(event) =>
                          configure({
                            ...current.config,
                            interior: event.target.value,
                          })
                        }
                      >
                        <option value="same">Igual al exterior</option>
                        {settings.materials.map((material) => (
                          <option value={material.id} key={material.id}>
                            {materialLabel(material)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {current.config.interior !== "same" && (
                      <MaterialDetails
                        material={(snapshot
                          ? (quote?.materials ?? settings.materials)
                          : settings.materials
                        ).find(
                          (material) => material.id === current.config.interior,
                        )}
                        label="Interior del módulo"
                      />
                    )}
                  </>
                ) : current.kind === "furniture" ? (
                  <p>
                    Este modelo ya no está en el catálogo actual. Puedes
                    conservar el diseño guardado o sustituir el módulo.
                  </p>
                ) : (
                  <p className="kitchen-help">
                    Reserva de espacio para coordinar con las medidas reales del
                    equipo. No incluye suministro, instalaciones ni piezas de
                    melamina.
                  </p>
                )}
              </>
            ) : (
              <div className="kitchen-empty">
                <Square size={35} />
                <p>
                  Selecciona un módulo de tu cocina para ajustar sus detalles.
                </p>
              </div>
            )}
          </div>
        </section>
        {saved && (
          <section className="kitchen-contact">
            <h2>De tu idea al taller.</h2>
            <p>
              Comparte esta cocina con nuestro equipo para revisar medidas,
              herrajes y acabados.
            </p>
            <ContactLinks
              settings={settings}
              message={`Hola, El capo. Quiero revisar mi cocina ${name}: ${location.origin}/cocinas?cocina=${saved.id}. Presupuesto referencial ${money(saved.result.price)}.`}
            />
          </section>
        )}
        {(stored.length > 0 || historyError) && (
          <section className="kitchen-history">
            <h2>Tus cocinas guardadas</h2>
            <p>
              Estos diseños están asociados a este navegador. Conserva sus
              enlaces para abrirlos desde otro equipo.
            </p>
            {historyError && <p role="status">{historyError}</p>}
            <div>
              {stored.map((item) => (
                <a key={item.id} href={"/cocinas?cocina=" + item.id}>
                  <ChefHat size={20} />
                  <span>{item.name || "Mi cocina"}</span>
                  <ArrowUpRight size={18} />
                </a>
              ))}
            </div>
          </section>
        )}
      </main>
      {placement && (
        <KitchenBuilderDialog
          key={placement.id}
          space={placement}
          products={products}
          settings={settings}
          onClose={() => setPlacement(undefined)}
          onAdd={placeModule}
        />
      )}
      <Footer settings={settings} />
    </>
  );
}
