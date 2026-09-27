import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Download,
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { api, download } from "../lib/api";
import { money } from "../lib/furniture";
import type { Config } from "../lib/furniture";
import type { PublicProduct, PublicSettings, Quote, Design } from "./types";
import { Header, Footer } from "./App";
import { Choice } from "./UI";
import Viewer, { type View, type ViewerHandle } from "./Viewer";
import { materialLabel, materialBrands } from "./materials";
const dimensionLabels = { width: "Ancho", height: "Alto", depth: "Fondo" };
const doorOptions = [
  { value: "none", label: "Todo abierto" },
  { value: "lower", label: "Puertas inferiores" },
  { value: "full", label: "Puertas completas" },
];
export function exportCuts(q: Quote, id = "AlRazz") {
  const cell = (v: unknown) => {
    const text = String(v);
    const safe = /^[\s]*[=+@-]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const csv =
    "\ufeff" +
    [
      "DESPIECE PRELIMINAR — NO AUTORIZADO PARA PRODUCCIÓN",
      "Código;Pieza;Cantidad;Largo/alto mm;Ancho mm;Espesor mm;Material;Veta;Superior;Inferior;Izquierdo;Derecho",
      ...q.panels.map((p) =>
        [
          p.id,
          p.name,
          1,
          p.length,
          p.width,
          18,
          p.materialName,
          p.grain,
          p.edges.top,
          p.edges.bottom,
          p.edges.left,
          p.edges.right,
        ]
          .map(cell)
          .join(";"),
      ),
    ].join("\r\n");
  download(id + "-despiece.csv", csv, "text/csv;charset=utf-8");
}
export default function Configurator() {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [product, setProduct] = useState<PublicProduct>();
  const [settings, setSettings] = useState<PublicSettings>();
  const [config, setConfig] = useState<Config>();
  const [renderConfig, setRenderConfig] = useState<Config>();
  const liveSettings = useRef<PublicSettings>(undefined);
  const [quote, setQuote] = useState<Quote>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quoteError, setQuoteError] = useState("");
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Design>();
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
  const [cuts, setCuts] = useState(false);
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
          const { design: saved } = await api(
            "action=design&id=" + encodeURIComponent(id),
          );
          setProduct(saved.product);
          setConfig(saved.config);
          setRenderConfig(saved.config);
          setQuote(saved.result);
          setSettings({ ...d.settings, materials: saved.materials });
          setSnapshot(true);
        } else {
          const p =
            d.products.find(
              (p: PublicProduct) => p.id === params.get("producto"),
            ) || d.products[0];
          if (p) {
            setProduct(p);
            setConfig(p.defaults);
            setRenderConfig(p.defaults);
            setQuote(p.preview);
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
        setQuote(d);
        setRenderConfig(config);
        setQuoteError("");
      } catch (e) {
        if (!abort.signal.aborted)
          setQuoteError(e instanceof Error ? e.message : "Error de conexión.");
      } finally {
        if (!abort.signal.aborted) setPending(false);
      }
    }, 200);
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [product, config, snapshot]);
  function change(next: Config) {
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
    const p = products.find((p) => p.id === id);
    if (!p) return;
    setProduct(p);
    if (liveSettings.current) setSettings(liveSettings.current);
    setConfig({ ...p.defaults });
    setPast([]);
    setFuture([]);
    setSnapshot(false);
    setSaved(undefined);
    history.replaceState(null, "", "/configurar?producto=" + id);
  }
  function undo() {
    if (!config || !past.length) return;
    setFuture([config, ...future]);
    setConfig(past[past.length - 1]);
    setPast(past.slice(0, -1));
    setSnapshot(false);
    setSaved(undefined);
  }
  function redo() {
    if (!config || !future.length) return;
    setPast([...past, config]);
    setConfig(future[0]);
    setFuture(future.slice(1));
    setSnapshot(false);
    setSaved(undefined);
  }
  async function save() {
    if (!product || !config || quoteError || pending) return;
    setSaving(true);
    try {
      const d = await api("", {
        op: "save-design",
        productId: product.id,
        config,
      });
      setSaved(d.design);
      toast.success("Tu diseño se guardó en Mis diseños.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }
  function capture() {
    const image = viewer.current?.capture();
    if (image) {
      const a = document.createElement("a");
      a.href = image;
      a.download = "AlRazz-" + product?.id + ".png";
      a.click();
    } else toast.error("La imagen 3D aún no está disponible.");
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
  const finish = settings.materials.find((m) => m.id === config.finish);
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
      <main className="config-layout">
        <section className="stage">
          <div className="stage-title">
            <span>COLECCIÓN MODULAR</span>
            <span>Melamina · 18 mm</span>
          </div>
          {quote ? (
            <Viewer
              ref={viewer}
              panels={quote.panels}
              materials={settings.materials}
              {...(renderConfig || config)}
              view={view}
              open={open}
              reference={showReference}
              environment={showEnvironment}
            />
          ) : (
            <div className="loading-page">Preparando vista 3D…</div>
          )}
          <div className="stage-tag">
            <Box size={15} />
            {snapshot
              ? "Diseño guardado"
              : quoteError
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
              <b>{config.width / 10}</b> ancho × <b>{config.height / 10}</b>{" "}
              alto × <b>{config.depth / 10}</b> fondo <span>cm</span>
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
                disabled={config.doors === "none"}
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
        <aside className="custom-panel">
          <p className="eyebrow">DISEÑADO POR TI</p>
          <div className="config-heading">
            <h1>{product.name}</h1>
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
                ? products.map((p) => ({ value: p.id, label: p.name }))
                : [
                    { value: product.id, label: product.name + " (guardado)" },
                    ...products.map((p) => ({ value: p.id, label: p.name })),
                  ]
            }
            onChange={pick}
          />
          <Tabs defaultValue="medidas" className="config-tabs">
            <TabsList variant="line">
              <TabsTrigger value="medidas">Medidas</TabsTrigger>
              <TabsTrigger value="distribucion">Distribución</TabsTrigger>
              <TabsTrigger value="acabados">Acabados</TabsTrigger>
            </TabsList>
            <TabsContent value="medidas">
              <p className="tab-intro">Cada centímetro tiene su lugar.</p>
              {(["width", "height", "depth"] as const).map((k) => (
                <div className="dimension-field" key={k}>
                  <div>
                    <label htmlFor={k}>{dimensionLabels[k]}</label>
                    <span>
                      <input
                        id={k}
                        aria-label={dimensionLabels[k] + " en milímetros"}
                        type="number"
                        min={product.limits[k].min}
                        max={product.limits[k].max}
                        step={10}
                        value={config[k]}
                        onChange={(e) =>
                          change({ ...config, [k]: Number(e.target.value) })
                        }
                      />{" "}
                      mm
                    </span>
                  </div>
                  <Slider
                    aria-label={dimensionLabels[k]}
                    min={product.limits[k].min}
                    max={product.limits[k].max}
                    step={10}
                    value={[config[k]]}
                    onValueChange={([v]) => change({ ...config, [k]: v })}
                  />
                  <div className="range-label">
                    <span>{product.limits[k].min / 10} cm</span>
                    <span>{product.limits[k].max / 10} cm</span>
                  </div>
                </div>
              ))}
              <p className="small-note">
                Los tableros siempre tienen 18 mm de espesor.
              </p>
            </TabsContent>
            <TabsContent value="distribucion">
              <p className="tab-intro">Espacio para lo que importa.</p>
              <Choice
                label="Módulos verticales"
                value={String(config.modules)}
                options={[1, 2, 3, 4, 5, 6].map((n) => ({
                  value: String(n),
                  label: n + " módulos",
                }))}
                onChange={(v) => change({ ...config, modules: Number(v) })}
              />
              <Choice
                label="Repisas por módulo"
                value={String(config.shelves)}
                options={[0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({
                  value: String(n),
                  label: n + " repisas",
                }))}
                onChange={(v) => change({ ...config, shelves: Number(v) })}
              />
              <Choice
                label="Puertas"
                value={config.doors}
                options={doorOptions}
                onChange={(v) =>
                  change({ ...config, doors: v as Config["doors"] })
                }
              />
              <Choice
                label="Tipo de apertura"
                value={config.handle}
                options={[
                  { value: "push", label: "Sin jalador · Push" },
                  { value: "exterior", label: "Jalador exterior" },
                  { value: "embutido", label: "Jalador embutido" },
                ]}
                onChange={(v) =>
                  change({ ...config, handle: v as Config["handle"] })
                }
              />
              <p className="small-note">
                El modelo y acabado exactos de los herrajes se confirman con
                nuestro equipo.
              </p>
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
              <p className="finish-name">
                Exterior ·{" "}
                <b>{finish ? materialLabel(finish) : config.finish}</b>
              </p>
              <div className="finish-grid">
                {settings.materials
                  .filter(
                    (m) =>
                      m.active &&
                      (brandFilter === "all" || m.brand === brandFilter) &&
                      (boardFilter === "all" ||
                        (m.board || "standard") === boardFilter),
                  )
                  .map((f) => (
                    <button
                      key={f.id}
                      onClick={() => change({ ...config, finish: f.id })}
                      className={config.finish === f.id ? "selected" : ""}
                      aria-pressed={config.finish === f.id}
                      aria-label={materialLabel(f)}
                    >
                      <span style={{ background: f.color }}>
                        {config.finish === f.id && <Check size={18} />}
                      </span>
                      <small>{f.name}</small>
                      <small className="finish-meta">
                        {f.brand || "Colección inicial"}
                        {f.board === "rh" ? " · RH" : ""}
                      </small>
                    </button>
                  ))}
              </div>
              {!settings.materials.some(
                (m) =>
                  m.active &&
                  (brandFilter === "all" || m.brand === brandFilter) &&
                  (boardFilter === "all" ||
                    (m.board || "standard") === boardFilter),
              ) && (
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
              <p className="small-note">
                RH significa resistente a la humedad (moisture-resistant); no es
                impermeable. Cada variante conserva su propia tarifa.
              </p>
              <p className="small-note finish-disclaimer">
                Tonos de pantalla aproximados. Confirmamos muestra física,
                disponibilidad y precio antes de fabricar.
              </p>
            </TabsContent>
          </Tabs>
          {quoteError && (
            <p className="error-box" role="alert">
              {quoteError}
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
          <div className="price-area">
            <div>
              <span>Tu precio referencial</span>
              <strong aria-live="polite">
                {pending
                  ? "Calculando…"
                  : quoteError
                    ? "Revisa las medidas"
                    : quote
                      ? money(quote.price)
                      : "—"}
              </strong>
            </div>
            <p>
              {settings.availability} · desde{" "}
              {Math.max(product.weeks, settings.leadWeeks)} semanas, por
              confirmar
            </p>
            <button
              className="button rust full"
              onClick={save}
              disabled={saving || pending || !!quoteError || !quote}
            >
              {saving ? "Guardando…" : "Guardar mi diseño"}
              <Save size={18} />
            </button>
            {saved && (
              <a className="saved-link" href="/carrito">
                <Check size={17} /> Guardado. Ver mis diseños <ArrowRightIcon />
              </a>
            )}
            <p className="small-note">
              El importe y la fecha se confirman después de la validación
              técnica y comercial.
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
            <button
              disabled={!quote || pending || !!quoteError}
              onClick={() => setCuts(true)}
            >
              <Download size={15} /> Ver despiece
            </button>
          </div>
        </aside>
      </main>
      <Dialog open={cuts} onOpenChange={setCuts}>
        <DialogContent className="cut-dialog">
          <DialogTitle>Despiece preliminar</DialogTitle>
          <DialogDescription>
            No autorizado para producción. Medidas en milímetros; primera
            medida: largo o alto. Requiere validación del taller.
          </DialogDescription>
          {quote && (
            <>
              <div className="cut-summary">
                <span>{quote.panels.length} piezas</span>
                <span>{quote.area.toFixed(2)} m² de melamina</span>
                <span>{quote.edges.toFixed(2)} m de tapacanto</span>
              </div>
              <div className="cut-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pieza</TableHead>
                      <TableHead>Largo/alto</TableHead>
                      <TableHead>Ancho</TableHead>
                      <TableHead>Espesor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quote.panels.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.name}</TableCell>
                        <TableCell>{p.length}</TableCell>
                        <TableCell>{p.width}</TableCell>
                        <TableCell>18</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="small-note">
                El CSV incluye material, veta y los cuatro bordes de cada pieza.
                La compatibilidad con tu versión de CutMaster debe validarse.
              </p>
              <button
                className="button rust"
                onClick={() => exportCuts(quote, product.id)}
              >
                Descargar CSV completo <Download size={17} />
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Footer />
    </>
  );
}
function ArrowRightIcon() {
  return <ArrowUpRight size={16} />;
}
