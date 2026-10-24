import { z } from "zod";
import { THICKNESS, validateProduct, type Construction, type Product, type Settings } from "../lib/furniture.ts";
import { productTemplate } from "../lib/product-templates.ts";
import { createCatalogDraft, uniqueProductId } from "./admin-catalog-draft.ts";

export const MAX_PLAN_BYTES = 1024 * 1024;
export const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
const componentSchema = z.object({
  name: z.string().trim().min(2).max(70),
  width: z.number().finite().positive().max(30000),
  height: z.number().finite().positive().max(30000),
  depth: z.number().finite().positive().max(30000),
  thickness: z.literal(THICKNESS).optional(),
}).strict();
const documentSchema = z.object({
  format: z.literal("alrazz-plan-v1"),
  units: z.literal("mm"),
  source: z.enum(["sketchup", "manual"]),
  thickness: z.literal(THICKNESS).optional(),
  components: z.array(componentSchema).min(1).max(100),
}).strict();
export type PlanComponent = z.infer<typeof componentSchema>;
export type PlanDocument = z.infer<typeof documentSchema>;

/** Dimensions only. No file can provide geometry, expressions, prices or API operations. */
export function parsePlanReference(text: string): PlanDocument {
  if (text.length > MAX_PLAN_BYTES || new TextEncoder().encode(text).length > MAX_PLAN_BYTES)
    throw Error("El archivo de medidas supera 1 MB.");
  let raw: unknown;
  try { raw = JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch { throw Error("El archivo no contiene un JSON de medidas válido."); }
  const result = documentSchema.safeParse(raw);
  if (!result.success)
    throw Error("Usa el formato de medidas de El capo: milímetros, nombre, ancho, alto y fondo numéricos. Si se indica espesor, debe ser de 18 mm. No se admiten fórmulas ni otros campos.");
  return result.data;
}

export function reviewPlanDimensions(component: Pick<PlanComponent, "width" | "height" | "depth">) {
  const reviewed = { width: component.width, height: component.height, depth: component.depth };
  for (const key of ["width", "height", "depth"] as const) {
    const value = component[key];
    if (!Number.isFinite(value) || value < 100 || value > 3000)
      throw Error("El motor admite medidas exteriores de 100 a 3000 mm. Divide los conjuntos mayores en muebles independientes.");
    reviewed[key] = Math.round(value / 10) * 10;
  }
  return reviewed;
}

export function createPlanDraft(
  input: { name: string; kind: Construction["kind"]; width: number; height: number; depth: number; modules: number; shelves: number },
  products: readonly Product[],
  settings: Settings,
): Product {
  const { width, height, depth } = input;
  for (const value of [width, height, depth]) {
    if (!Number.isInteger(value) || value < 100 || value > 3000 || value % 10 !== 0)
      throw Error("Revisa las medidas: de 100 a 3000 mm y en pasos de 10 mm.");
  }
  const template = productTemplate(input.kind);
  const draft = createCatalogDraft(template, products, settings);
  draft.name = input.name.trim();
  draft.id = uniqueProductId(draft.name, products.map(product => product.id));
  // A reference never becomes a new public selling tariff.
  draft.showPrice = false;
  draft.defaults = { ...draft.defaults, width, height, depth, modules: input.modules, shelves: input.shelves };
  for (const key of ["width", "height", "depth"] as const) {
    draft.limits[key] = {
      min: Math.min(draft.limits[key].min, input[key]),
      max: Math.max(draft.limits[key].max, input[key]),
    };
  }
  // The same engine as the editor/server checks construction, spans, doors and materials.
  return validateProduct(draft, settings);
}

export function referenceImageType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  const signature = (offset: number, value: string) => [...value].every((letter, index) => bytes[offset + index] === letter.charCodeAt(0));
  if (signature(0, "RIFF") && signature(8, "WEBP")) return "image/webp";
  return null;
}

export const planExample: PlanDocument = {
  format: "alrazz-plan-v1", source: "manual", units: "mm", thickness: THICKNESS,
  components: [{ name: "Estante del estudio", width: 1200, height: 1800, depth: 400 }],
};
