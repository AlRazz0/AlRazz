import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  Download,
  FileUp,
  Loader2,
  LockKeyhole,
  LogOut,
  Package,
  Pencil,
  Plus,
  Ruler,
  Search,
  Settings2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { Switch } from "../components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { api, download } from "../lib/api";
import {
  defaultSettings,
  seedProducts,
  settingsSchema,
  validateProduct,
  type Config,
  type Product,
  type Result,
  type Settings,
} from "../lib/furniture";
import {
  catalogCSVTemplate,
  exportCatalogCSV,
  importCatalogCSV,
} from "../lib/catalog-csv";
import "./admin.css";
import { commercialMaterials } from "../lib/material-presets";
import { mergeCommercialMaterials } from "../lib/material-catalog";
import { materialLabel, materialBrands } from "./materials";
import { MaterialSource, MaterialSwatch } from "./MaterialSwatch";
import { Brand } from "./Brand";

type AdminSnapshot = {
  admin: boolean;
  configured: boolean;
  challenge?: boolean;
  challengeExpiresAt?: number;
  emailAvailable?: boolean;
  products?: Product[];
  settings?: Settings;
  settingsVersion?: number;
};
type ImportPreview = {
  filename: string;
  products: Product[];
  errors: { row: number; message: string }[];
};
type CutListSnapshot = {
  source: "saved" | "current";
  design: {
    id: string;
    name?: string;
    quantity: number;
    version: number;
    created: string;
  } | null;
  product: { id: string; name: string };
  config: Config;
  result: Result;
};
const categories: Product["category"][] = [
  "Estanterías",
  "Libreros",
  "Aparadores",
  "Muebles de TV",
];
const dimensions = [
  { key: "width", name: "Ancho" },
  { key: "height", name: "Alto" },
  { key: "depth", name: "Fondo" },
] as const;
const clone = <T,>(value: T): T => structuredClone(value);
const materialSearchText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
function designIdFromReference(reference: string) {
  const value = reference.trim();
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuid.test(value)) return value.toLowerCase();
  try {
    const link = new URL(value, window.location.origin);
    const id = link.searchParams.get("d") ?? "";
    if (link.pathname.replace(/\/$/, "") === "/configurar" && uuid.test(id))
      return id.toLowerCase();
  } catch {
    // The form reports invalid links without contacting the server.
  }
  throw Error(
    "Pega el enlace del diseño guardado o su identificador completo.",
  );
}
function exportCuts(result: Result, id: string) {
  const cell = (value: unknown) => {
    const text = String(value);
    const safe = /^[\s]*[=+@-]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const csv =
    "\ufeff" +
    [
      "DESPIECE PRELIMINAR — NO AUTORIZADO PARA PRODUCCIÓN",
      "Código;Pieza;Cantidad;Largo/alto mm;Ancho mm;Espesor mm;Material;Veta;Superior;Inferior;Izquierdo;Derecho",
      ...result.panels.map((panel) =>
        [
          panel.id,
          panel.name,
          1,
          panel.length,
          panel.width,
          18,
          panel.materialName,
          panel.grain,
          panel.edges.top,
          panel.edges.bottom,
          panel.edges.left,
          panel.edges.right,
        ]
          .map(cell)
          .join(";"),
      ),
    ].join("\r\n");
  download(id + "-despiece.csv", csv, "text/csv;charset=utf-8");
}
function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "issues" in error)
    return (
      error as { issues: { message: string; path: (string | number)[] }[] }
    ).issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(" · ");
  return error instanceof Error
    ? error.message
    : "No se pudo completar la operación. Conservamos tus cambios para que vuelvas a intentarlo.";
}
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
        onChange={(event) =>
          change(
            event.target.value === "" ? Number.NaN : Number(event.target.value),
          )
        }
      />
    </Field>
  );
}
function Status({ active }: { active: boolean }) {
  return (
    <span className={`admin-status ${active ? "is-live" : ""}`}>
      <i />
      {active ? "Visible" : "Borrador"}
    </span>
  );
}

export default function Admin() {
  const [session, setSession] = useState<AdminSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verificationMethod, setVerificationMethod] = useState<
    "totp" | "email" | "recovery"
  >("totp");
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailRetryAt, setEmailRetryAt] = useState(0);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<Settings>(clone(defaultSettings));
  const [savedSettings, setSavedSettings] = useState(
    JSON.stringify(defaultSettings),
  );
  const [settingsVersion, setSettingsVersion] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [materialFilter, setMaterialFilter] = useState("all");
  const [materialSearch, setMaterialSearch] = useState("");
  const [editor, setEditor] = useState<Product | null>(null);
  const [original, setOriginal] = useState<Product | null>(null);
  const [editorError, setEditorError] = useState("");
  const [discard, setDiscard] = useState(false);
  const [toggle, setToggle] = useState<Product | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(
    null,
  );
  const [importError, setImportError] = useState("");
  const [cutSource, setCutSource] = useState<"current" | "saved">("current");
  const [cutProductId, setCutProductId] = useState("");
  const [cutDesignReference, setCutDesignReference] = useState("");
  const [cutList, setCutList] = useState<CutListSnapshot | null>(null);
  const [cutError, setCutError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const restartLoginButton = useRef<HTMLButtonElement>(null);
  const challenge = !!session?.challenge && !session.admin;
  const secondsRemaining = challenge
    ? Math.max(0, (session?.challengeExpiresAt ?? 0) - now)
    : 0;
  const challengeExpired = challenge && secondsRemaining === 0;
  const emailRetrySeconds = Math.max(0, emailRetryAt - now);
  const numericCode = verificationMethod !== "recovery";
  const cutProducts = products.filter((product) => product.active);
  const selectedCutProduct =
    cutProducts.find((product) => product.id === cutProductId) ??
    cutProducts[0];
  const settingsDirty = JSON.stringify(settings) !== savedSettings;
  const materialMatches = (material: Settings["materials"][number]) =>
    (materialFilter === "all" || material.brand === materialFilter) &&
    materialSearchText(
      `${material.name} ${material.brand || ""} ${material.code || ""}`,
    ).includes(materialSearchText(materialSearch.trim()));
  const editorDirty =
    !!editor &&
    (!original || JSON.stringify(editor) !== JSON.stringify(original));

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data: AdminSnapshot = await api("action=admin");
      setNow(Math.floor(Date.now() / 1000));
      setSession(data);
      if (data.admin && data.products && data.settings) {
        setProducts(data.products);
        setSettings(clone(data.settings));
        setSavedSettings(JSON.stringify(data.settings));
        setSettingsVersion(data.settingsVersion ?? 1);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!challenge) return;
    const timer = window.setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [challenge]);
  useEffect(() => {
    if (loading || busy || session?.admin || !session?.configured) return;
    if (challengeExpired) restartLoginButton.current?.focus();
    else if (challenge) codeInput.current?.focus();
    else emailInput.current?.focus();
  }, [
    loading,
    busy,
    challenge,
    challengeExpired,
    verificationMethod,
    session?.admin,
    session?.configured,
  ]);
  useEffect(() => {
    if (challengeExpired) setCode("");
  }, [challengeExpired]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (settingsDirty || editorDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [settingsDirty, editorDirty]);
  const filtered = useMemo(
    () =>
      products
        .filter(
          (product) =>
            `${product.name} ${product.id} ${product.category}`
              .toLocaleLowerCase("es")
              .includes(search.toLocaleLowerCase("es")) &&
            (filter === "all" ||
              (filter === "visible" ? product.active : !product.active)),
        )
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [products, search, filter],
  );
  const activeCount = products.filter((product) => product.active).length;
  const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));
  const setProduct = <K extends keyof Product>(key: K, value: Product[K]) =>
    setEditor((current) => (current ? { ...current, [key]: value } : null));
  const setConfig = <K extends keyof Config>(key: K, value: Config[K]) =>
    setEditor((current) =>
      current
        ? { ...current, defaults: { ...current.defaults, [key]: value } }
        : null,
    );
  const mergeProducts = (changed: Product[]) =>
    setProducts((current) => [
      ...current.filter(
        (product) => !changed.some((item) => item.id === product.id),
      ),
      ...changed,
    ]);
  const announce = (message: string) => {
    setNotice(message);
    setError("");
  };

  async function login(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy("login");
    setError("");
    try {
      const result = await api<AdminSnapshot>("", {
        op: "login",
        email: email.trim(),
        password,
      });
      if (!result.challenge || !result.challengeExpiresAt)
        throw Error("No se pudo iniciar la verificación. Vuelve a intentarlo.");
      setNow(Math.floor(Date.now() / 1000));
      setVerificationMethod("totp");
      setEmailCodeSent(false);
      setEmailRetryAt(0);
      setCode("");
      setSession({ ...result, admin: false, configured: true });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPassword("");
      setBusy(null);
    }
  }
  async function verifyLogin(event: FormEvent) {
    event.preventDefault();
    if (busy || challengeExpired) return;
    setBusy("verify-login");
    setError("");
    try {
      const result = await api<{ admin: boolean }>("", {
        op: "verify-login",
        code: code.trim(),
        method: verificationMethod,
      });
      if (!result.admin)
        throw Error(
          "No se pudo completar la verificación. Vuelve a intentarlo.",
        );
      setCode("");
      setEmail("");
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setCode("");
      setBusy(null);
    }
  }
  async function cancelLogin() {
    if (busy) return;
    setBusy("cancel-login");
    setError("");
    setCode("");
    setPassword("");
    try {
      await api("", { op: "cancel-login" });
      setVerificationMethod("totp");
      setEmailCodeSent(false);
      setEmailRetryAt(0);
      setSession({ admin: false, configured: true });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }
  function changeVerificationMethod(method: "totp" | "email" | "recovery") {
    setCode("");
    setError("");
    setVerificationMethod(method);
  }
  async function sendEmailCode() {
    if (
      busy ||
      challengeExpired ||
      emailRetrySeconds > 0 ||
      !session?.emailAvailable
    )
      return;
    setBusy("request-email-code");
    setError("");
    setCode("");
    setEmailCodeSent(false);
    try {
      const result = await api<{ sent: boolean; retryAfter: number }>("", {
        op: "request-email-code",
      });
      if (!result.sent)
        throw Error("No se pudo enviar el código. Vuelve a intentarlo.");
      setCode("");
      setEmailCodeSent(true);
      const sentAt = Math.floor(Date.now() / 1000);
      setNow(sentAt);
      setEmailRetryAt(sentAt + (result.retryAfter || 60));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }
  async function logout() {
    setBusy("logout");
    setError("");
    try {
      await api("", { op: "logout" });
      setSession({ admin: false, configured: true });
      setEmail("");
      setPassword("");
      setCode("");
      setVerificationMethod("totp");
      setEmailCodeSent(false);
      setEmailRetryAt(0);
      setProducts([]);
      setCutList(null);
      setCutDesignReference("");
      setCutError("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }
  function freshId(base: string) {
    const stem = base.slice(0, 48);
    let id = `${stem}-copia`;
    let count = 2;
    while (products.some((product) => product.id === id))
      id = `${stem}-copia-${count++}`;
    return id;
  }
  function openEditor(product?: Product, duplicate = false) {
    setEditorError("");
    if (product && !duplicate) {
      setEditor(clone(product));
      setOriginal(clone(product));
      return;
    }
    const template = compatibleTemplate(product ?? seedProducts[0]);
    setEditor({
      ...template,
      id: product ? freshId(product.id) : "",
      name: product ? `${product.name} · copia`.slice(0, 70) : "",
      active: false,
      version: 1,
      order: Math.min(
        999,
        Math.max(0, ...products.map((item) => item.order)) + 1,
      ),
    });
    setOriginal(null);
  }
  function compatibleTemplate(product: Product): Product {
    const template = clone(product);
    const active = settings.materials.filter((m) => m.active);
    if (!active.some((m) => m.id === template.defaults.finish) && active[0])
      template.defaults.finish = active[0].id;
    if (
      template.defaults.interior !== "same" &&
      !active.some((m) => m.id === template.defaults.interior)
    )
      template.defaults.interior = "same";
    return template;
  }
  function closeEditor() {
    if (busy === "product") return;
    if (editorDirty) setDiscard(true);
    else setEditor(null);
  }
  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setBusy("product");
    setEditorError("");
    try {
      validateProduct(editor, settings);
      if (!original && products.some((product) => product.id === editor.id))
        throw Error(
          "Este identificador ya existe. Usa uno distinto para el nuevo mueble.",
        );
      const result = await api("", {
        op: "product",
        product: editor,
        expectedVersion: original?.version ?? 0,
      });
      if (result.product) mergeProducts([result.product]);
      else {
        const data = await api("action=admin");
        setProducts(data.products);
      }
      setEditor(null);
      announce(
        original
          ? "Mueble actualizado. El catálogo ya usa estos datos."
          : "Borrador creado. Revísalo y actívalo cuando esté listo.",
      );
    } catch (cause) {
      setEditorError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }
  async function toggleProduct() {
    if (!toggle) return;
    setBusy("toggle");
    setError("");
    try {
      const result = await api("", {
        op: "product",
        product: { ...toggle, active: !toggle.active },
        expectedVersion: toggle.version,
      });
      if (result.product) mergeProducts([result.product]);
      else {
        const data = await api("action=admin");
        setProducts(data.products);
      }
      announce(
        toggle.active
          ? `${toggle.name} quedó oculto del catálogo.`
          : `${toggle.name} ya está visible en el catálogo.`,
      );
      setToggle(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }
  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setBusy("settings");
    setError("");
    try {
      settingsSchema.parse(settings);
      const result = await api("", {
        op: "settings",
        settings,
        version: settingsVersion,
      });
      const updated: Settings = result.settings ?? settings;
      setSettings(clone(updated));
      setSavedSettings(JSON.stringify(updated));
      setSettingsVersion(result.settingsVersion ?? settingsVersion + 1);
      announce(
        "Ajustes guardados. Las nuevas configuraciones usarán estos valores.",
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }
  async function readImport(file?: File) {
    if (!file) return;
    setImportError("");
    setBusy("read-import");
    try {
      if (file.size > 1_000_000)
        throw Error("El archivo debe pesar menos de 1 MB.");
      const content = await file.text();
      let preview: Omit<ImportPreview, "filename">;
      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed: unknown = JSON.parse(content);
        const rows = Array.isArray(parsed)
          ? parsed
          : parsed && typeof parsed === "object" && "products" in parsed
            ? (parsed as { products: unknown }).products
            : null;
        if (!Array.isArray(rows))
          throw Error(
            "El JSON debe contener una lista de muebles o un objeto con una lista «products».",
          );
        preview = { products: [], errors: [] };
        rows.forEach((row, index) => {
          try {
            const product = { ...(row as Product), active: false, version: 1 };
            validateProduct(product, settings);
            preview.products.push(product);
          } catch (cause) {
            preview.errors.push({
              row: index + 1,
              message: errorMessage(cause),
            });
          }
        });
      } else preview = importCatalogCSV(content, settings);
      if (!preview.products.length && !preview.errors.length)
        throw Error(
          "El archivo está vacío. Descarga la plantilla para empezar.",
        );
      if (preview.products.length > 200)
        preview.errors.push({
          row: 1,
          message:
            "Importa como máximo 200 muebles por archivo. Divide el catálogo en archivos más pequeños.",
        });
      if (
        new TextEncoder().encode(
          JSON.stringify({ op: "import", products: preview.products }),
        ).byteLength > 1_000_000
      )
        preview.errors.push({
          row: 1,
          message:
            "Los datos preparados superan 1 MB. Divide el catálogo en archivos más pequeños.",
        });
      const seen = new Set<string>();
      preview.products.forEach((product, index) => {
        if (seen.has(product.id))
          preview.errors.push({
            row: index + 1,
            message: `Identificador repetido: ${product.id}.`,
          });
        if (products.some((existing) => existing.id === product.id))
          preview.errors.push({
            row: index + 1,
            message: `«${product.id}» ya existe. Edita ese mueble desde el catálogo o cambia el identificador.`,
          });
        seen.add(product.id);
        try {
          validateProduct(product, settings);
        } catch (cause) {
          preview.errors.push({ row: index + 1, message: errorMessage(cause) });
        }
      });
      setImportPreview({ filename: file.name, ...preview });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function confirmImport() {
    if (
      !importPreview ||
      importPreview.errors.length ||
      !importPreview.products.length
    )
      return;
    setBusy("import");
    setImportError("");
    try {
      const result = await api("", {
        op: "import",
        products: importPreview.products.map((product) => ({
          ...product,
          active: false,
          version: 1,
        })),
      });
      if (result.imported) mergeProducts(result.imported);
      else {
        const data = await api("action=admin");
        setProducts(data.products);
      }
      announce(
        `${importPreview.products.length} muebles importados como borradores. Actívalos después de revisarlos.`,
      );
      setImportPreview(null);
    } catch (cause) {
      setImportError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }
  async function loadCutList(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy("cut-list");
    setCutError("");
    setCutList(null);
    try {
      if (cutSource === "current" && !selectedCutProduct)
        throw Error(
          "No hay modelos visibles. Puedes consultar un diseño guardado.",
        );
      const request =
        cutSource === "saved"
          ? {
              op: "cut-list",
              designId: designIdFromReference(cutDesignReference),
            }
          : {
              op: "cut-list",
              productId: selectedCutProduct.id,
              config: selectedCutProduct.defaults,
            };
      setCutList(await api<CutListSnapshot>("", request));
    } catch (cause) {
      setCutError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  const topbar = (
    <header className="admin-topbar admin-topbar--branded">
      <a href="/" className="brand-link" aria-label="El capo, ir al inicio">
        <Brand variant="admin" />
      </a>
      <span className="admin-topbar-label">Taller digital</span>
      <a className="admin-back" href="/">
        <ArrowLeft size={15} /> Ver catálogo
      </a>
      {session?.admin && (
        <button
          className="admin-icon-button"
          disabled={!!busy || settingsDirty}
          onClick={logout}
          aria-label={
            settingsDirty
              ? "Guarda los ajustes antes de cerrar sesión"
              : "Cerrar sesión"
          }
          title={
            settingsDirty
              ? "Guarda los ajustes antes de cerrar sesión"
              : "Cerrar sesión"
          }
        >
          <LogOut size={18} />
        </button>
      )}
    </header>
  );

  if (loading)
    return (
      <div className="admin-shell">
        {topbar}
        <main className="admin-loading" aria-live="polite">
          <Loader2 className="admin-spin" size={26} />
          <p>Conectando con tu taller…</p>
        </main>
      </div>
    );
  if (!session?.admin)
    return (
      <div className="admin-shell">
        {topbar}
        <main className="admin-login-layout">
          <section className="admin-login-story">
            <p className="admin-eyebrow">El capo / ADMINISTRACIÓN</p>
            <h1>
              Tu catálogo.
              <br />
              Bajo tu control.
            </h1>
            <p>
              Muebles, materiales y precios en un solo lugar. Actualiza tu
              taller sin cambiar el código.
            </p>
            <div className="admin-login-note">
              <Package size={22} />
              <span>
                Un catálogo conectado.
                <br />
                <strong>Una sola fuente de información.</strong>
              </span>
            </div>
          </section>
          <section className="admin-login-card">
            <LockKeyhole size={24} strokeWidth={1.5} />
            <h2>{challenge ? "Verifica tu acceso" : "Bienvenido al taller"}</h2>
            <p>
              {challenge
                ? "Completa el segundo paso para acceder a la administración."
                : "Ingresa con tu correo y contraseña. Después verificaremos tu acceso con un segundo código."}
            </p>
            {session?.configured && (
              <ol
                className="admin-login-steps"
                aria-label="Pasos para ingresar"
              >
                <li aria-current={!challenge ? "step" : undefined}>
                  <span>{challenge ? <Check size={12} /> : "1"}</span>
                  Correo y contraseña
                </li>
                <li aria-current={challenge ? "step" : undefined}>
                  <span>2</span> Verificación
                </li>
              </ol>
            )}
            {error && (
              <div
                className="admin-message is-error"
                role="alert"
                id="admin-login-error"
              >
                {error}
                {(!session || challenge) && (
                  <button
                    className="admin-text-button"
                    onClick={load}
                    disabled={!!busy}
                  >
                    Volver a conectar
                  </button>
                )}
              </div>
            )}
            {session?.configured === false ? (
              <div className="admin-setup">
                <strong>Falta configurar el acceso</strong>
                <p>
                  La cuenta de administración todavía no está lista. Pide al
                  responsable del sitio que configure tu correo, contraseña y
                  aplicación de autenticación siguiendo la guía del proyecto.
                </p>
                <button className="button outline" onClick={load}>
                  Comprobar conexión
                </button>
              </div>
            ) : challenge ? (
              <form onSubmit={verifyLogin} aria-busy={!!busy}>
                {challengeExpired ? (
                  <div className="admin-message is-error" role="alert">
                    La verificación venció. Vuelve a ingresar tu correo y
                    contraseña para iniciar otra.
                  </div>
                ) : (
                  <>
                    {verificationMethod === "email" && (
                      <div className="admin-email-code">
                        <button
                          type="button"
                          className="button outline"
                          onClick={sendEmailCode}
                          disabled={
                            !!busy ||
                            emailRetrySeconds > 0 ||
                            !session?.emailAvailable
                          }
                        >
                          {busy === "request-email-code"
                            ? "Enviando…"
                            : emailRetrySeconds > 0
                              ? `Reenviar en ${emailRetrySeconds} s`
                              : emailCodeSent
                                ? "Reenviar código por correo"
                                : "Enviar código al correo autorizado"}
                        </button>
                        {emailCodeSent && (
                          <p className="admin-verification-help" role="status">
                            Código enviado. Revisa tu bandeja de entrada o
                            correo no deseado. Si lo solicitas otra vez, usa el
                            más reciente.
                          </p>
                        )}
                      </div>
                    )}
                    <Field
                      title={
                        verificationMethod === "totp"
                          ? "Código de autenticación"
                          : verificationMethod === "email"
                            ? "Código recibido por correo"
                            : "Código de recuperación"
                      }
                    >
                      <input
                        key={verificationMethod}
                        ref={codeInput}
                        id="admin-verification-code"
                        name="verification-code"
                        className="admin-verification-input"
                        type="text"
                        inputMode={numericCode ? "numeric" : "text"}
                        autoComplete={numericCode ? "one-time-code" : "off"}
                        autoCapitalize="none"
                        spellCheck={false}
                        maxLength={numericCode ? 6 : 64}
                        minLength={numericCode ? 6 : undefined}
                        pattern={numericCode ? "[0-9]{6}" : undefined}
                        placeholder={numericCode ? "000000" : undefined}
                        value={code}
                        onChange={(event) =>
                          setCode(
                            numericCode
                              ? event.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 6)
                              : event.target.value,
                          )
                        }
                        aria-describedby={`admin-verification-help${error ? " admin-login-error" : ""}`}
                        aria-invalid={!!error}
                        disabled={!!busy}
                        required
                      />
                    </Field>
                    <p
                      className="admin-verification-help"
                      id="admin-verification-help"
                    >
                      {verificationMethod === "totp"
                        ? "Abre tu aplicación de autenticación e ingresa el código de 6 dígitos. Si ya configuraste tu acceso, la cuenta puede seguir apareciendo como AlRazz."
                        : verificationMethod === "email"
                          ? "Ingresa los 6 dígitos del último código que recibiste en el correo de administración."
                          : "Usa uno de los códigos que guardaste al configurar tu acceso. Cada código sirve una sola vez."}
                    </p>
                    <p
                      className="admin-verification-timer"
                      role="timer"
                      aria-live="off"
                    >
                      Tiempo para completar este paso:{" "}
                      {Math.floor(secondsRemaining / 60)}:
                      {(secondsRemaining % 60).toString().padStart(2, "0")}
                    </p>
                    <button
                      className="button rust admin-full"
                      disabled={
                        !!busy ||
                        challengeExpired ||
                        (numericCode ? code.length !== 6 : !code.trim())
                      }
                    >
                      {busy === "verify-login"
                        ? "Verificando…"
                        : "Verificar y entrar"}
                      <ArrowUpRight size={18} />
                    </button>
                    {verificationMethod !== "totp" && (
                      <button
                        className="admin-login-link"
                        type="button"
                        disabled={!!busy}
                        onClick={() => changeVerificationMethod("totp")}
                      >
                        Usar mi aplicación de autenticación
                      </button>
                    )}
                    {verificationMethod !== "email" && (
                      <button
                        className="admin-login-link"
                        type="button"
                        disabled={!!busy || !session?.emailAvailable}
                        onClick={() => changeVerificationMethod("email")}
                      >
                        {session?.emailAvailable
                          ? "Recibir un código por correo"
                          : "Envío por correo pendiente de activar"}
                      </button>
                    )}
                    {verificationMethod !== "recovery" && (
                      <button
                        className="admin-login-link"
                        type="button"
                        disabled={!!busy}
                        onClick={() => changeVerificationMethod("recovery")}
                      >
                        Usar un código de recuperación
                      </button>
                    )}
                  </>
                )}
                <button
                  ref={restartLoginButton}
                  className={
                    challengeExpired
                      ? "button outline admin-full"
                      : "admin-login-link"
                  }
                  type="button"
                  disabled={!!busy}
                  onClick={cancelLogin}
                >
                  <ArrowLeft size={14} />
                  {busy === "cancel-login"
                    ? "Volviendo…"
                    : challengeExpired
                      ? "Volver a iniciar sesión"
                      : "Volver al correo y contraseña"}
                </button>
              </form>
            ) : (
              <form
                onSubmit={login}
                className="admin-login-form"
                aria-busy={!!busy}
              >
                <Field title="Correo electrónico">
                  <input
                    ref={emailInput}
                    id="admin-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={254}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={!!busy || !session}
                    aria-describedby={error ? "admin-login-error" : undefined}
                    required
                  />
                </Field>
                <Field title="Contraseña">
                  <input
                    id="admin-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    maxLength={512}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={!!busy || !session}
                    aria-describedby={error ? "admin-login-error" : undefined}
                    required
                  />
                </Field>
                <button
                  className="button rust admin-full"
                  disabled={!!busy || !session}
                >
                  {busy === "login" ? "Comprobando…" : "Continuar"}
                  <ArrowUpRight size={18} />
                </button>
                <small className="admin-muted">
                  Acceso privado para el equipo de El capo.
                </small>
              </form>
            )}
          </section>
        </main>
      </div>
    );

  return (
    <div className="admin-shell">
      {topbar}
      <main className="admin-main">
        <div className="admin-heading">
          <div>
            <p className="admin-eyebrow">ESPACIO DE ADMINISTRACIÓN</p>
            <h1>Un taller en orden.</h1>
            <p>Todo lo que ofreces, listo para actualizar.</p>
          </div>
          <span className="admin-connected">
            <i /> Catálogo conectado
          </span>
        </div>
        {error && (
          <div className="admin-message is-error" role="alert">
            <span>{error}</span>
            <button aria-label="Cerrar aviso" onClick={() => setError("")}>
              <X size={17} />
            </button>
          </div>
        )}
        {notice && (
          <div className="admin-message is-success" role="status">
            <Check size={18} />
            <span>{notice}</span>
            <button aria-label="Cerrar aviso" onClick={() => setNotice("")}>
              <X size={17} />
            </button>
          </div>
        )}
        <div className="admin-metrics">
          <div>
            <span>Muebles en catálogo</span>
            <strong>{products.length.toString().padStart(2, "0")}</strong>
          </div>
          <div>
            <span>Visibles en la tienda</span>
            <strong>
              {activeCount.toString().padStart(2, "0")}
              <i className="admin-dot" />
            </strong>
          </div>
          <div>
            <span>Acabados publicados</span>
            <strong>
              {settings.materials
                .filter((material) => material.active)
                .length.toString()
                .padStart(2, "0")}
            </strong>
          </div>
          <div>
            <span>Agenda del taller</span>
            <strong className="admin-metric-text">
              {settings.availability}
            </strong>
            <small>Plazo general: {settings.leadWeeks} semanas</small>
          </div>
        </div>
        <Tabs defaultValue="catalog" className="admin-tabs">
          <TabsList className="admin-tab-list">
            <TabsTrigger value="catalog">
              <Package size={17} />
              Catálogo
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings2 size={17} />
              Ajustes del taller
              {settingsDirty && (
                <i
                  className="admin-unsaved-dot"
                  aria-label="Cambios sin guardar"
                />
              )}
            </TabsTrigger>
            <TabsTrigger value="cuts">
              <Ruler size={17} />
              Despiece
            </TabsTrigger>
          </TabsList>
          <TabsContent value="catalog">
            <section className="admin-panel">
              <div className="admin-panel-heading">
                <div>
                  <h2>Muebles de melamina</h2>
                  <p>Añade, duplica o retira modelos desde aquí.</p>
                </div>
                <button
                  className="button rust"
                  onClick={() => openEditor()}
                  disabled={!!busy}
                >
                  <Plus size={17} /> Nuevo mueble
                </button>
              </div>
              <div className="admin-toolbar">
                <label className="admin-search">
                  <Search size={17} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar un mueble…"
                    aria-label="Buscar muebles por nombre, identificador o categoría"
                  />
                </label>
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  aria-label="Filtrar por estado"
                >
                  <option value="all">Todos los estados</option>
                  <option value="visible">Visibles</option>
                  <option value="draft">Borradores</option>
                </select>
                <div className="admin-data-actions">
                  <button
                    onClick={() =>
                      download(
                        "El-capo-catalogo.csv",
                        exportCatalogCSV(products),
                        "text/csv;charset=utf-8",
                      )
                    }
                    disabled={!products.length}
                  >
                    <Download size={16} /> Exportar
                  </button>
                  <button
                    onClick={() => fileInput.current?.click()}
                    disabled={!!busy}
                  >
                    <FileUp size={16} /> Importar
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".csv,.json"
                    hidden
                    onChange={(event) =>
                      void readImport(event.target.files?.[0])
                    }
                  />
                </div>
              </div>
              <Table className="admin-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Dimensiones iniciales</TableHead>
                    <TableHead>Plazo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="admin-table-actions">
                      Acciones
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="admin-product-cell">
                          <div
                            className="admin-product-icon"
                            style={
                              {
                                "--furniture-color":
                                  settings.materials.find(
                                    (material) =>
                                      material.id === product.defaults.finish,
                                  )?.color ?? "#a57556",
                              } as CSSProperties
                            }
                          >
                            <i />
                            <i />
                            <i />
                            <i />
                          </div>
                          <div>
                            <strong>{product.name}</strong>
                            <small>
                              {product.category} · {product.id}
                            </small>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span>
                          {product.defaults.width} × {product.defaults.height} ×{" "}
                          {product.defaults.depth}
                        </span>
                        <small className="admin-cell-note">
                          ancho × alto × fondo · mm
                        </small>
                      </TableCell>
                      <TableCell>{product.weeks} sem.</TableCell>
                      <TableCell>
                        <button
                          className="admin-status-button"
                          onClick={() => {
                            setError("");
                            setToggle(product);
                          }}
                          aria-label={`${product.active ? "Ocultar" : "Activar"} ${product.name}`}
                          disabled={!!busy}
                        >
                          <Status active={product.active} />
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="admin-row-actions">
                          <button
                            aria-label={`Editar ${product.name}`}
                            title="Editar"
                            onClick={() => openEditor(product)}
                            disabled={!!busy}
                          >
                            <Pencil size={17} />
                          </button>
                          <button
                            aria-label={`Duplicar ${product.name}`}
                            title="Duplicar como borrador"
                            onClick={() => openEditor(product, true)}
                            disabled={!!busy}
                          >
                            <Copy size={17} />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!filtered.length && (
                <div className="admin-empty">
                  <Package size={30} strokeWidth={1} />
                  <h3>
                    {products.length
                      ? "No encontramos ese mueble"
                      : "Tu primer mueble empieza aquí"}
                  </h3>
                  <p>
                    {products.length
                      ? "Prueba otro nombre o cambia el filtro."
                      : "Crea un modelo o importa tu catálogo con la plantilla."}
                  </p>
                </div>
              )}
              <div className="admin-table-foot">
                <span>
                  {filtered.length} de {products.length} muebles · Los
                  borradores no se muestran a tus clientes.
                </span>
                <button
                  onClick={() =>
                    download(
                      "El-capo-plantilla.csv",
                      catalogCSVTemplate(settings),
                      "text/csv;charset=utf-8",
                    )
                  }
                >
                  Descargar plantilla CSV <ArrowUpRight size={14} />
                </button>
              </div>
            </section>
            <div className="admin-bottom-note">
              <SlidersHorizontal size={17} />
              <p>
                La estructura del configurador es permanente. Tu catálogo, los
                acabados y los costos se administran desde este espacio.
              </p>
            </div>
          </TabsContent>
          <TabsContent value="settings">
            <form onSubmit={saveSettings} className="admin-settings-form">
              <section className="admin-panel">
                <div className="admin-panel-heading">
                  <div>
                    <h2>Contacto y capacidad</h2>
                    <p>Lo que tus clientes necesitan saber antes de pedir.</p>
                  </div>
                </div>
                <div className="admin-form-grid admin-padded">
                  <Field
                    title="WhatsApp comercial 1"
                    note="Código de país + número, sin signos ni espacios. Vacío oculta este número."
                  >
                    <input
                      value={settings.whatsapp}
                      placeholder="Ej. 51987654321"
                      inputMode="tel"
                      onChange={(event) =>
                        setSetting("whatsapp", event.target.value)
                      }
                    />
                  </Field>
                  <Field
                    title="WhatsApp comercial 2"
                    note="Segundo número de atención, opcional. Código de país + número, sin signos ni espacios."
                  >
                    <input
                      value={settings.whatsappSecondary ?? ""}
                      placeholder="Ej. 51987654321"
                      inputMode="tel"
                      onChange={(event) =>
                        setSetting("whatsappSecondary", event.target.value)
                      }
                    />
                  </Field>
                  <Field title="Disponibilidad del taller">
                    <select
                      value={settings.availability}
                      onChange={(event) =>
                        setSetting(
                          "availability",
                          event.target.value as Settings["availability"],
                        )
                      }
                    >
                      <option>Disponible</option>
                      <option>Disponibilidad media</option>
                      <option>Agenda limitada</option>
                    </select>
                  </Field>
                  <NumberField
                    title="Plazo general · semanas"
                    value={settings.leadWeeks}
                    min={1}
                    max={52}
                    change={(value) => setSetting("leadWeeks", value)}
                    note="Cada mueble también tiene su propio plazo de fabricación."
                  />
                </div>
              </section>
              <section className="admin-panel">
                <div className="admin-panel-heading">
                  <div>
                    <h2>Materiales y acabados</h2>
                    <p>
                      Marcas, acabados y variantes RH de 18 mm. Todo editable
                      aquí.
                    </p>
                  </div>
                  <div className="admin-material-actions">
                    <button
                      type="button"
                      className="button outline"
                      onClick={() => {
                        const merged = mergeCommercialMaterials(
                          settings.materials,
                          commercialMaterials,
                        );
                        if (merged.length > 100) {
                          setNotice(
                            "El catálogo admite 100 acabados. Añade las referencias que necesitas de forma individual.",
                          );
                          return;
                        }
                        const additions =
                          merged.length - settings.materials.length;
                        setSetting("materials", merged);
                        setNotice(
                          additions
                            ? `${additions} acabados añadidos como ocultos y referencias oficiales completadas. Revisa precios y activa los que ofreces; guarda para publicar.`
                            : "Referencias oficiales completadas donde faltaban. Se conservaron tus nombres, precios y visibilidad. Guarda los ajustes para publicar.",
                        );
                      }}
                    >
                      <Plus size={16} /> Añadir catálogo de marcas
                    </button>
                    <button
                      type="button"
                      className="button outline"
                      onClick={() =>
                        setSetting("materials", [
                          ...settings.materials,
                          {
                            id: `acabado-${settings.materials.length + 1}`,
                            name: "Nuevo acabado",
                            color: "#c2a17c",
                            price: 100,
                            active: false,
                            brand:
                              materialFilter === "all"
                                ? "Hispano"
                                : materialFilter,
                            code: "",
                            board: "standard",
                          },
                        ])
                      }
                    >
                      <Plus size={16} /> Añadir acabado
                    </button>
                  </div>
                </div>
                <div className="admin-material-list">
                  <div className="admin-material-filter">
                    <Field title="Filtrar por marca">
                      <select
                        value={materialFilter}
                        onChange={(event) =>
                          setMaterialFilter(event.target.value)
                        }
                      >
                        <option value="all">Todas las marcas</option>
                        {materialBrands(settings.materials).map((brand) => (
                          <option key={brand}>{brand}</option>
                        ))}
                      </select>
                    </Field>
                    <label className="admin-field admin-material-search">
                      <span>Buscar acabado</span>
                      <input
                        type="search"
                        value={materialSearch}
                        placeholder="Nombre comercial, marca o código"
                        maxLength={100}
                        onChange={(event) =>
                          setMaterialSearch(event.target.value)
                        }
                      />
                    </label>
                    <p className="admin-help">
                      {settings.materials.filter(materialMatches).length}{" "}
                      acabados · Selección de catálogo; imágenes, tonos y costos
                      referenciales. Verifica la muestra, disponibilidad y
                      tarifa del proveedor.
                    </p>
                  </div>
                  {settings.materials.map((material, index) => {
                    if (!materialMatches(material)) return null;
                    const preset = commercialMaterials.find(
                      (item) =>
                        item.id === material.id &&
                        item.name === material.name &&
                        item.brand === material.brand &&
                        item.board === material.board,
                    );
                    const editMaterial = (
                      patch: Partial<Settings["materials"][number]>,
                    ) =>
                      setSetting(
                        "materials",
                        settings.materials.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, ...patch } : item,
                        ),
                      );
                    const used = products.some(
                      (product) =>
                        product.defaults.finish === material.id ||
                        product.defaults.interior === material.id,
                    );
                    return (
                      <div
                        className="admin-material-row commercial-material-row"
                        key={index}
                      >
                        <div className="admin-material-appearance">
                          <MaterialSwatch
                            material={material}
                            title={materialLabel(material)}
                          />
                          <Field title="Color">
                            <input
                              type="color"
                              value={material.color}
                              aria-label={`Color de ${material.name}`}
                              onChange={(event) =>
                                editMaterial({
                                  color: event.target.value,
                                  swatch: "",
                                })
                              }
                            />
                          </Field>
                        </div>
                        <Field title="Nombre comercial">
                          <input
                            value={material.name}
                            required
                            maxLength={70}
                            onChange={(event) =>
                              editMaterial({ name: event.target.value })
                            }
                          />
                        </Field>
                        <Field title="Marca">
                          <input
                            value={material.brand || ""}
                            list="material-brand-options"
                            maxLength={60}
                            placeholder="Hispano, Vesto, Pelikano…"
                            onChange={(event) => {
                              setMaterialFilter("all");
                              editMaterial({ brand: event.target.value });
                            }}
                          />
                        </Field>
                        <Field title="Tablero · 18 mm">
                          <select
                            value={material.board || "standard"}
                            onChange={(event) =>
                              editMaterial({
                                board: event.target.value as "standard" | "rh",
                              })
                            }
                          >
                            <option value="standard">Estándar</option>
                            <option value="rh">
                              RH · Resistente a la humedad
                            </option>
                          </select>
                        </Field>
                        <Field
                          title="Código del fabricante"
                          note="Opcional; no es el identificador interno."
                        >
                          <input
                            value={material.code || ""}
                            maxLength={60}
                            placeholder="Código de catálogo"
                            onChange={(event) =>
                              editMaterial({ code: event.target.value })
                            }
                          />
                        </Field>
                        <Field
                          title="Identificador"
                          note={used ? "En uso por el catálogo" : undefined}
                        >
                          <input
                            value={material.id}
                            required
                            pattern="[a-z0-9-]{2,60}"
                            disabled={used}
                            onChange={(event) =>
                              editMaterial({
                                id: event.target.value.toLowerCase(),
                              })
                            }
                          />
                        </Field>
                        <NumberField
                          title="Índice de costo"
                          min={1}
                          max={1000}
                          step={0.1}
                          value={material.price}
                          change={(value) => editMaterial({ price: value })}
                        />
                        <div className="admin-material-metadata">
                          <Field
                            title="Textura"
                            note="Opcional; usa la denominación de la ficha del fabricante."
                          >
                            <input
                              value={material.texture || ""}
                              maxLength={80}
                              placeholder="Textura comercial"
                              onChange={(event) =>
                                editMaterial({ texture: event.target.value })
                              }
                            />
                          </Field>
                          <Field
                            title="Ficha del fabricante"
                            note="Enlace público al catálogo oficial, opcional."
                          >
                            <input
                              type="url"
                              value={material.sourceUrl || ""}
                              maxLength={500}
                              placeholder="https://…"
                              onChange={(event) =>
                                editMaterial({ sourceUrl: event.target.value })
                              }
                            />
                          </Field>
                          {preset?.swatch && (
                            <label className="admin-switch-label">
                              <Switch
                                checked={material.swatch === preset.swatch}
                                onCheckedChange={(checked) =>
                                  editMaterial({
                                    swatch: checked ? preset.swatch : "",
                                    renderTexture: checked
                                      ? preset.renderTexture
                                      : false,
                                  })
                                }
                                aria-label={`Usar muestra del fabricante para ${material.name}`}
                              />
                              <span>
                                Usar muestra del fabricante. Al ajustar el color
                                manualmente se usa tu tono.
                              </span>
                            </label>
                          )}
                          <MaterialSource material={material} />
                        </div>
                        <label className="admin-switch-label">
                          <Switch
                            checked={material.active}
                            onCheckedChange={(active) =>
                              editMaterial({ active })
                            }
                            aria-label={`${material.active ? "Desactivar" : "Activar"} acabado ${material.name}`}
                          />
                          <span>{material.active ? "Visible" : "Oculto"}</span>
                        </label>
                      </div>
                    );
                  })}
                  <datalist id="material-brand-options">
                    <option value="Hispano" />
                    <option value="Vesto" />
                    <option value="Pelikano" />
                  </datalist>
                  {!settings.materials.some(materialMatches) && (
                    <p className="admin-help">
                      No hay acabados con estos filtros. Prueba otro nombre o
                      marca.
                    </p>
                  )}
                  <p className="admin-help">
                    El índice 100 equivale a la tarifa base por m². Un índice
                    110 aumenta un 10 % el costo de ese acabado. Ocultar un
                    acabado lo retira del configurador; los identificadores en
                    uso se conservan. Crea un acabado separado para cada
                    variante RH y su costo. RH no significa impermeable. La
                    visibilidad no confirma stock del proveedor.
                  </p>
                </div>
              </section>
              <section className="admin-panel">
                <div className="admin-panel-heading">
                  <div>
                    <h2>Reglas de cotización</h2>
                    <p>
                      Costos internos que alimentan las estimaciones en soles.
                    </p>
                  </div>
                  <span className="admin-private">
                    <LockKeyhole size={13} /> Solo administración
                  </span>
                </div>
                <div className="admin-form-grid admin-padded">
                  <NumberField
                    title="Tarifa base · S/ por m²"
                    min={10}
                    max={1000}
                    step={0.1}
                    value={settings.materialRate}
                    change={(value) => setSetting("materialRate", value)}
                  />
                  <NumberField
                    title="Tapacanto · S/ por metro"
                    max={100}
                    step={0.1}
                    value={settings.edgeRate}
                    change={(value) => setSetting("edgeRate", value)}
                  />
                  <NumberField
                    title="Herrajes · S/ por puerta"
                    max={1000}
                    step={0.1}
                    value={settings.doorHardware}
                    change={(value) => setSetting("doorHardware", value)}
                  />
                  <NumberField
                    title="Instalación · S/"
                    max={5000}
                    step={0.1}
                    value={settings.installation}
                    change={(value) => setSetting("installation", value)}
                  />
                  <NumberField
                    title="Transporte · S/"
                    max={5000}
                    step={0.1}
                    value={settings.delivery}
                    change={(value) => setSetting("delivery", value)}
                  />
                  <NumberField
                    title="Margen comercial · %"
                    min={0}
                    max={80}
                    step={0.1}
                    value={Number((settings.margin * 100).toFixed(4))}
                    change={(value) => setSetting("margin", value / 100)}
                    note="Precio = costo / (1 − margen), más servicios."
                  />
                </div>
              </section>
              <div className="admin-save-bar">
                <p>
                  {settingsDirty
                    ? "Tienes cambios pendientes de guardar."
                    : "Todos los ajustes están guardados."}
                </p>
                <button
                  className="button rust"
                  disabled={!!busy || !settingsDirty}
                >
                  {busy === "settings" ? (
                    <Loader2 className="admin-spin" size={17} />
                  ) : (
                    <Check size={17} />
                  )}{" "}
                  Guardar ajustes
                </button>
              </div>
            </form>
          </TabsContent>
          <TabsContent value="cuts">
            <section className="admin-panel">
              <div className="admin-panel-heading">
                <div>
                  <h2>Despiece del taller</h2>
                  <p>Consulta técnica privada para el equipo de El capo.</p>
                </div>
                <span className="admin-private">
                  <LockKeyhole size={14} /> Acceso de administración
                </span>
              </div>
              <div className="admin-cut-body">
                <form onSubmit={loadCutList} className="admin-cut-form">
                  <Field title="Consultar">
                    <select
                      value={cutSource}
                      disabled={!!busy}
                      onChange={(event) => {
                        setCutSource(event.target.value as "current" | "saved");
                        setCutList(null);
                        setCutError("");
                      }}
                    >
                      <option value="current">Modelo del catálogo</option>
                      <option value="saved">Diseño guardado</option>
                    </select>
                  </Field>
                  {cutSource === "current" ? (
                    <Field
                      title="Modelo visible"
                      note="Se usa la configuración inicial que está guardada en el catálogo."
                    >
                      <select
                        value={selectedCutProduct?.id ?? ""}
                        required
                        disabled={!!busy || !cutProducts.length}
                        onChange={(event) => {
                          setCutProductId(event.target.value);
                          setCutList(null);
                          setCutError("");
                        }}
                      >
                        {!cutProducts.length && (
                          <option value="">Sin modelos visibles</option>
                        )}
                        {cutProducts.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : (
                    <Field
                      title="Enlace o identificador del diseño"
                      note="Conserva las medidas y materiales de la versión guardada, aunque el catálogo cambie."
                    >
                      <input
                        type="text"
                        value={cutDesignReference}
                        placeholder="Pega el enlace /configurar?d=…"
                        maxLength={2048}
                        autoComplete="off"
                        spellCheck={false}
                        required
                        disabled={!!busy}
                        onChange={(event) => {
                          setCutDesignReference(event.target.value);
                          setCutList(null);
                          setCutError("");
                        }}
                      />
                    </Field>
                  )}
                  <button
                    className="button rust"
                    disabled={
                      !!busy ||
                      (cutSource === "current"
                        ? !selectedCutProduct
                        : !cutDesignReference.trim())
                    }
                  >
                    {busy === "cut-list" ? (
                      <Loader2 size={17} className="admin-spin" />
                    ) : (
                      <Ruler size={17} />
                    )}
                    {busy === "cut-list"
                      ? "Consultando…"
                      : "Consultar despiece"}
                  </button>
                </form>
                {cutError && (
                  <div className="admin-message is-error" role="alert">
                    {cutError}
                  </div>
                )}
                {cutList && (
                  <div className="admin-cut-result">
                    <div className="admin-cut-heading">
                      <div>
                        <h3>{cutList.product.name}</h3>
                        <p>
                          {cutList.config.width} × {cutList.config.height} ×{" "}
                          {cutList.config.depth} mm
                          {cutList.source === "saved" && cutList.design
                            ? ` · Diseño guardado · versión ${cutList.design.version} · ${cutList.design.quantity} unidad(es) solicitada(s)`
                            : " · Configuración inicial del catálogo"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="button outline"
                        onClick={() =>
                          exportCuts(
                            cutList.result,
                            cutList.design?.id ?? cutList.product.id,
                          )
                        }
                      >
                        <Download size={17} /> Descargar CSV
                      </button>
                    </div>
                    <div className="admin-editor-note">
                      <strong>
                        Despiece preliminar. No autorizado para producción.
                      </strong>
                      <br />
                      Medidas en milímetros; primera medida: largo o alto. La
                      tabla y el CSV corresponden a una unidad del mueble y
                      requieren validación del taller.
                    </div>
                    <div className="admin-cut-summary">
                      <span>{cutList.result.panels.length} piezas</span>
                      <span>
                        {cutList.result.area.toFixed(2)} m² de melamina
                      </span>
                      <span>
                        {cutList.result.edges.toFixed(2)} m de tapacanto
                      </span>
                    </div>
                    <Table className="admin-table">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pieza</TableHead>
                          <TableHead>Largo/alto</TableHead>
                          <TableHead>Ancho</TableHead>
                          <TableHead>Espesor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cutList.result.panels.map((panel) => (
                          <TableRow key={panel.id}>
                            <TableCell>{panel.name}</TableCell>
                            <TableCell>{panel.length}</TableCell>
                            <TableCell>{panel.width}</TableCell>
                            <TableCell>18</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <p className="admin-help admin-cut-export-note">
                      El CSV incluye material, veta y los cuatro bordes de cada
                      pieza. La compatibilidad con tu versión de CutMaster debe
                      validarse.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <DialogContent
          className="admin-dialog admin-editor"
          showCloseButton={false}
          onInteractOutside={(event) => {
            if (editorDirty || !!busy) event.preventDefault();
          }}
        >
          <DialogHeader>
            <div className="admin-dialog-kicker">
              CATÁLOGO / {original ? "EDITAR" : "NUEVO MODELO"}
            </div>
            <DialogTitle>
              {original ? editor?.name : "Un nuevo mueble."}
            </DialogTitle>
            <DialogDescription>
              {original
                ? "Actualiza el modelo y sus opciones iniciales."
                : "Usa un modelo de melamina como punto de partida. Se guardará como borrador."}
            </DialogDescription>
          </DialogHeader>
          <button
            className="admin-dialog-close"
            aria-label="Cerrar editor"
            onClick={closeEditor}
            disabled={!!busy}
          >
            <X size={21} />
          </button>
          {editor && (
            <form onSubmit={saveProduct}>
              <div className="admin-dialog-body">
                {editorError && (
                  <div className="admin-message is-error" role="alert">
                    {editorError}
                  </div>
                )}
                {!original && (
                  <Field title="Modelo de partida">
                    <select
                      defaultValue=""
                      onChange={(event) => {
                        const template = seedProducts.find(
                          (product) => product.id === event.target.value,
                        );
                        if (template)
                          setEditor((current) =>
                            current
                              ? {
                                  ...compatibleTemplate(template),
                                  id: current.id,
                                  name: current.name,
                                  active: false,
                                  version: 1,
                                  order: current.order,
                                }
                              : null,
                          );
                      }}
                    >
                      <option value="" disabled>
                        Selecciona una estructura
                      </option>
                      {seedProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} · {product.category}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <h3>Información del modelo</h3>
                <div className="admin-form-grid">
                  <Field title="Nombre del mueble">
                    <input
                      value={editor.name}
                      onChange={(event) =>
                        setProduct("name", event.target.value)
                      }
                      minLength={2}
                      maxLength={70}
                      required
                      placeholder="Ej. Librero Esencial"
                    />
                  </Field>
                  <Field
                    title="Identificador único"
                    note={
                      original
                        ? "Permanente: conecta este modelo con sus configuraciones."
                        : "Minúsculas, números y guiones. Ej. librero-esencial"
                    }
                  >
                    <input
                      value={editor.id}
                      onChange={(event) =>
                        setProduct("id", event.target.value.toLowerCase())
                      }
                      readOnly={!!original}
                      pattern="[a-z0-9-]{2,60}"
                      required
                    />
                  </Field>
                  <Field title="Categoría">
                    <select
                      value={editor.category}
                      onChange={(event) =>
                        setProduct(
                          "category",
                          event.target.value as Product["category"],
                        )
                      }
                    >
                      {categories.map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                  </Field>
                  <NumberField
                    title="Orden en catálogo"
                    max={999}
                    value={editor.order}
                    change={(value) => setProduct("order", value)}
                  />
                  <Field title="Descripción" wide>
                    <textarea
                      rows={3}
                      minLength={5}
                      maxLength={350}
                      required
                      value={editor.description}
                      onChange={(event) =>
                        setProduct("description", event.target.value)
                      }
                    />
                  </Field>
                  <NumberField
                    title="Mano de obra base · S/"
                    max={50000}
                    step={0.1}
                    value={editor.basePrice}
                    change={(value) => setProduct("basePrice", value)}
                    note="Costo interno; no es el precio final del mueble."
                  />
                  <NumberField
                    title="Fabricación · semanas"
                    min={1}
                    max={52}
                    value={editor.weeks}
                    change={(value) => setProduct("weeks", value)}
                  />
                </div>
                <h3>Medidas y límites</h3>
                <p className="admin-help">
                  Todas las medidas están en milímetros, en pasos de 10 mm. La
                  medida inicial debe estar dentro del rango.
                </p>
                <div className="admin-dimension-grid">
                  <span />
                  <span>Mínimo</span>
                  <span>Inicial</span>
                  <span>Máximo</span>
                  {dimensions.map(({ key, name }) => (
                    <div className="admin-dimension-row" key={key}>
                      <strong>{name}</strong>
                      <input
                        type="number"
                        aria-label={`${name} mínimo en mm`}
                        required
                        min={100}
                        max={3000}
                        step={10}
                        value={
                          Number.isNaN(editor.limits[key].min)
                            ? ""
                            : editor.limits[key].min
                        }
                        onChange={(event) =>
                          setProduct("limits", {
                            ...editor.limits,
                            [key]: {
                              ...editor.limits[key],
                              min:
                                event.target.value === ""
                                  ? Number.NaN
                                  : Number(event.target.value),
                            },
                          })
                        }
                      />
                      <input
                        type="number"
                        aria-label={`${name} inicial en mm`}
                        required
                        min={100}
                        max={3000}
                        step={10}
                        value={
                          Number.isNaN(editor.defaults[key])
                            ? ""
                            : editor.defaults[key]
                        }
                        onChange={(event) =>
                          setConfig(
                            key,
                            event.target.value === ""
                              ? Number.NaN
                              : Number(event.target.value),
                          )
                        }
                      />
                      <input
                        type="number"
                        aria-label={`${name} máximo en mm`}
                        required
                        min={100}
                        max={3000}
                        step={10}
                        value={
                          Number.isNaN(editor.limits[key].max)
                            ? ""
                            : editor.limits[key].max
                        }
                        onChange={(event) =>
                          setProduct("limits", {
                            ...editor.limits,
                            [key]: {
                              ...editor.limits[key],
                              max:
                                event.target.value === ""
                                  ? Number.NaN
                                  : Number(event.target.value),
                            },
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
                <h3>Configuración inicial</h3>
                <div className="admin-form-grid">
                  <NumberField
                    title="Módulos verticales"
                    value={editor.defaults.modules}
                    min={1}
                    max={6}
                    change={(value) => setConfig("modules", value)}
                  />
                  <NumberField
                    title="Repisas por módulo"
                    value={editor.defaults.shelves}
                    min={0}
                    max={7}
                    change={(value) => setConfig("shelves", value)}
                  />
                  <Field title="Puertas">
                    <select
                      value={editor.defaults.doors}
                      onChange={(event) =>
                        setConfig(
                          "doors",
                          event.target.value as Config["doors"],
                        )
                      }
                    >
                      <option value="none">Sin puertas</option>
                      <option value="lower">Puertas inferiores</option>
                      <option value="full">Puertas completas</option>
                    </select>
                  </Field>
                  <Field title="Acabado exterior">
                    <select
                      value={editor.defaults.finish}
                      onChange={(event) =>
                        setConfig("finish", event.target.value)
                      }
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
                      value={editor.defaults.interior}
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
                  <Field title="Sistema de apertura">
                    <select
                      value={editor.defaults.handle}
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
                  <label className="admin-switch-label">
                    <Switch
                      checked={editor.defaults.install}
                      onCheckedChange={(value) => setConfig("install", value)}
                    />
                    Instalación seleccionada por defecto
                  </label>
                  <label className="admin-switch-label">
                    <Switch
                      checked={editor.defaults.transport}
                      onCheckedChange={(value) => setConfig("transport", value)}
                    />
                    Transporte seleccionado por defecto
                  </label>
                </div>
                <p className="admin-editor-note">
                  La melamina de 18 mm y las reglas de seguridad del
                  configurador son permanentes. Un modelo nuevo se publica
                  activándolo desde la tabla.
                </p>
              </div>
              <div className="admin-dialog-footer">
                <button
                  type="button"
                  className="button outline"
                  onClick={closeEditor}
                  disabled={!!busy}
                >
                  Cancelar
                </button>
                <button className="button rust" disabled={!!busy}>
                  {busy === "product"
                    ? "Guardando…"
                    : original
                      ? "Guardar cambios"
                      : "Crear borrador"}
                  <Check size={17} />
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={discard} onOpenChange={setDiscard}>
        <AlertDialogContent className="admin-dialog admin-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar sin guardar?</AlertDialogTitle>
            <AlertDialogDescription>
              Los cambios de este mueble no se han guardado. Puedes seguir
              editando o descartarlos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <button
              className="button rust"
              onClick={() => {
                setDiscard(false);
                setEditor(null);
              }}
            >
              Descartar cambios
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!toggle}
        onOpenChange={(open) => {
          if (!open && !busy) setToggle(null);
        }}
      >
        <AlertDialogContent className="admin-dialog admin-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggle?.active
                ? "¿Ocultar este mueble?"
                : "¿Publicar este mueble?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggle?.active
                ? `${toggle.name} dejará de aparecer en el catálogo. Sus datos se conservan y puedes activarlo de nuevo.`
                : `${toggle?.name} estará disponible para tus clientes con sus medidas y acabados actuales.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <div className="admin-message is-error" role="alert">
              {error}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Cancelar</AlertDialogCancel>
            <button
              className="button rust"
              onClick={toggleProduct}
              disabled={!!busy}
            >
              {busy === "toggle"
                ? "Guardando…"
                : toggle?.active
                  ? "Ocultar mueble"
                  : "Publicar mueble"}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={!!importPreview}
        onOpenChange={(open) => {
          if (!open && !busy) setImportPreview(null);
        }}
      >
        <DialogContent className="admin-dialog admin-import">
          <DialogHeader>
            <div className="admin-dialog-kicker">IMPORTACIÓN / REVISIÓN</div>
            <DialogTitle>Revisa tu catálogo.</DialogTitle>
            <DialogDescription>
              {importPreview?.filename} · Ningún cambio se ha guardado todavía.
            </DialogDescription>
          </DialogHeader>
          <div className="admin-dialog-body">
            {importPreview && (
              <>
                <p className="admin-import-summary">
                  <strong>{importPreview.products.length}</strong> muebles
                  preparados como borradores.
                </p>
                {importPreview.errors.length > 0 && (
                  <div className="admin-message is-error">
                    <div>
                      <strong>Corrige el archivo antes de importar.</strong>
                      <ul>
                        {importPreview.errors
                          .slice(0, 20)
                          .map((item, index) => (
                            <li key={index}>
                              Fila {item.row}: {item.message}
                            </li>
                          ))}
                      </ul>
                      {importPreview.errors.length > 20 && (
                        <p>Y {importPreview.errors.length - 20} errores más.</p>
                      )}
                    </div>
                  </div>
                )}
                <div className="admin-import-list">
                  {importPreview.products.map((product, index) => (
                    <div key={`${product.id}-${index}`}>
                      <span>
                        <strong>{product.name}</strong>
                        <small>
                          {product.id} · {product.category}
                        </small>
                      </span>
                      <Status active={false} />
                    </div>
                  ))}
                </div>
                <p className="admin-help">
                  Solo se crean modelos nuevos. Los identificadores existentes
                  no se sobrescriben. Publica cada borrador después de
                  revisarlo.
                </p>
              </>
            )}
            {importError && (
              <div className="admin-message is-error" role="alert">
                {importError}
              </div>
            )}
          </div>
          <div className="admin-dialog-footer">
            <button
              className="button outline"
              onClick={() => setImportPreview(null)}
              disabled={!!busy}
            >
              Cancelar
            </button>
            <button
              className="button rust"
              disabled={
                !!busy ||
                !importPreview?.products.length ||
                !!importPreview?.errors.length
              }
              onClick={confirmImport}
            >
              {busy === "import" ? "Importando…" : "Confirmar importación"}
              <Check size={17} />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
