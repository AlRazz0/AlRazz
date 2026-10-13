import {
  getFrontOptions,
  validateProduct,
  type Construction,
  type Product,
  type Settings,
} from "../lib/furniture.ts";
import { productTemplate } from "../lib/product-templates.ts";
import { buildAdminPreview, productEditorError } from "./admin-product-preview.ts";

export type EditorSection =
  | "general"
  | "dimensions"
  | "finishes"
  | "gallery"
  | "publication";
export type EditorIssue = { section: EditorSection; message: string };

/** Local suggestion only: the server still enforces uniqueness when saving. */
export function uniqueProductId(name: string, existingIds: readonly string[]): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  const stem = normalized.length >= 2 ? normalized : "mueble";
  const used = new Set(existingIds);
  if (!used.has(stem)) return stem;
  for (let number = 2; ; number++) {
    const suffix = `-${number}`;
    const candidate = `${stem.slice(0, 60 - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

function nextOrder(products: readonly Product[]): number {
  return Math.min(999, Math.max(0, ...products.map((product) => product.order)) + 1);
}

export function createCatalogDraft(
  template: Product,
  products: readonly Product[],
  settings: Settings,
): Product {
  const draft = structuredClone(template);
  draft.id = uniqueProductId(template.name, products.map((product) => product.id));
  draft.active = false;
  draft.version = 1;
  draft.order = nextOrder(products);
  const active = settings.materials.filter((material) => material.active);
  // Do not invent a usable finish when the material catalog has none enabled.
  if (active[0]) {
    if (!active.some((material) => material.id === draft.defaults.finish))
      draft.defaults.finish = active[0].id;
    if (
      draft.defaults.interior !== "same" &&
      !active.some((material) => material.id === draft.defaults.interior)
    )
      draft.defaults.interior = "same";
  }
  return draft;
}

export function duplicateCatalogDraft(
  product: Product,
  products: readonly Product[],
  _settings: Settings,
): Product {
  // A copy retains commercial and material choices, even if they now need review.
  const suffix = " · copia";
  return {
    ...structuredClone(product),
    id: uniqueProductId(`${product.id.slice(0, 54)}-copia`, [product.id, ...products.map((item) => item.id)]),
    name: `${product.name.trim().slice(0, 70 - suffix.length).trimEnd()}${suffix}`,
    active: false,
    version: 1,
    order: nextOrder(products),
  };
}

export function changeDraftConstruction(
  value: Product,
  kind: Construction["kind"],
): Product {
  const draft = structuredClone(value);
  const template = productTemplate(kind);
  draft.construction = template.construction;
  draft.limits = template.limits;
  draft.defaults = {
    ...draft.defaults,
    width: template.defaults.width,
    height: template.defaults.height,
    depth: template.defaults.depth,
    modules: template.defaults.modules,
    shelves: template.defaults.shelves,
    doors: template.defaults.doors,
  };
  // Open constructions cannot advertise glass fronts in the shared engine.
  if (kind === "desk" || kind === "open-shelf")
    draft.frontOptions = ["melamine"];
  const allowed = getFrontOptions(draft);
  const previous = draft.defaults.front ?? "melamine";
  if (draft.defaults.doors === "none") {
    draft.defaults.front = "melamine";
  } else if (!allowed.includes(previous)) {
    draft.defaults.front = allowed[0] ?? "melamine";
  }
  if (draft.defaults.front && draft.defaults.front !== "melamine")
    draft.defaults.handle = "exterior";
  return draft;
}

function sectionForPath(path: (string | number)[]): EditorSection {
  const [field, detail] = path;
  if (field === "gallery") return "gallery";
  if (field === "construction" || field === "limits") return "dimensions";
  if (field === "frontOptions" || field === "materials" || field === "extras") return "finishes";
  if (field === "defaults") {
    if (["finish", "interior", "front", "handle", "extras"].includes(String(detail)))
      return "finishes";
    if (["install", "transport"].includes(String(detail))) return "publication";
    return "dimensions";
  }
  if (["id", "name", "description", "category", "weeks"].includes(String(field)))
    return "general";
  return "publication";
}

/** Save validation includes metadata, unlike the deliberately permissive visual preview. */
export function getEditorIssue(value: Product, settings: Settings): EditorIssue | null {
  try {
    validateProduct(value, settings);
    buildAdminPreview(value, settings);
    return null;
  } catch (error) {
    if (error && typeof error === "object" && "issues" in error) {
      const [issue] = (error as {
        issues: { path: (string | number)[]; code: string; message: string }[];
      }).issues;
      if (issue) {
        const messages: Record<string, string> = {
          invalid_type: "completa el valor con el tipo correcto",
          invalid_enum_value: "selecciona una opción válida",
          invalid_union: "revisa las opciones seleccionadas",
          invalid_union_discriminator: "selecciona una opción válida",
          invalid_string: issue.path[0] === "id"
            ? "usa entre 2 y 60 caracteres: minúsculas, números y guiones"
            : "revisa el formato del valor",
          not_finite: "introduce un número finito",
          unrecognized_keys: "contiene campos no admitidos",
        };
        return {
          section: sectionForPath(issue.path),
          message: productEditorError({
            issues: [{ ...issue, message: messages[issue.code] ?? issue.message }],
          }),
        };
      }
    }
    const message = productEditorError(error);
    const materialIssue = /material|color activo/i.test(message);
    const frontIssue = /frente|jalador|complemento|opci[oó]n/i.test(message) && !/\bmm\b|alto|altura/i.test(message);
    return { section: materialIssue || frontIssue ? "finishes" : "dimensions", message };
  }
}
