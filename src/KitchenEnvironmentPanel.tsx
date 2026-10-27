import { useId, useState, type FormEvent } from "react";
import { AlertTriangle, Check, Plus, Ruler, Trash2 } from "lucide-react";
import { kitchenPlanSchema, type KitchenPlan, type KitchenQuote } from "../lib/kitchen";
import type { KitchenDrawer, KitchenObstacle } from "../lib/kitchen-environment";
import { buildKitchenLayoutView } from "../lib/kitchen-layout-view";
import "./kitchen-environment.css";

const kindNames = { window: "Ventana / zona de apertura", column: "Columna o saliente", connection: "Conexión de agua, desagüe o electricidad" };
const measureNames = { offset: "Desde el inicio de la pared", elevation: "Altura inferior desde el suelo", width: "Ancho", height: "Alto", depth: "Proyección desde la pared" };
const obstacleStart = (): KitchenObstacle => ({ id: "", name: "", kind: "window", wall: "a", offset: 600, elevation: 1100, width: 1000, height: 1000, depth: 100 });
const drawerStart = (itemId = ""): KitchenDrawer => ({ id: "", itemId, name: "Cajón medido", offset: 50, elevation: 100, width: 400, height: 200, extension: 500 });
const size = (value: number) => `${value} mm`;

export function KitchenEnvironmentPanel({ plan, quote, pending, serverError, onChange }: { plan: KitchenPlan; quote?: KitchenQuote; pending: boolean; serverError?: string; onChange: (plan: KitchenPlan) => void }) {
  const id = useId();
  const [obstacle, setObstacle] = useState<KitchenObstacle>(obstacleStart);
  const [drawer, setDrawer] = useState<KitchenDrawer>(() => drawerStart(plan.items.find(item => item.kind === "furniture")?.id));
  const [error, setError] = useState("");
  const environment = plan.environment;
  const verification = quote?.verification;
  const layout = buildKitchenLayoutView(plan, quote);
  function commit(next: KitchenPlan) {
    const parsed = kitchenPlanSchema.safeParse(next);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Revisa las medidas del ambiente."); return false; }
    setError(""); onChange(next); return true;
  }
  function saveObstacle(event: FormEvent) {
    event.preventDefault();
    const entry = { ...obstacle, id: obstacle.id || crypto.randomUUID() };
    const entries = environment?.obstacles ?? [];
    if (commit({ ...plan, environment: { ...environment, obstacles: obstacle.id ? entries.map(item => item.id === obstacle.id ? entry : item) : [...entries, entry] } })) setObstacle(obstacleStart());
  }
  function saveDrawer(event: FormEvent) {
    event.preventDefault();
    const entry = { ...drawer, id: drawer.id || crypto.randomUUID() };
    const entries = environment?.drawers ?? [];
    if (commit({ ...plan, environment: { ...environment, obstacles: environment?.obstacles ?? [], drawers: drawer.id ? entries.map(item => item.id === drawer.id ? entry : item) : [...entries, entry] } })) setDrawer(drawerStart(drawer.itemId));
  }
  const field = (key: keyof typeof measureNames) => <label key={key}>{measureNames[key]} · mm<input type="number" inputMode="numeric" required step={10} min={key === "offset" || key === "elevation" ? 0 : 10} max={key === "offset" || key === "width" ? 6000 : key === "depth" ? 3000 : 4000} value={Number.isFinite(obstacle[key]) ? obstacle[key] : ""} onChange={event => setObstacle({ ...obstacle, [key]: event.target.value === "" ? NaN : Number(event.target.value) })} /></label>;
  return <section className="kitchen-environment" aria-labelledby={`${id}-title`}>
    <div className="kitchen-environment-heading"><div><p>Medir antes de fabricar</p><h2 id={`${id}-title`}>Ambiente y aperturas.</h2></div><Ruler size={27} aria-hidden="true" /></div>
    <p className="kitchen-environment-intro">Registra ventanas, salientes y zonas de acceso con medidas tomadas en obra. La posición se mide desde el mismo inicio de cada pared que muestra el plano, sin sumar de nuevo la esquina de B.</p>
    {!environment && <div className="kitchen-environment-notice"><AlertTriangle size={19} aria-hidden="true" /><p>Este diseño todavía no describe los obstáculos del ambiente. La animación de puertas y el encaje entre módulos no verifican por sí solos tu cocina real.</p><button type="button" onClick={() => onChange({ ...plan, environment: { obstacles: [] } })}>Registrar el ambiente</button></div>}
    {environment && <>
      <div className="kitchen-environment-plans">{layout.walls.map(wall => {
        const height = plan.roomHeight ?? 2600;
        return <div key={wall.id}><h3>Pared {wall.id.toUpperCase()} · {size(wall.length ?? 0)}</h3><svg viewBox={`0 0 ${Math.max(1, wall.length ?? 1)} ${height}`} role="img" aria-label={`Elevación de la pared ${wall.id.toUpperCase()}: módulos y obstáculos medidos`}>
          <rect x="0" y="0" width={wall.length ?? 0} height={height} fill="#f5f3ea" stroke="#b6c8cf" strokeWidth="12" />
          {wall.lanes.flatMap(lane => lane.blocks).filter(block => block.valid && block.kind !== "space").map(block => <rect key={block.id} x={block.offset!} y={height - block.elevation! - block.height!} width={block.width!} height={block.height!} fill="#d9e4e8" fillOpacity=".65" stroke="#829eac" strokeWidth="8" />)}
          {environment.obstacles.filter(entry => entry.wall === wall.id).map(entry => <g key={entry.id}><title>{entry.name}: {size(entry.width)} × {size(entry.height)}, proyección {size(entry.depth)}</title><rect x={entry.offset} y={height - entry.elevation - entry.height} width={entry.width} height={entry.height} fill={entry.kind === "connection" && !entry.reserveAccess ? "#c3c994" : "#d4a17e"} fillOpacity=".7" stroke="#795e48" strokeDasharray="20 12" strokeWidth="10" /><text x={entry.offset + entry.width / 2} y={height - entry.elevation - entry.height / 2} textAnchor="middle" fontSize="100" fill="#172b36">{entry.name.slice(0, 22)}</text></g>)}
        </svg><small>Vista frontal. Gris: módulos y reservas. Ámbar: volumen reservado. Verde: conexión a revisar.</small></div>;
      })}</div>
      <div className="kitchen-environment-editor">
        <form onSubmit={saveObstacle}><h3>{obstacle.id ? "Editar obstáculo" : "Añadir un obstáculo o conexión"}</h3><p>Los valores iniciales son un ejemplo: sustitúyelos por las medidas de tu ambiente.</p><div className="kitchen-environment-fields"><label>Tipo<select value={obstacle.kind} onChange={event => setObstacle({ ...obstacle, kind: event.target.value as KitchenObstacle["kind"] })}>{Object.entries(kindNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><label>Nombre de referencia<input required maxLength={80} value={obstacle.name} onChange={event => setObstacle({ ...obstacle, name: event.target.value })} placeholder="Ej. ventana sobre lavadero" /></label><label>Pared<select value={obstacle.wall} onChange={event => setObstacle({ ...obstacle, wall: event.target.value as "a" | "b" })}><option value="a">Pared A</option>{plan.layout === "l" && <option value="b">Pared B</option>}</select></label>{(Object.keys(measureNames) as (keyof typeof measureNames)[]).map(field)}</div>
          {obstacle.kind === "connection" ? <label className="kitchen-environment-check"><input type="checkbox" checked={obstacle.reserveAccess === true} onChange={event => setObstacle({ ...obstacle, reserveAccess: event.target.checked })} /><span>Reservar este volumen libre para acceso. Bloquea el encaje si coincide con un módulo o equipo.</span></label> : <p>La proyección define el volumen que debe quedar libre desde la pared, incluida la apertura de la ventana si corresponde. No se deduce de una foto.</p>}
          {obstacle.kind === "connection" && !obstacle.reserveAccess && <p>Una conexión puede quedar dentro de un mueble compatible. Se marcará para revisión, sin inventar recortes o instalaciones.</p>}
          <div className="kitchen-environment-actions"><button type="submit" disabled={!obstacle.id && environment.obstacles.length >= 24}><Plus size={16} aria-hidden="true" />{obstacle.id ? "Aplicar medidas" : "Añadir al ambiente"}</button>{obstacle.id && <button type="button" onClick={() => setObstacle(obstacleStart())}>Cancelar edición</button>}</div>
        </form>
        <div className="kitchen-environment-list"><h3>Obstáculos registrados · {environment.obstacles.length}/24</h3>{!environment.obstacles.length && <p>No has registrado obstáculos. Comprueba que no falten ventanas, salientes o instalaciones antes de continuar.</p>}{environment.obstacles.map(entry => <article key={entry.id}><strong>{entry.name}</strong><p>Pared {entry.wall.toUpperCase()} · desde {size(entry.offset)} · altura inferior {size(entry.elevation)}<br />{size(entry.width)} ancho × {size(entry.height)} alto × {size(entry.depth)} de proyección</p><small>{entry.kind === "connection" && !entry.reserveAccess ? "Conexión a revisar; no bloquea el encaje" : "Volumen que debe quedar libre"}</small><div className="kitchen-environment-actions"><button type="button" onClick={() => { setObstacle({ ...entry }); setError(""); }}>Editar</button><button type="button" aria-label={`Quitar ${entry.name}`} onClick={() => { if (commit({ ...plan, environment: { ...environment, obstacles: environment.obstacles.filter(item => item.id !== entry.id) } }) && obstacle.id === entry.id) setObstacle(obstacleStart()); }}><Trash2 size={16} aria-hidden="true" />Quitar</button></div></article>)}</div>
      </div>
      <details className="kitchen-environment-drawers"><summary>Recorridos de cajones medidos</summary><p>El catálogo actual no genera cajones ni sus guías. Puedes registrar el volumen de apertura de un cajón real que el taller haya definido. Esto reserva movimiento; no añade piezas, herrajes ni precio.</p>
        <form onSubmit={saveDrawer}><div className="kitchen-environment-fields"><label>Mueble<select required value={drawer.itemId} onChange={event => setDrawer({ ...drawer, itemId: event.target.value })}><option value="">Elige un módulo</option>{plan.items.filter(item => item.kind === "furniture").map(item => <option key={item.id} value={item.id}>{quote?.modules.find(module => module.id === item.id)?.name || "Mueble"} · {item.id.slice(0, 8)}</option>)}</select></label><label>Nombre<input required maxLength={80} value={drawer.name} onChange={event => setDrawer({ ...drawer, name: event.target.value })} /></label>{([['offset', 'Desde el lateral izquierdo del módulo'], ['elevation', 'Altura inferior desde la base del módulo'], ['width', 'Ancho del recorrido'], ['height', 'Alto del recorrido'], ['extension', 'Salida desde el frente cerrado']] as const).map(([key, label]) => <label key={key}>{label} · mm<input type="number" required step={10} min={key === "offset" || key === "elevation" ? 0 : 10} max={key === "width" ? 3000 : key === "offset" ? 6000 : key === "elevation" ? 4000 : 2000} value={Number.isFinite(drawer[key]) ? drawer[key] : ""} onChange={event => setDrawer({ ...drawer, [key]: event.target.value === "" ? NaN : Number(event.target.value) })} /></label>)}</div><div className="kitchen-environment-actions"><button type="submit" disabled={!drawer.id && (environment.drawers?.length ?? 0) >= 16}>{drawer.id ? "Aplicar recorrido" : "Añadir recorrido"}</button>{drawer.id && <button type="button" onClick={() => setDrawer(drawerStart(drawer.itemId))}>Cancelar edición</button>}</div></form>
        {(environment.drawers ?? []).map(entry => <article className="kitchen-environment-drawer" key={entry.id}><strong>{entry.name}</strong><p>{size(entry.width)} × {size(entry.height)} · salida {size(entry.extension)}</p><div className="kitchen-environment-actions"><button type="button" onClick={() => setDrawer({ ...entry })}>Editar</button><button type="button" onClick={() => { if (commit({ ...plan, environment: { ...environment, drawers: environment.drawers?.filter(item => item.id !== entry.id) } }) && drawer.id === entry.id) setDrawer(drawerStart()); }}>Quitar recorrido</button></div></article>)}
      </details>
    </>}
    {error && <p className="kitchen-environment-error" role="alert">{error}</p>}
    {serverError && <p className="kitchen-environment-error" role="alert">{serverError}</p>}
    <div className="kitchen-environment-results" aria-live="polite"><h3>Revisión preliminar del movimiento</h3>{pending ? <p>Actualizando las comprobaciones del servidor…</p> : verification ? <><p>{verification.issues.length ? <AlertTriangle size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}{verification.issues.length ? "Hay puntos pendientes de revisión." : "Sin interferencias detectadas dentro del alcance descrito."}</p><small>{verification.doorsChecked} hojas abatibles revisadas hasta {verification.openingDegrees.toFixed(1)}° · {verification.drawersChecked} recorridos de cajón medidos.{!verification.environmentRecorded && " Falta describir los obstáculos del ambiente."}</small>{verification.issues.length > 0 && <ul>{verification.issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}</> : <p>Necesitamos una cotización vigente para mostrar los recorridos comprobados. Las versiones antiguas conservan sus datos y no se recalculan por abrirlas.</p>}</div>
    <p className="kitchen-environment-limit">Se revisa un frente a la vez contra módulos cerrados, reservas, las dos paredes de una L y los volúmenes registrados. El barrido de puertas es conservador e incluye margen para el jalador visual; los recorridos de cajones dependen de tus medidas. No se verifican aperturas simultáneas, ventanas móviles no descritas, herrajes reales, paredes opuestas, ventilación ni instalaciones. El taller debe validar fabricación y montaje; este resultado no es una homologación.</p>
  </section>;
}
