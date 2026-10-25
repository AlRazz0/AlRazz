import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  RotateCcw,
  Undo2,
  Redo2,
  Save,
  Box,
  Ruler,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StudioDimensionControl } from "./StudioDimensionControl";
import { createLiveFurniturePreview, type LiveFurniturePreview } from "./live-furniture-preview";
import { Switch } from "@/components/ui/switch";
import { api } from "../lib/api";
import {
  getConstruction,
  getConstructionOptions,
  getFrontOptions,
  money,
} from "../lib/furniture";
import type { Config } from "../lib/furniture";
import type { PublicProduct, PublicSettings, Quote, Design } from "./types";
import { Header, Footer } from "./App";
import { Choice } from "./UI";
import Viewer, { type View, type ViewerHandle } from "./Viewer";
import { materialLabel, materialBrands } from "./materials";
import {
  MaterialDetails,
  MaterialSource,
  MaterialSwatch,
} from "./MaterialSwatch";
import { DoorLayoutSelector, FrontSelector } from "./FrontSelector";
import { ExtraSelector } from "./ExtraSelector";
import { constructionDescriptions } from "./construction-labels";
import ModelShowcase from "./ModelShowcase";
import { ContactLinks } from "./ContactLinks";
import { QuoteRequestForm } from "./QuoteRequestForm";
import "./design-studio.css";
const searchText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
const dimensionLabels = { width: "Ancho", height: "Alto", depth: "Fondo" };
export default function Configurator() {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [product, setProduct] = useState<PublicProduct>();
  const [settings, setSettings] = useState<PublicSettings>();
  const [config, setConfig] = useState<Config>();
  const [renderConfig, setRenderConfig] = useState<Config>();
  const [visualDraft, setVisualDraft] = useState<Config>();
  const [visualDirty, setVisualDirty] = useState(false);
  const [quoteKey, setQuoteKey] = useState("");
  const revision = useRef(0);
  const editRevision = useRef(0);
  const [inputReset, setInputReset] = useState(0);
  const lastVisual = useRef<(LiveFurniturePreview & { productId: string; materials: PublicSettings["materials"] }) | undefined>(undefined);
  const liveSettings = useRef<PublicSettings>(undefined);
  const [quote, setQuote] = useState<Quote>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quoteError, setQuoteError] = useState("");
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Design>();
  const [ownsSaved, setOwnsSaved] = useState(false);
  const [quoteContacts, setQuoteContacts] = useState(false);
  const [snapshot, setSnapshot] = useState(false);
  const [past, setPast] = useState<Config[]>([]);
  const [future, setFuture] = useState<Config[]>([]);
  const [view, setView] = useState<View>("iso");
  const [open, setOpen] = useState(false);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showReference, setShowReference] = useState(true);
  const [showEnvironment, setShowEnvironment] = useState(true);
  const [brandFilter, setBrandFilter] = useState("all");
  const [boardFilter, setBoardFilter] = useState("all");
  const [finishSearch, setFinishSearch] = useState("");
  const [dimensionUnit, setDimensionUnit] = useState<"cm" | "mm">("cm");
  const viewer = useRef<ViewerHandle>(null);
  function load() {
    setLoading(true);
    setError("");
    api("action=catalog")
      .then(async (d) => {
        setProducts(d.products);
        setSettings(d.settings);
        liveSettings.current = d.settings;
        const params = new URLSearchParams(location.search);
        const id = params.get("d");
        if (id) {
          // A public snapshot URL is read access, never proof of ownership.
          // Finish the owner-cookie lookup before exposing save/contact actions.
          const [{ design: saved }, own] = await Promise.all([
            api<{design:Design}>("action=design&id=" + encodeURIComponent(id)),
            api<{designs:Design[]}>("action=designs").catch(() => ({designs:[]})),
          ]);
          setSaved(saved);
          setOwnsSaved(own.designs.some(design => design.id === saved.id && design.version === saved.version));
          setProduct(saved.product);
          setConfig(saved.config);
          setRenderConfig(saved.config);
          setQuote(saved.result);
          setQuoteKey(JSON.stringify({productId:saved.product.id, config:saved.config}));
          setSettings({ ...d.settings, materials: saved.materials });
          setSnapshot(true);
        } else {
          const p =
            d.products.find(
              (p: PublicProduct) => p.id === params.get("producto"),
            ) || d.products[0];
          if (p) {
            const requestedFinish = params.get("acabado");
            const initialConfig = requestedFinish && d.settings.materials.some((material: PublicSettings["materials"][number]) => material.active && material.id === requestedFinish)
              ? { ...p.defaults, finish: requestedFinish }
              : p.defaults;
            setProduct(p);
            setConfig(initialConfig);
            setRenderConfig(p.defaults);
            setQuote(p.preview);
            setQuoteKey(JSON.stringify({productId:p.id, config:p.defaults}));
          } else
            setError(
              "Todavía no hay modelos publicados. El administrador puede activar uno desde el panel.",
            );
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);
  useEffect(() => {
    if (!product || !config || snapshot) return;
    const abort = new AbortController();
    const sequence = ++revision.current;
    setPending(true);
    const timer = setTimeout(async () => {
      try {
        const r = await fetch("/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: product.id, config }),
          signal: abort.signal,
        });
        const d = (await r.json()) as Quote & { error?: string };
        if (!r.ok)
          throw Error(d.error || "No se pudo calcular esta configuración.");
        if (abort.signal.aborted || sequence !== revision.current) return;
        setQuote(d);
        setQuoteKey(JSON.stringify({productId:product.id, config}));
        setRenderConfig(config);
        setQuoteError("");
      } catch (e) {
        if (!abort.signal.aborted && sequence === revision.current)
          setQuoteError(e instanceof Error ? e.message : "Error de conexión.");
      } finally {
        if (!abort.signal.aborted && sequence === revision.current) setPending(false);
      }
    }, 200);
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [product, config, snapshot]);
  function change(next: Config) {
    setVisualDraft(undefined); setVisualDirty(false);
    setInputReset(value => value + 1);
    if (config && JSON.stringify(next) === JSON.stringify(config)) return;
    revision.current++; editRevision.current++; setPending(true); setQuoteError("");
    setQuoteContacts(false);
    if (liveSettings.current) setSettings(liveSettings.current);
    const live = products.find((p) => p.id === product?.id);
    if (live) setProduct(live);
    if (config) setPast((p) => [...p.slice(-39), config]);
    setFuture([]);
    setConfig(next);
    setSnapshot(false);
    setSaved(undefined);
  }
  function pick(id: string) {
    setQuoteContacts(false);
    const p = products.find((p) => p.id === id);
    if (!p) return;
    revision.current++; editRevision.current++; setInputReset(value => value + 1); setVisualDraft(undefined); setVisualDirty(false); setPending(true);
    setProduct(p);
    if (liveSettings.current) setSettings(liveSettings.current);
    setConfig({ ...p.defaults });
    setRenderConfig({ ...p.defaults });
    setQuote(p.preview);
    setQuoteKey(JSON.stringify({productId:p.id,config:p.defaults}));
    setQuoteError("");
    setPast([]);
    setFuture([]);
    setSnapshot(false);
    setSaved(undefined);
    history.replaceState(null, "", "/configurar?producto=" + id);
  }
  function undo() {
    setQuoteContacts(false);
    if (!config || !past.length) return;
    revision.current++; editRevision.current++; setInputReset(value => value + 1); setVisualDraft(undefined); setVisualDirty(false); setPending(true); setQuoteError("");
    setFuture([config, ...future]);
    setConfig(past[past.length - 1]);
    setPast(past.slice(0, -1));
    setSnapshot(false);
    setSaved(undefined);
  }
  function redo() {
    setQuoteContacts(false);
    if (!config || !future.length) return;
    revision.current++; editRevision.current++; setInputReset(value => value + 1); setVisualDraft(undefined); setVisualDirty(false); setPending(true); setQuoteError("");
    setPast([...past, config]);
    setConfig(future[0]);
    setFuture(future.slice(1));
    setSnapshot(false);
    setSaved(undefined);
  }
  async function save(requestQuote = false) {
    if (!product || !config || !currentQuote) return;
    const submittedRevision = editRevision.current;
    setSaving(true);
    try {
      const d = await api("", {
        op: "save-design",
        productId: product.id,
        config,
        ...(saved && !ownsSaved ? {quantity:saved.quantity,...(saved.name ? {name:saved.name} : {})} : {}),
      });
      if (submittedRevision === editRevision.current) {
        setSaved(d.design);
        setOwnsSaved(true);
        setQuoteContacts(requestQuote);
        setProduct(d.design.product);
        setConfig(d.design.config);
        setRenderConfig(d.design.config);
        setQuote(d.design.result);
        setQuoteKey(JSON.stringify({productId:d.design.product.id,config:d.design.config}));
        setSettings(current => current ? {...current,materials:d.design.materials} : current);
        setSnapshot(true);
        setPending(false);
        setQuoteError("");
      }
      toast.success(saved && !ownsSaved
        ? "Se guardó una copia propia con la tarifa vigente. La versión compartida se conserva."
        : "Tu diseño se guardó en Mis diseños.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }
  async function requestDesignQuote() {
    if (saved && ownsSaved) setQuoteContacts(true);
    else await save(true);
  }
  function capture() {
    const image = viewer.current?.capture();
    if (image) {
      const a = document.createElement("a");
      a.href = image;
      a.download = "El-capo-" + product?.id + ".png";
      a.click();
    } else toast.error("La imagen 3D aún no está disponible.");
  }
  const previewProduct = visualDirty ? products.find(model => model.id === product?.id) ?? product : product;
  const previewMaterials = visualDirty ? liveSettings.current?.materials ?? settings?.materials : settings?.materials;
  const previewBuilder = useMemo(() => {
    if (!previewProduct || !previewMaterials) return;
    try { return createLiveFurniturePreview(previewProduct, previewMaterials); } catch { return; }
  }, [previewProduct, previewMaterials]);
  const visualResult = useMemo(() => {
    if (!previewBuilder || !config || (snapshot && !visualDirty)) return;
    try { return {visual:previewBuilder(visualDraft ?? config)}; } catch (cause) { return {issue:cause instanceof Error ? cause.message : "Revisa las medidas y distribución."}; }
  }, [previewBuilder, config, visualDraft, snapshot, visualDirty]);
  const localVisual = visualResult?.visual;
  const localIssue = visualResult?.issue;
  const currentQuote = !!quote && !!product && !!config && !pending && !quoteError && !visualDirty &&
    quoteKey === JSON.stringify({productId:product.id,config});
  const previewIssue = currentQuote ? undefined : localIssue;
  useEffect(() => {
    if (currentQuote && quote && product && renderConfig && settings)
      lastVisual.current = {geometry:quote.geometry,config:renderConfig,productId:product.id,materials:settings.materials};
    else if (localVisual && product && previewMaterials)
      lastVisual.current = {...localVisual, productId: product.id, materials: previewMaterials};
  }, [currentQuote,quote,renderConfig,settings,localVisual,product,previewMaterials]);
  function previewDimension(key: "width" | "height" | "depth", value: number | null, dirty: boolean) {
    editRevision.current++;
    setVisualDirty(dirty);
    if (!dirty) setVisualDraft(undefined);
    else if (config && value !== null) setVisualDraft({...config,[key]:value});
  }
  if (loading)
    return (
      <>
        <Header compact />
        <div className="loading-page">Cargando tu mueble…</div>
      </>
    );
  if (error || !product || !config || !settings)
    return (
      <>
        <Header />
        <div className="empty-page">
          <h1>Tu espacio está casi listo.</h1>
          <p role="alert">{error}</p>
          <button className="button rust" onClick={load}>
            Reintentar
          </button>
          <a href="/">Volver al catálogo</a>
        </div>
      </>
    );
  const previousVisual = lastVisual.current?.productId === product.id ? lastVisual.current : undefined;
  const liveVisual = (snapshot && !visualDirty) || currentQuote ? undefined : localVisual ?? previousVisual;
  const displayedConfig = liveVisual?.config ?? renderConfig ?? config;
  const displayedGeometry = liveVisual?.geometry ?? quote?.geometry;
  const displayedMaterials = localVisual ? previewMaterials! : liveVisual ? previousVisual?.materials ?? settings.materials : settings.materials;
  const consultation = product.showPrice === false || quote?.price === null;
  const construction = getConstruction(product);
  const distributionOptions = getConstructionOptions(product, config);
  const finish = settings.materials.find((m) => m.id === config.finish);
  const interiorFinish =
    config.interior === "same"
      ? finish
      : settings.materials.find((material) => material.id === config.interior);
  const filteredFinishes = settings.materials.filter(
    (material) =>
      material.active &&
      (brandFilter === "all" || material.brand === brandFilter) &&
      (boardFilter === "all" ||
        (material.board || "standard") === boardFilter) &&
      searchText(
        `${material.name} ${material.brand || ""} ${material.code || ""}`,
      ).includes(searchText(finishSearch.trim())),
  );
  return (
    <>
      <Header compact />
      <div className="config-top">
        <a href="/#catalogo">
          <ArrowLeft size={16} /> Colección
        </a>
        <span>Tu diseño, a tu manera.</span>
        <a href="/carrito">
          Mis diseños <ArrowUpRight size={16} />
        </a>
      </div>
      <main id="main-content" tabIndex={-1} className="config-layout design-studio">
        <section className="stage" aria-label="Vista previa de tu mueble">
          <div className="stage-title">
            <span>COLECCIÓN MODULAR</span>
            <span>Melamina · 18 mm</span>
          </div>
          {displayedGeometry ? (
            <Viewer
              ref={viewer}
              panels={displayedGeometry}
              materials={displayedMaterials}
              {...displayedConfig}
              view={view}
              open={open}
              reference={showReference}
              environment={showEnvironment}
              dimensions={showDimensions}
            />
          ) : (
            <div className="loading-page">Preparando vista 3D…</div>
          )}
          <div className="stage-tag">
            <Box size={15} />
            {visualDirty && !previewIssue
              ? "Vista previa en tiempo real"
              : snapshot
              ? "Diseño guardado"
              : quoteError || previewIssue
                ? "Última vista válida"
                : "Vista 3D interactiva"}
          </div>
          <div className="stage-controls">
            <div className="view-buttons" aria-label="Vistas del mueble">
              {(["iso", "front", "side", "top"] as View[]).map((v, i) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={view === v ? "active" : ""}
                >
                  {["3D", "Frente", "Lado", "Arriba"][i]}
                </button>
              ))}
            </div>
            <button
              className="icon-button"
              onClick={capture}
              title="Descargar imagen PNG"
              aria-label="Descargar imagen PNG"
            >
              <Camera size={19} />
            </button>
          </div>
          {showDimensions && (
            <div className="dimension-caption">
              <Ruler size={16} />
              <b>{displayedConfig.width / 10}</b> ancho ×{" "}
              <b>{displayedConfig.height / 10}</b> alto ×{" "}
              <b>{displayedConfig.depth / 10}</b> fondo <span>cm</span>
            </div>
          )}
          <p className="stage-hint">
            {showReference
              ? "Persona de referencia · 1,70 m"
              : "Arrastra para girar · Rueda para acercarte"}
          </p>
          <div className="stage-options">
            <label>
              <Switch
                checked={open}
                onCheckedChange={setOpen}
                disabled={displayedConfig.doors === "none"}
                aria-label="Abrir puertas"
              />{" "}
              Abrir puertas
            </label>
            <label>
              <Switch
                checked={showDimensions}
                onCheckedChange={setShowDimensions}
                aria-label="Mostrar medidas"
              />{" "}
              Medidas
            </label>
            <label>
              <Switch
                checked={showReference}
                onCheckedChange={setShowReference}
                aria-label="Mostrar persona de referencia de 1,70 metros"
              />
              Persona · 1,70 m
            </label>
            <label>
              <Switch
                checked={showEnvironment}
                onCheckedChange={setShowEnvironment}
                aria-label="Mostrar ambiente"
              />
              Ambiente
            </label>
          </div>
        </section>
        <aside className="custom-panel" aria-label="Personalizar tu mueble">
          <p className="eyebrow">ESTUDIO DE DISEÑO</p>
          <div className="config-heading">
            <h1 id="opciones-diseno" tabIndex={-1}>{product.name}</h1>
            <div>
              <button
                className="icon-button"
                onClick={undo}
                disabled={!past.length}
                aria-label="Deshacer"
              >
                <Undo2 size={18} />
              </button>
              <button
                className="icon-button"
                onClick={redo}
                disabled={!future.length}
                aria-label="Rehacer"
              >
                <Redo2 size={18} />
              </button>
            </div>
          </div>
          <p className="config-description">{product.description}</p>
          <Choice
            label="Modelo"
            value={product.id}
            options={
              products.some((p) => p.id === product.id)
                ? products.map((p) => ({
                    value: p.id,
                    label: `${p.category} · ${p.name}`,
                  }))
                : [
                    { value: product.id, label: product.name + " (guardado)" },
                    ...products.map((p) => ({
                      value: p.id,
                      label: `${p.category} · ${p.name}`,
                    })),
                  ]
            }
            onChange={pick}
          />
          <Tabs defaultValue="medidas" className="config-tabs" onValueChange={() => {
            setVisualDraft(undefined); setVisualDirty(false); setInputReset(value => value + 1);
          }}>
            <TabsList variant="line" aria-label="Pasos para personalizar tu mueble">
              <TabsTrigger value="medidas"><span className="studio-step" aria-hidden="true">01</span> Medidas</TabsTrigger>
              <TabsTrigger value="distribucion"><span className="studio-step" aria-hidden="true">02</span> Distribución</TabsTrigger>
              <TabsTrigger value="acabados"><span className="studio-step" aria-hidden="true">03</span> Acabados</TabsTrigger>
            </TabsList>
            <TabsContent value="medidas">
              <div className="studio-dimension-heading">
                <p className="tab-intro">Empecemos por tu espacio.</p>
                <div className="studio-unit-switch" role="group" aria-label="Unidad de las medidas">
                  {(["cm", "mm"] as const).map((unit) => (
                    <button key={unit} type="button" aria-pressed={dimensionUnit === unit} onClick={() => { setVisualDraft(undefined); setVisualDirty(false); setDimensionUnit(unit); }}>{unit}</button>
                  ))}
                </div>
              </div>
              {(["width", "height", "depth"] as const).map(key => (
                <StudioDimensionControl key={product.id + key} label={dimensionLabels[key]} value={config[key]}
                  min={product.limits[key].min} max={product.limits[key].max} unit={dimensionUnit} resetKey={inputReset}
                  onPreview={(value,dirty) => previewDimension(key,value,dirty)}
                  onCommit={value => change({...config,[key]:value})} />
              ))}
              <p className="small-note">
                Los tableros siempre tienen 18 mm de espesor.
              </p>
            </TabsContent>
            <TabsContent value="distribucion">
              <p className="tab-intro">
                {constructionDescriptions[construction.kind]}
              </p>
              {distributionOptions.modules.length > 1 && (
                <Choice
                  label="Módulos verticales"
                  value={String(config.modules)}
                  options={distributionOptions.modules.map((n) => ({
                    value: String(n),
                    label: n + (n === 1 ? " módulo" : " módulos"),
                  }))}
                  onChange={(v) => {
                    const next = { ...config, modules: Number(v) };
                    const options = getConstructionOptions(product, next);
                    if (!options.shelves.includes(next.shelves))
                      next.shelves = options.shelves[0];
                    change(next);
                  }}
                />
              )}
              {distributionOptions.shelves.length > 1 && (
                <Choice
                  label={
                    construction.kind === "desk-storage"
                      ? "Repisas en el módulo lateral"
                      : construction.kind === "wardrobe"
                        ? "Repisas en las columnas sin barra"
                        : "Repisas por módulo"
                  }
                  value={String(config.shelves)}
                  options={distributionOptions.shelves.map((n) => ({
                    value: String(n),
                    label: n + (n === 1 ? " repisa" : " repisas"),
                  }))}
                  onChange={(v) => change({ ...config, shelves: Number(v) })}
                />
              )}
              {construction.kind === "wardrobe" && (
                <p className="small-note">
                  Maletero superior de {construction.loftHeight / 10} cm y barra
                  para colgar en{" "}
                  {construction.hangingModules === 1
                    ? "la primera columna de la izquierda"
                    : `las primeras ${construction.hangingModules} columnas de la izquierda`}
                  .
                  {config.modules === construction.hangingModules &&
                    " Todas las columnas están destinadas a colgar ropa."}
                </p>
              )}
              {construction.kind === "kitchen-base" && (
                <p className="small-note">
                  Zócalo retranqueado de {construction.plinthHeight / 10} cm y
                  tapa completa. Módulo individual sin lavatorio ni
                  electrodomésticos.
                </p>
              )}
              {distributionOptions.doors.length > 1 && (
                <DoorLayoutSelector
                  value={config.doors}
                  options={distributionOptions.doors}
                  onChange={(doors) => {
                    const front =
                      doors === "none"
                        ? "melamine"
                        : getFrontOptions(product).includes(
                              config.front ?? "melamine",
                            )
                          ? config.front
                          : getFrontOptions(product)[0];
                    change({
                      ...config,
                      doors,
                      front,
                      ...(front && front !== "melamine"
                        ? { handle: "exterior" as const }
                        : {}),
                    });
                  }}
                />
              )}
              {config.doors !== "none" && (
                <FrontSelector
                  value={config.front}
                  options={getFrontOptions(product)}
                  onChange={(front) =>
                    change({
                      ...config,
                      front,
                      ...(front !== "melamine"
                        ? { handle: "exterior" as const }
                        : {}),
                    })
                  }
                />
              )}
              {config.doors !== "none" && (
                <Choice
                  label="Tipo de apertura"
                  value={config.handle}
                  options={
                    config.front && config.front !== "melamine"
                      ? [{ value: "exterior", label: "Jalador exterior" }]
                      : [
                          { value: "push", label: "Sin jalador · Push" },
                          { value: "exterior", label: "Jalador exterior" },
                          { value: "embutido", label: "Jalador embutido" },
                        ]
                  }
                  onChange={(v) =>
                    change({ ...config, handle: v as Config["handle"] })
                  }
                />
              )}
              {config.doors !== "none" && (
                <p className="small-note">
                  El modelo y acabado exactos de los herrajes se confirman con
                  nuestro equipo.
                </p>
              )}
            </TabsContent>
            <TabsContent value="acabados">
              <p className="tab-intro">El acabado que hace tuyo el espacio.</p>
              <div className="finish-filters">
                <Choice
                  label="Marca"
                  value={brandFilter}
                  options={[
                    { value: "all", label: "Todas las marcas" },
                    ...materialBrands(
                      settings.materials.filter((m) => m.active),
                    ).map((brand) => ({ value: brand, label: brand })),
                  ]}
                  onChange={setBrandFilter}
                />
                <Choice
                  label="Tablero · 18 mm"
                  value={boardFilter}
                  options={[
                    { value: "all", label: "Todos" },
                    { value: "standard", label: "Estándar" },
                    { value: "rh", label: "RH · Antihumedad" },
                  ]}
                  onChange={setBoardFilter}
                />
              </div>
              <label className="material-search">
                Buscar acabado comercial
                <input
                  type="search"
                  value={finishSearch}
                  placeholder="Nombre, marca o código"
                  maxLength={100}
                  onChange={(event) => setFinishSearch(event.target.value)}
                />
              </label>
              <MaterialDetails material={finish} label="Exterior del mueble" />
              <MaterialSource material={finish} />
              <p className="material-result-count" role="status">
                {filteredFinishes.length} acabados de nuestra selección de
                catálogo
              </p>
              <div className="finish-grid">
                {filteredFinishes.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => change({ ...config, finish: f.id })}
                    className={config.finish === f.id ? "selected" : ""}
                    aria-pressed={config.finish === f.id}
                    aria-label={materialLabel(f)}
                  >
                    <MaterialSwatch material={f}>
                      {config.finish === f.id && <Check size={18} />}
                    </MaterialSwatch>
                    <small>{f.name}</small>
                    <small className="finish-meta">
                      {f.brand || "Colección inicial"}
                      {f.board === "rh" ? " · RH" : ""}
                    </small>
                  </button>
                ))}
              </div>
              {!filteredFinishes.length && (
                <p className="small-note finish-empty">
                  No hay acabados publicados con estos filtros. Prueba otra
                  marca o tipo de tablero.
                </p>
              )}
              <Choice
                label="Color interior"
                value={config.interior}
                options={[
                  { value: "same", label: "Igual al exterior" },
                  ...settings.materials
                    .filter((m) => m.active)
                    .map((m) => ({ value: m.id, label: materialLabel(m) })),
                ]}
                onChange={(v) => change({ ...config, interior: v })}
              />
              {interiorFinish && config.interior !== "same" && (
                <div>
                  <MaterialDetails
                    material={interiorFinish}
                    label="Interior del mueble"
                  />
                  <MaterialSource material={interiorFinish} />
                </div>
              )}
              <p className="small-note">
                RH significa resistente a la humedad (moisture-resistant); no es
                impermeable. Cada variante conserva su propia tarifa.
              </p>
              <p className="small-note finish-disclaimer">
                Selección de los catálogos de las marcas. Las imágenes y los
                tonos en pantalla son referenciales. Confirmamos muestra física,
                disponibilidad local y precio antes de fabricar.
              </p>
            </TabsContent>
          </Tabs>
          <ExtraSelector product={product} config={config} onChange={change} />
          {(quoteError || previewIssue) && (
            <p className="error-box" role="alert">
              {quoteError || previewIssue}
            </p>
          )}
          {snapshot && (
            <p className="info-box">
              Estás viendo una versión guardada. Al editarla, se comprobará la
              tarifa actual.
            </p>
          )}
          <div className="service-options">
            <label>
              <Switch
                checked={config.install}
                onCheckedChange={(v) => change({ ...config, install: v })}
                aria-label="Incluir instalación"
              />{" "}
              Incluir instalación
            </label>
            <label>
              <Switch
                checked={config.transport}
                onCheckedChange={(v) => change({ ...config, transport: v })}
                aria-label="Incluir transporte"
              />{" "}
              Incluir transporte
            </label>
          </div>
          <div className="price-area" id="resumen-diseno" tabIndex={-1}>
            {!consultation && <div>
              <span>Tu precio referencial</span>
              <strong aria-live="polite">
                {visualDirty
                  ? "Ajustando medidas…"
                  : !currentQuote && !quoteError
                  ? "Calculando…"
                  : quoteError
                    ? "Revisa las medidas"
                    : quote && quote.price != null
                      ? money(quote.price)
                      : "—"}
              </strong>
            </div>}
            <p>
              {settings.availability} · desde{" "}
              {Math.max(product.weeks, settings.leadWeeks)} semanas, por
              confirmar
            </p>
            <button
              className={`button full ${consultation ? "chrome-quote" : "rust"}`}
              onClick={() => consultation ? void requestDesignQuote() : void save()}
              disabled={saving || !currentQuote}
            >
              {saving ? "Guardando…" : consultation ? saved && !ownsSaved ? "Guardar copia y cotizar" : "Cotizar" : saved && !ownsSaved ? "Guardar una copia propia" : "Guardar mi diseño"}
              {consultation ? <ArrowUpRight size={18} /> : <Save size={18} />}
            </button>
            {saved && !ownsSaved && <div className="small-note"><p>Este enlace muestra una versión compartida. Para adjuntarla a tu solicitud guardaremos una copia propia con las tarifas actuales.</p>{!consultation && <button type="button" className="text-link" disabled={saving || !currentQuote} onClick={() => void requestDesignQuote()}>Guardar copia propia y solicitar cotización <ArrowUpRight size={17}/></button>}</div>}
            {saved && ownsSaved && <QuoteRequestForm key={saved.id + saved.version} sources={[{kind:"design",id:saved.id,version:saved.version}]} projectTitle={saved.name || product.name} initiallyOpen={quoteContacts}/>}
            {quoteContacts && saved && ownsSaved && (
              <ContactLinks settings={settings} message={`Hola, El capo. Quisiera cotizar mi diseño de ${product.name}, con las medidas y acabados que elegí: ${location.origin}/configurar?d=${saved.id}`} />
            )}
            {saved && ownsSaved && (
              <a className="saved-link" href="/carrito">
                <Check size={17} /> Guardado. Ver mis diseños <ArrowRightIcon />
              </a>
            )}
            <p className="small-note">
              {consultation
                ? "Guardaremos una versión para adjuntarla a tu solicitud. El taller confirmará el precio según las medidas y acabados."
                : "El importe y la fecha se confirman después de la validación técnica y comercial."}
            </p>
          </div>
          <div className="config-bottom">
            <button
              onClick={() => {
                change({ ...product.defaults });
                setView("iso");
                setOpen(false);
              }}
            >
              <RotateCcw size={15} /> Restablecer
            </button>
          </div>
        </aside>
      </main>
      <div className="studio-mobile-summary" aria-label="Resumen de tu diseño">
        <div>
          <span>{product.name}</span>
          <strong>{visualDirty ? "Ajustando medidas…" : !currentQuote && !quoteError ? "Actualizando…" : quoteError ? "Revisa las medidas" : consultation ? "Por cotizar" : quote?.price != null ? money(quote.price) : "Tu diseño"}</strong>
        </div>
        <a href="#resumen-diseno" onClick={() => document.getElementById("resumen-diseno")?.focus({ preventScroll: true })}>Ver resumen <ArrowUpRight size={17} aria-hidden="true" /></a>
      </div>
      <ModelShowcase
        product={product}
        geometry={quote?.geometry ?? []}
        materials={settings.materials}
        config={displayedConfig}
        pending={!currentQuote}
      />
      <Footer settings={settings} />
    </>
  );
}
function ArrowRightIcon() {
  return <ArrowUpRight size={16} />;
}
