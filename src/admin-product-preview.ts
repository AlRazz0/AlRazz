import {
  buildFurniture,
  type Product,
  type Settings,
} from "../lib/furniture.ts";
import { publicGeometry } from "../lib/public-geometry.ts";

const fieldNames: Record<string, string> = {
  id: "Identificador",
  name: "Nombre",
  description: "Descripción",
  basePrice: "Mano de obra base",
  "pricing.amount": "Tarifa de venta base",
  "defaults.front": "Material de puertas",
  frontOptions: "Materiales de puerta permitidos",
  weeks: "Plazo",
  order: "Orden",
  "defaults.width": "Ancho inicial",
  "defaults.height": "Alto inicial",
  "defaults.depth": "Fondo inicial",
  "defaults.modules": "Módulos",
  "defaults.shelves": "Repisas",
  "defaults.finish": "Acabado exterior",
  "defaults.interior": "Acabado interior",
  "limits.width.min": "Ancho mínimo",
  "limits.width.max": "Ancho máximo",
  "limits.height.min": "Alto mínimo",
  "limits.height.max": "Alto máximo",
  "limits.depth.min": "Fondo mínimo",
  "limits.depth.max": "Fondo máximo",
  "construction.storageWidth": "Ancho del módulo lateral",
  "construction.loftHeight": "Altura del altillo",
  "construction.hangingModules": "Módulos para colgar",
  "construction.plinthHeight": "Altura del zócalo",
  "construction.plinthSetback": "Retiro del zócalo",
  "gallery.caption": "Leyenda de la galería",
};

export function productEditorError(error: unknown): string {
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (
      error as {
        issues: {
          path: (string | number)[];
          message: string;
          code?: string;
          received?: string;
          minimum?: number;
          maximum?: number;
        }[];
      }
    ).issues;
    return issues
      .slice(0, 4)
      .map((issue) => {
        const path = issue.path.join(".");
        const label = fieldNames[path] ?? "Configuración";
        const message =
          issue.received === "nan"
            ? "completa el valor numérico"
            : issue.code === "too_small" && typeof issue.minimum === "number"
              ? `el mínimo es ${issue.minimum}`
              : issue.code === "too_big" && typeof issue.maximum === "number"
                ? `el máximo es ${issue.maximum}`
                : issue.message;
        return `${label}: ${message}.`;
      })
      .join(" ");
  }
  return error instanceof Error
    ? error.message
    : "Revisa los valores e inténtalo de nuevo. Tus cambios se conservan.";
}

/** Non-visual draft text must not prevent inspecting a new model before naming it. */
export function buildAdminPreview(draft: Product, settings: Settings) {
  const previewProduct: Product = {
    id: "vista-previa",
    name: "Vista previa",
    description: "Vista previa privada del modelo en edición.",
    category: draft.category,
    active: false,
    version: 1,
    order: 0,
    weeks: 1,
    construction: draft.construction,
    basePrice: draft.basePrice,
    pricing: draft.pricing,
    frontOptions: draft.frontOptions,
    limits: draft.limits,
    defaults: draft.defaults,
  };
  const result = buildFurniture(previewProduct, draft.defaults, settings);
  return {
    result,
    geometry: publicGeometry(result.panels, result.fixtures),
    config: { ...draft.defaults },
    materials: settings.materials,
  };
}
