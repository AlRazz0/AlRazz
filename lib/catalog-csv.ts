import {
  quoteCSVCell,
  constructionSchema,
  frontSchema,
  pricingSchema,
  productCategories,
  seedProducts,
  settingsSchema,
  validateProduct,
} from "./furniture.ts";
import type { Config, Product, Settings } from "./furniture.ts";
import { productTemplate } from "./product-templates.ts";
import { gallerySchema } from "./model-gallery.ts";

export type CatalogCSVError = { row: number; message: string };
export type CatalogCSVImport = {
  products: Product[];
  errors: CatalogCSVError[];
};
type Column =
  | "id"
  | "name"
  | "category"
  | "construction"
  | "storageSide"
  | "storageWidth"
  | "loftHeight"
  | "hangingModules"
  | "plinthHeight"
  | "plinthSetback"
  | "galleryEnabled"
  | "galleryScene"
  | "galleryCaption"
  | "frontOptions"
  | "front"
  | "pricingBasis"
  | "pricingAmount"
  | "description"
  | "basePrice"
  | "weeks"
  | "order"
  | "version"
  | "active"
  | "widthMin"
  | "widthMax"
  | "heightMin"
  | "heightMax"
  | "depthMin"
  | "depthMax"
  | "width"
  | "height"
  | "depth"
  | "modules"
  | "shelves"
  | "doors"
  | "finish"
  | "interior"
  | "handle"
  | "install"
  | "transport";
export const CATALOG_COLUMNS: ReadonlyArray<{ key: Column; label: string }> = [
  { key: "id", label: "Código" },
  { key: "name", label: "Nombre" },
  { key: "category", label: "Categoría" },
  { key: "construction", label: "Tipo constructivo" },
  { key: "storageSide", label: "Lado del módulo lateral" },
  { key: "storageWidth", label: "Ancho del módulo lateral mm" },
  { key: "loftHeight", label: "Alto libre del maletero mm" },
  { key: "hangingModules", label: "Columnas para colgar" },
  { key: "plinthHeight", label: "Alto del zócalo mm" },
  { key: "plinthSetback", label: "Retranqueo del zócalo mm" },
  { key: "galleryEnabled", label: "Galería habilitada" },
  { key: "galleryScene", label: "Ambiente de galería" },
  { key: "galleryCaption", label: "Texto de galería" },
  { key: "frontOptions", label: "Frentes permitidos" },
  { key: "front", label: "Frente inicial" },
  { key: "pricingBasis", label: "Base de cobro" },
  { key: "pricingAmount", label: "Tarifa de venta S/" },
  { key: "description", label: "Descripción" },
  { key: "basePrice", label: "Precio base S/" },
  { key: "weeks", label: "Semanas" },
  { key: "order", label: "Orden" },
  { key: "version", label: "Versión" },
  { key: "active", label: "Estado" },
  { key: "widthMin", label: "Ancho mínimo mm" },
  { key: "widthMax", label: "Ancho máximo mm" },
  { key: "heightMin", label: "Alto mínimo mm" },
  { key: "heightMax", label: "Alto máximo mm" },
  { key: "depthMin", label: "Fondo mínimo mm" },
  { key: "depthMax", label: "Fondo máximo mm" },
  { key: "width", label: "Ancho mm" },
  { key: "height", label: "Alto mm" },
  { key: "depth", label: "Fondo mm" },
  { key: "modules", label: "Módulos" },
  { key: "shelves", label: "Repisas por módulo" },
  { key: "doors", label: "Puertas" },
  { key: "finish", label: "Color exterior" },
  { key: "interior", label: "Color interior" },
  { key: "handle", label: "Jalador" },
  { key: "install", label: "Instalación" },
  { key: "transport", label: "Transporte" },
];

const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
const headerMap = new Map<string, Column>(
  CATALOG_COLUMNS.flatMap(
    (column) =>
      [
        [normalized(column.label), column.key],
        [normalized(column.key), column.key],
      ] as [string, Column][],
  ),
);
for (const [alias, key] of Object.entries({
  codigo: "id",
  producto: "name",
  precio_base: "basePrice",
  precio: "basePrice",
  alto: "height",
  ancho: "width",
  fondo: "depth",
  repisas: "shelves",
  color: "finish",
  activo: "active",
  ancho_min: "widthMin",
  ancho_max: "widthMax",
  alto_min: "heightMin",
  alto_max: "heightMax",
  fondo_min: "depthMin",
  fondo_max: "depthMax",
}))
  headerMap.set(alias, key as Column);

class ParseError extends Error {
  row: number;
  constructor(row: number, message: string) {
    super(message);
    this.row = row;
  }
}
type ParsedRow = { cells: string[]; row: number };

function delimiterFor(text: string): ";" | "," {
  let quoted = false,
    commas = 0,
    semicolons = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (character === ";") semicolons++;
      if (character === ",") commas++;
      if (character === "\n" || character === "\r") {
        if (commas || semicolons) break;
      }
    }
  }
  return commas > semicolons ? "," : ";";
}

/** RFC-style quoted fields, escaped quotes, CRLF and embedded newlines. */
function parseCSV(input: string): ParsedRow[] {
  const text = input.replace(/^\ufeff/, ""),
    delimiter = delimiterFor(text);
  const rows: ParsedRow[] = [];
  let cells: string[] = [],
    field = "",
    quoted = false,
    closedQuote = false,
    line = 1,
    rowStart = 1;
  const finishField = () => {
    cells.push(field);
    field = "";
    closedQuote = false;
  };
  const finishRow = () => {
    finishField();
    if (cells.some((cell) => cell.trim() !== ""))
      rows.push({ cells, row: rowStart });
    cells = [];
  };
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else if (character === "\r" || character === "\n") {
        if (character === "\r" && text[index + 1] === "\n") index++;
        field += "\n";
        line++;
      } else field += character;
      continue;
    }
    if (character === delimiter) {
      finishField();
      continue;
    }
    if (character === "\r" || character === "\n") {
      finishRow();
      if (character === "\r" && text[index + 1] === "\n") index++;
      line++;
      rowStart = line;
      continue;
    }
    if (closedQuote) {
      if (character === " " || character === "\t") continue;
      throw new ParseError(
        line,
        "Hay texto después del cierre de una celda entre comillas.",
      );
    }
    if (character === '"') {
      if (field.trim() !== "")
        throw new ParseError(
          line,
          "Una comilla dentro de una celda debe escaparse con dos comillas.",
        );
      field = "";
      quoted = true;
    } else field += character;
  }
  if (quoted)
    throw new ParseError(rowStart, "Falta cerrar las comillas de una celda.");
  if (field !== "" || cells.length || closedQuote) finishRow();
  return rows;
}

function numberCell(
  value: string | undefined,
  fallback: number,
  label: string,
): number {
  if (!value?.trim()) return fallback;
  const text = value.trim().replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(text))
    throw new Error(
      `${label}: escribe un número sin separador de miles ni símbolo de moneda.`,
    );
  const result = Number(text);
  if (!Number.isFinite(result)) throw new Error(`${label}: número inválido.`);
  return result;
}
function booleanCell(
  value: string | undefined,
  fallback: boolean,
  label: string,
): boolean {
  if (!value?.trim()) return fallback;
  if (["si", "true", "1", "yes"].includes(normalized(value))) return true;
  if (["no", "false", "0"].includes(normalized(value))) return false;
  throw new Error(`${label}: usa Sí o No.`);
}
function categoryCell(value?: string): Product["category"] {
  if (!value?.trim()) return "Estanterías";
  const category = productCategories.find(
    (category) => normalized(category) === normalized(value),
  );
  if (!category)
    throw new Error(`Categoría: usa ${productCategories.join(", ")}.`);
  return category;
}
function constructionCell(
  cells: Partial<Record<Column, string>>,
): Product["construction"] {
  if (!cells.construction?.trim()) {
    if (
      cells.storageSide ||
      cells.storageWidth ||
      cells.loftHeight ||
      cells.hangingModules ||
      cells.plinthHeight ||
      cells.plinthSetback
    )
      throw new Error(
        "Indica el Tipo constructivo correspondiente para configurar sus parámetros.",
      );
    return undefined;
  }
  const aliases: Record<string, string> = {
    cabinet: "cabinet",
    almacenaje: "cabinet",
    open_shelf: "open-shelf",
    estante_sin_trasera: "open-shelf",
    desk: "desk",
    escritorio: "desk",
    desk_storage: "desk-storage",
    escritorio_con_modulo_lateral: "desk-storage",
    wardrobe: "wardrobe",
    ropero: "wardrobe",
    kitchen_base: "kitchen-base",
    base_de_cocina: "kitchen-base",
  };
  const kind = aliases[normalized(cells.construction)] || cells.construction;
  const side = cells.storageSide ? normalized(cells.storageSide) : undefined;
  return constructionSchema.parse({
    kind,
    ...(side
      ? {
          storageSide:
            ({ izquierda: "left", derecha: "right" } as Record<string, string>)[
              side
            ] || side,
        }
      : {}),
    ...(cells.storageWidth
      ? {
          storageWidth: numberCell(
            cells.storageWidth,
            450,
            "Ancho del módulo lateral mm",
          ),
        }
      : {}),
    ...(cells.loftHeight
      ? {
          loftHeight: numberCell(
            cells.loftHeight,
            350,
            "Alto libre del maletero mm",
          ),
        }
      : {}),
    ...(cells.hangingModules
      ? {
          hangingModules: numberCell(
            cells.hangingModules,
            1,
            "Columnas para colgar",
          ),
        }
      : {}),
    ...(cells.plinthHeight
      ? {
          plinthHeight: numberCell(
            cells.plinthHeight,
            100,
            "Alto del zócalo mm",
          ),
        }
      : {}),
    ...(cells.plinthSetback
      ? {
          plinthSetback: numberCell(
            cells.plinthSetback,
            70,
            "Retranqueo del zócalo mm",
          ),
        }
      : {}),
  });
}
function galleryCell(
  cells: Partial<Record<Column, string>>,
): Product["gallery"] {
  if (!cells.galleryEnabled && !cells.galleryScene && !cells.galleryCaption)
    return undefined;
  return gallerySchema.parse({
    ...(cells.galleryEnabled
      ? {
          enabled: booleanCell(
            cells.galleryEnabled,
            true,
            "Galería habilitada",
          ),
        }
      : {}),
    ...(cells.galleryScene ? { scene: cells.galleryScene } : {}),
    ...(cells.galleryCaption ? { caption: cells.galleryCaption } : {}),
  });
}
function doorsCell(
  value: string | undefined,
  fallback: Config["doors"],
): Config["doors"] {
  if (!value?.trim()) return fallback;
  const map: Record<string, Config["doors"]> = {
    none: "none",
    sin_puertas: "none",
    abiertas: "none",
    lower: "lower",
    inferiores: "lower",
    full: "full",
    completas: "full",
  };
  const result = map[normalized(value)];
  if (!result)
    throw new Error("Puertas: usa Sin puertas, Inferiores o Completas.");
  return result;
}
function frontCell(value: string): Config["front"] {
  const aliases: Record<string, string> = {
    melamina: "melamine",
    vidrio: "glass",
    aluminio_vidrio: "aluminum-glass",
    aluminum_glass: "aluminum-glass",
  };
  return frontSchema.parse(aliases[normalized(value)] ?? value);
}
function pricingCell(
  cells: Partial<Record<Column, string>>,
): Product["pricing"] {
  if (!cells.pricingBasis) {
    if (cells.pricingAmount)
      throw new Error(
        "Indica la Base de cobro para configurar la Tarifa de venta.",
      );
    return undefined;
  }
  const aliases: Record<string, string> = {
    calculado: "calculated",
    unidad: "unit",
    metro_lineal: "linear-meter",
    linear_meter: "linear-meter",
  };
  const basis = aliases[normalized(cells.pricingBasis)] ?? cells.pricingBasis;
  if (basis !== "calculated" && !cells.pricingAmount)
    throw new Error(
      "Indica la Tarifa de venta para cobro por unidad o metro lineal.",
    );
  return pricingSchema.parse({
    basis,
    ...(cells.pricingAmount
      ? { amount: numberCell(cells.pricingAmount, 0, "Tarifa de venta S/") }
      : {}),
  });
}
function errorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray(error.issues)
  ) {
    return error.issues
      .map(
        (issue: { path?: unknown[]; message?: string }) =>
          `${issue.path?.join(".") || "Producto"}: ${issue.message}`,
      )
      .join(" ");
  }
  return error instanceof Error ? error.message : "La fila no es válida.";
}

/** Empty cells/templates must work with existing catalogs, including legacy-only materials. */
function compatibleDefaultFinish(
  preferred: string,
  settings?: Settings,
): string {
  if (!settings) return preferred;
  const { materials } = settingsSchema.parse(settings);
  return (
    materials.find(
      (material) => material.id === preferred && material.active,
    ) ?? materials.find((material) => material.active)!
  ).id;
}

/** Import is only a preview: callers must review errors and persist deliberately. All rows become drafts. */
export function importCatalogCSV(
  text: string,
  settings?: Settings,
): CatalogCSVImport {
  const result: CatalogCSVImport = { products: [], errors: [] };
  if (text.length > 2_000_000)
    return {
      products: [],
      errors: [
        { row: 1, message: "El CSV supera el límite de 2 MB de texto." },
      ],
    };
  let rows: ParsedRow[];
  try {
    rows = parseCSV(text);
  } catch (error) {
    return {
      products: [],
      errors: [
        {
          row: error instanceof ParseError ? error.row : 1,
          message: errorMessage(error),
        },
      ],
    };
  }
  if (!rows.length)
    return {
      products: [],
      errors: [{ row: 1, message: "El CSV está vacío." }],
    };
  if (rows.length > 1001)
    return {
      products: [],
      errors: [
        {
          row: rows[1001].row,
          message: "Importa como máximo 1000 productos por archivo.",
        },
      ],
    };
  const header = rows[0],
    columns: Column[] = [],
    usedColumns = new Set<Column>();
  for (const cell of header.cells) {
    const key = headerMap.get(normalized(cell));
    if (!key)
      result.errors.push({
        row: header.row,
        message: `Columna desconocida: «${cell}». Usa la plantilla descargable.`,
      });
    else if (usedColumns.has(key))
      result.errors.push({
        row: header.row,
        message: `Columna repetida: «${cell}».`,
      });
    else {
      columns.push(key);
      usedColumns.add(key);
    }
  }
  for (const required of ["id", "name"] as const)
    if (!usedColumns.has(required))
      result.errors.push({
        row: header.row,
        message: `Falta la columna ${required === "id" ? "Código" : "Nombre"}.`,
      });
  if (result.errors.length) return result;
  if (rows.length === 1)
    return {
      products: [],
      errors: [
        {
          row: header.row + 1,
          message: "Agrega al menos un producto debajo de los encabezados.",
        },
      ],
    };
  const seen = new Set<string>();
  for (const [index, row] of rows.slice(1).entries()) {
    try {
      if (row.cells.length !== columns.length)
        throw new Error(
          `La fila tiene ${row.cells.length} celdas; los encabezados tienen ${columns.length}. Revisa las comillas y el separador.`,
        );
      const cells: Partial<Record<Column, string>> = {};
      columns.forEach((column, index) => {
        cells[column] = row.cells[index].trim();
      });
      const category = categoryCell(cells.category);
      const construction = constructionCell(cells);
      const gallery = galleryCell(cells);
      const pricing = pricingCell(cells);
      const frontOptions = cells.frontOptions
        ? cells.frontOptions.split("|").map((value) => frontCell(value.trim())!)
        : undefined;
      const fallback = construction
        ? productTemplate(construction.kind)
        : seedProducts.find((product) => product.category === category) ||
          seedProducts[0];
      const numeric = (key: Column, value: number) =>
        numberCell(
          cells[key],
          value,
          CATALOG_COLUMNS.find((column) => column.key === key)!.label,
        );
      const product: Product = {
        id: cells.id || "",
        name: cells.name || "",
        category,
        ...(construction ? { construction } : {}),
        ...(gallery ? { gallery } : {}),
        ...(pricing ? { pricing } : {}),
        ...(frontOptions ? { frontOptions } : {}),
        description:
          cells.description ||
          `Mueble de melamina de 18 mm personalizable: ${cells.name || "nuevo modelo"}.`,
        active: false,
        version: numeric("version", 1),
        order: numeric("order", index),
        basePrice: numeric("basePrice", fallback.basePrice),
        weeks: numeric("weeks", fallback.weeks),
        limits: {
          width: {
            min: numeric("widthMin", fallback.limits.width.min),
            max: numeric("widthMax", fallback.limits.width.max),
          },
          height: {
            min: numeric("heightMin", fallback.limits.height.min),
            max: numeric("heightMax", fallback.limits.height.max),
          },
          depth: {
            min: numeric("depthMin", fallback.limits.depth.min),
            max: numeric("depthMax", fallback.limits.depth.max),
          },
        },
        defaults: {
          width: numeric("width", fallback.defaults.width),
          height: numeric("height", fallback.defaults.height),
          depth: numeric("depth", fallback.defaults.depth),
          modules: numeric("modules", fallback.defaults.modules),
          shelves: numeric("shelves", fallback.defaults.shelves),
          doors: doorsCell(cells.doors, fallback.defaults.doors),
          ...(cells.front ? { front: frontCell(cells.front) } : {}),
          finish:
            cells.finish ||
            compatibleDefaultFinish(fallback.defaults.finish, settings),
          interior: cells.interior || "same",
          handle: (cells.handle
            ? normalized(cells.handle)
            : fallback.defaults.handle) as Config["handle"],
          install: booleanCell(cells.install, false, "Instalación"),
          transport: booleanCell(cells.transport, false, "Transporte"),
        },
      };
      if (seen.has(product.id))
        throw new Error(`Código repetido dentro del archivo: ${product.id}.`);
      const validated = validateProduct(product, settings);
      seen.add(validated.id);
      result.products.push(validated);
    } catch (error) {
      result.errors.push({ row: row.row, message: errorMessage(error) });
    }
  }
  return result;
}

export function exportCatalogCSV(
  products: readonly Product[],
  delimiter: ";" | "," = ";",
): string {
  if (delimiter !== ";" && delimiter !== ",")
    throw new Error("El separador debe ser coma o punto y coma.");
  const lines = [
    CATALOG_COLUMNS.map((column) => quoteCSVCell(column.label)).join(delimiter),
  ];
  for (const product of products) {
    const values: Record<Column, string | number> = {
      id: product.id,
      name: product.name,
      category: product.category,
      construction: product.construction?.kind || "",
      storageSide:
        product.construction?.kind === "desk-storage"
          ? product.construction.storageSide || ""
          : "",
      storageWidth:
        product.construction?.kind === "desk-storage"
          ? (product.construction.storageWidth ?? "")
          : "",
      loftHeight:
        product.construction?.kind === "wardrobe"
          ? (product.construction.loftHeight ?? "")
          : "",
      hangingModules:
        product.construction?.kind === "wardrobe"
          ? (product.construction.hangingModules ?? "")
          : "",
      plinthHeight:
        product.construction?.kind === "kitchen-base"
          ? (product.construction.plinthHeight ?? "")
          : "",
      plinthSetback:
        product.construction?.kind === "kitchen-base"
          ? (product.construction.plinthSetback ?? "")
          : "",
      galleryEnabled:
        product.gallery?.enabled === undefined
          ? ""
          : product.gallery.enabled
            ? "Sí"
            : "No",
      galleryScene: product.gallery?.scene ?? "",
      galleryCaption: product.gallery?.caption ?? "",
      frontOptions: product.frontOptions?.join("|") ?? "",
      front: product.defaults.front ?? "",
      pricingBasis: product.pricing?.basis ?? "",
      pricingAmount:
        product.pricing && product.pricing.basis !== "calculated"
          ? product.pricing.amount
          : "",
      description: product.description,
      basePrice: product.basePrice,
      weeks: product.weeks,
      order: product.order,
      version: product.version,
      active: product.active ? "Activo" : "Borrador",
      widthMin: product.limits.width.min,
      widthMax: product.limits.width.max,
      heightMin: product.limits.height.min,
      heightMax: product.limits.height.max,
      depthMin: product.limits.depth.min,
      depthMax: product.limits.depth.max,
      width: product.defaults.width,
      height: product.defaults.height,
      depth: product.defaults.depth,
      modules: product.defaults.modules,
      shelves: product.defaults.shelves,
      doors: { none: "Sin puertas", lower: "Inferiores", full: "Completas" }[
        product.defaults.doors
      ],
      finish: product.defaults.finish,
      interior: product.defaults.interior,
      handle: product.defaults.handle,
      install: product.defaults.install ? "Sí" : "No",
      transport: product.defaults.transport ? "Sí" : "No",
    };
    lines.push(
      CATALOG_COLUMNS.map((column) => quoteCSVCell(values[column.key])).join(
        delimiter,
      ),
    );
  }
  return "\ufeff" + lines.join("\r\n");
}

export function catalogCSVTemplate(settings?: Settings): string {
  return exportCatalogCSV([
    {
      ...seedProducts[0],
      id: "nuevo-modular",
      name: "Nuevo modular",
      active: false,
      version: 1,
      defaults: {
        ...seedProducts[0].defaults,
        finish: compatibleDefaultFinish(
          seedProducts[0].defaults.finish,
          settings,
        ),
      },
    },
  ]);
}
