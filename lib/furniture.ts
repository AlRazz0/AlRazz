import { z } from "zod";
import { commercialMaterials } from "./material-presets.ts";

/** Manufacturing invariant: catalog/configuration cannot override this. */
export const THICKNESS = 18 as const;
export const finishes = [
  { id: "roble", name: "Roble natural", color: "#ba9161", price: 92 },
  { id: "arcilla", name: "Arcilla", color: "#ac5b42", price: 105 },
  { id: "blanco", name: "Blanco cálido", color: "#e6e1d4", price: 78 },
  { id: "oliva", name: "Verde ichu", color: "#777c58", price: 105 },
  { id: "azul", name: "Azul profundo", color: "#385767", price: 108 },
  { id: "grafito", name: "Grafito", color: "#454442", price: 98 },
];
const id = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9_-]{0,59}$/,
    "Usa un código de hasta 60 caracteres: minúsculas, números, guion o guion bajo",
  );
const materialId = id.refine(
  (value) => value !== "same",
  "El código same está reservado para el color interior",
);
const dim = z
  .number()
  .finite()
  .int()
  .min(100)
  .max(3000)
  .multipleOf(10, "Las medidas deben avanzar de 10 en 10 mm");
const amount = (maximum: number) => z.number().finite().min(0).max(maximum);
export const materialSchema = z
  .object({
    id: materialId,
    name: z.string().trim().min(2).max(70),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Usa un color hexadecimal de seis dígitos"),
    price: amount(5000),
    active: z.boolean(),
    // Default metadata keeps existing catalogs and historical snapshots readable.
    brand: z.string().trim().max(60).default(""),
    code: z.string().trim().max(60).default(""),
    board: z.enum(["standard", "rh"]).default("standard"),
  })
  .strict();
export type Material = z.infer<typeof materialSchema>;
export const configSchema = z
  .object({
    width: dim,
    height: dim,
    depth: dim,
    modules: z.number().int().min(1).max(6),
    shelves: z.number().int().min(0).max(7),
    doors: z.enum(["none", "lower", "full"]),
    finish: materialId,
    interior: z.union([z.literal("same"), materialId]),
    handle: z.enum(["push", "exterior", "embutido"]),
    install: z.boolean(),
    transport: z.boolean(),
  })
  .strict();
export type Config = z.infer<typeof configSchema>;
const limit = z
  .object({ min: dim, max: dim })
  .strict()
  .refine(
    (value) => value.min <= value.max,
    "El mínimo debe ser menor o igual al máximo",
  );
export const productSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{2,60}$/),
    name: z.string().trim().min(2).max(70),
    category: z.enum([
      "Estanterías",
      "Libreros",
      "Aparadores",
      "Muebles de TV",
    ]),
    description: z.string().trim().min(5).max(350),
    active: z.boolean(),
    version: z.number().int().min(1),
    order: z.number().int().min(0).max(999),
    basePrice: amount(50000),
    weeks: z.number().int().min(1).max(52),
    limits: z.object({ width: limit, height: limit, depth: limit }).strict(),
    defaults: configSchema,
  })
  .strict();
export type Product = z.infer<typeof productSchema>;
const seededMaterials = (): Material[] =>
  finishes.map((finish) => ({
    ...finish,
    active: true,
    brand: "",
    code: "",
    board: "standard",
  }));
const materialsSchema = z
  .array(materialSchema)
  .min(1)
  .max(100)
  .superRefine((materials, context) => {
    const seen = new Set<string>();
    for (const [index, material] of materials.entries()) {
      if (seen.has(material.id))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "id"],
          message: "El código de material está repetido",
        });
      seen.add(material.id);
    }
    if (!materials.some((material) => material.active))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Mantén al menos un material activo",
      });
  });
export const settingsSchema = z
  .object({
    whatsapp: z
      .string()
      .regex(
        /^$|^[1-9][0-9]{7,14}$/,
        "Usa código de país y número, sin + ni espacios",
      ),
    availability: z.enum([
      "Disponible",
      "Disponibilidad media",
      "Agenda limitada",
    ]),
    leadWeeks: z.number().int().min(1).max(52),
    materialRate: z.number().finite().min(10).max(1000),
    edgeRate: amount(100),
    doorHardware: amount(1000),
    installation: amount(5000),
    delivery: amount(5000),
    margin: z.number().finite().min(0).max(0.8),
    // Older catalogs without materials must retain their original finish IDs.
    materials: materialsSchema.default(seededMaterials),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  whatsapp: "",
  availability: "Disponibilidad media",
  leadWeeks: 3,
  materialRate: 100,
  edgeRate: 7,
  doorHardware: 46,
  installation: 120,
  delivery: 80,
  margin: 0.25,
  materials: commercialMaterials.map((material) => ({ ...material })),
};
export type PublicMaterial = Pick<
  Material,
  "id" | "name" | "color" | "active" | "brand" | "code" | "board"
>;
/** Explicit whitelist: supplier cost indices never leave the server. */
export function publicMaterials(settings: Settings): PublicMaterial[] {
  return settingsSchema
    .parse(settings)
    .materials.filter((material) => material.active)
    .map(({ id, name, color, active, brand, code, board }) => ({
      id,
      name,
      color,
      active,
      brand,
      code,
      board,
    }));
}
export function materialDisplayName(
  material: Pick<Material, "name" | "brand" | "code" | "board">,
): string {
  return `${material.brand ? `${material.brand} · ` : ""}${material.name}${material.code ? ` [${material.code}]` : ""}${material.board === "rh" ? " · RH" : ""}`;
}
const base: Config = {
  width: 1800,
  height: 1900,
  depth: 400,
  modules: 3,
  shelves: 3,
  doors: "lower",
  finish: "hispano-chiavenna",
  interior: "same",
  handle: "push",
  install: false,
  transport: false,
};
export const seedProducts: Product[] = [
  {
    id: "modular-01",
    name: "Modular Uno",
    category: "Estanterías",
    description:
      "Un lugar para tus libros, tus objetos y todo lo que te hace sentir en casa.",
    active: true,
    version: 1,
    order: 1,
    basePrice: 180,
    weeks: 3,
    limits: {
      width: { min: 600, max: 3000 },
      height: { min: 900, max: 2400 },
      depth: { min: 300, max: 600 },
    },
    defaults: { ...base },
  },
  {
    id: "librero-02",
    name: "Librero Alto",
    category: "Libreros",
    description: "Líneas simples, espacio abierto y tus historias a la vista.",
    active: true,
    version: 1,
    order: 2,
    basePrice: 150,
    weeks: 3,
    limits: {
      width: { min: 600, max: 2400 },
      height: { min: 1200, max: 2400 },
      depth: { min: 300, max: 500 },
    },
    defaults: {
      ...base,
      width: 1200,
      height: 2000,
      modules: 2,
      shelves: 5,
      doors: "none",
      finish: "hispano-roble-catania",
    },
  },
  {
    id: "aparador-03",
    name: "Aparador Calma",
    category: "Aparadores",
    description:
      "Todo en su sitio, con espacio para mostrar lo que más te gusta.",
    active: true,
    version: 1,
    order: 3,
    basePrice: 140,
    weeks: 3,
    limits: {
      width: { min: 600, max: 2400 },
      height: { min: 600, max: 1100 },
      depth: { min: 300, max: 600 },
    },
    defaults: {
      ...base,
      width: 1600,
      height: 800,
      modules: 3,
      shelves: 1,
      doors: "full",
      finish: "hispano-gris-grafito-02",
    },
  },
  {
    id: "tv-04",
    name: "Módulo Horizonte",
    category: "Muebles de TV",
    description: "Almacenaje de perfil bajo para acompañar tu sala.",
    active: true,
    version: 1,
    order: 4,
    basePrice: 120,
    weeks: 3,
    limits: {
      width: { min: 900, max: 3000 },
      height: { min: 400, max: 800 },
      depth: { min: 300, max: 550 },
    },
    defaults: {
      ...base,
      width: 1800,
      height: 500,
      modules: 3,
      shelves: 1,
      doors: "lower",
      finish: "hispano-blanco-100",
    },
  },
];
type Axis = "x" | "y" | "z";
type Edge = "Ninguno" | "Delgado" | "Grueso";
export type Panel = {
  id: string;
  name: string;
  quantity: 1;
  length: number;
  width: number;
  thickness: typeof THICKNESS;
  size: [number, number, number];
  position: [number, number, number];
  lengthAxis: Axis;
  widthAxis: Axis;
  material: string;
  materialName: string;
  grain: "Vertical" | "Horizontal";
  edges: { top: Edge; bottom: Edge; left: Edge; right: Edge };
  door?: boolean;
};
export type Result = {
  panels: Panel[];
  area: number;
  edges: number;
  doors: number;
  price: number;
  breakdown: {
    materials: number;
    edges: number;
    hardware: number;
    labor: number;
    installation: number;
    delivery: number;
  };
  accessories: { name: string; quantity: number }[];
};
const SIDE_CLEARANCE = 1,
  FRONT_GAP = 2,
  SHELF_FRONT_SETBACK = THICKNESS + FRONT_GAP,
  SHELF_REAR_GAP = 2,
  MIN_SHELF_CLEARANCE = 100;
/** Integral cuts: first modules receive the whole-mm remainder, difference at most 1 mm. */
function moduleWidths(config: Config): number[] {
  const available = config.width - (config.modules + 1) * THICKNESS;
  const whole = Math.floor(available / config.modules),
    remainder = available % config.modules;
  return Array.from(
    { length: config.modules },
    (_, index) => whole + (index < remainder ? 1 : 0),
  );
}
function verticalLayout(config: Config) {
  const interiorHeight = config.height - 2 * THICKNESS;
  const lowerHeight =
    config.doors === "lower" ? Math.round(interiorHeight * 0.38) : 0;
  const shelfStart = THICKNESS + lowerHeight + (lowerHeight ? THICKNESS : 0);
  return {
    interiorHeight,
    lowerHeight,
    shelfStart,
    shelfZone: config.height - THICKNESS - shelfStart,
  };
}
function activeMaterial(settings: Settings, materialId: string): Material {
  const material = settings.materials.find(
    (item) => item.id === materialId && item.active,
  );
  if (!material)
    throw new Error(
      `El material «${materialId}» no está disponible. Selecciona un color activo.`,
    );
  return material;
}
export function validateConfig(product: Product, config: Config): true {
  productSchema.parse(product);
  configSchema.parse(config);
  for (const key of ["width", "height", "depth"] as const) {
    const range = product.limits[key];
    if (config[key] < range.min || config[key] > range.max)
      throw new Error(
        `Medida inválida: ${{ width: "ancho", height: "alto", depth: "fondo" }[key]}. Respeta el rango y los pasos de 10 mm.`,
      );
  }
  const widths = moduleWidths(config);
  if (Math.min(...widths) < 180)
    throw new Error(
      "Cada módulo necesita al menos 180 mm libres. Reduce las divisiones.",
    );
  if (Math.max(...widths) > 750)
    throw new Error("La luz supera 750 mm. Agrega una división vertical.");
  if (config.doors !== "none" && Math.max(...widths) > 600)
    throw new Error(
      "Cada puerta admite un módulo de hasta 600 mm. Agrega un módulo o reduce el ancho.",
    );
  const layout = verticalLayout(config);
  if (
    (layout.shelfZone - config.shelves * THICKNESS) / (config.shelves + 1) <
    MIN_SHELF_CLEARANCE
  )
    throw new Error(
      "Las repisas necesitan al menos 100 mm de separación. Reduce las repisas o aumenta la altura.",
    );
  if (
    config.doors !== "none" &&
    (layout.lowerHeight || layout.interiorHeight) - 2 * FRONT_GAP < 120
  )
    throw new Error(
      "Cada puerta necesita al menos 120 mm de altura. Aumenta la altura o elige una distribución abierta.",
    );
  if (config.depth - THICKNESS - SHELF_REAR_GAP - SHELF_FRONT_SETBACK <= 0)
    throw new Error("El fondo no permite alojar las repisas y sus holguras.");
  return true;
}
export function validateProduct(input: Product, settings?: Settings): Product {
  const product = productSchema.parse(input);
  validateConfig(product, product.defaults);
  if (settings) {
    const parsed = settingsSchema.parse(settings);
    activeMaterial(parsed, product.defaults.finish);
    activeMaterial(
      parsed,
      product.defaults.interior === "same"
        ? product.defaults.finish
        : product.defaults.interior,
    );
  }
  return product;
}
export function buildFurniture(
  product: Product,
  config: Config,
  inputSettings: Settings = defaultSettings,
): Result {
  validateConfig(product, config);
  const settings = settingsSchema.parse(inputSettings);
  const outerMaterial = activeMaterial(settings, config.finish),
    innerMaterial = activeMaterial(
      settings,
      config.interior === "same" ? config.finish : config.interior,
    );
  const t = THICKNESS,
    { width: W, height: H, depth: D } = config;
  const {
      interiorHeight: I,
      lowerHeight,
      shelfStart,
      shelfZone,
    } = verticalLayout(config),
    widths = moduleWidths(config);
  const panels: Panel[] = [];
  const plainEdges: Panel["edges"] = {
    top: "Ninguno",
    bottom: "Ninguno",
    left: "Ninguno",
    right: "Ninguno",
  };
  const frontEdge: Panel["edges"] = { ...plainEdges, right: "Grueso" };
  const doorEdges: Panel["edges"] = {
    top: "Grueso",
    bottom: "Grueso",
    left: "Grueso",
    right: "Grueso",
  };
  function add(
    id: string,
    name: string,
    length: number,
    width: number,
    size: Panel["size"],
    position: Panel["position"],
    lengthAxis: Axis,
    widthAxis: Axis,
    material: Material,
    edges: Panel["edges"],
    door = false,
  ) {
    // Top/bottom end the length axis; left/right end the width axis. Front is +Z.
    panels.push({
      id,
      name,
      quantity: 1,
      length,
      width,
      thickness: t,
      size,
      position,
      lengthAxis,
      widthAxis,
      material: material.id,
      materialName: materialDisplayName(material),
      grain: lengthAxis === "y" ? "Vertical" : "Horizontal",
      edges: { ...edges },
      ...(door ? { door: true } : {}),
    });
  }
  add(
    "LAT_IZQ",
    "Lateral izquierdo",
    H,
    D,
    [t, H, D],
    [-W / 2 + t / 2, H / 2, 0],
    "y",
    "z",
    outerMaterial,
    frontEdge,
  );
  add(
    "LAT_DER",
    "Lateral derecho",
    H,
    D,
    [t, H, D],
    [W / 2 - t / 2, H / 2, 0],
    "y",
    "z",
    outerMaterial,
    frontEdge,
  );
  add(
    "TECHO",
    "Techo",
    W - 2 * t,
    D,
    [W - 2 * t, t, D],
    [0, H - t / 2, 0],
    "x",
    "z",
    outerMaterial,
    frontEdge,
  );
  add(
    "PISO",
    "Piso",
    W - 2 * t,
    D,
    [W - 2 * t, t, D],
    [0, t / 2, 0],
    "x",
    "z",
    outerMaterial,
    frontEdge,
  );
  add(
    "FONDO",
    "Trasera interior",
    I,
    W - 2 * t,
    [W - 2 * t, I, t],
    [0, H / 2, -D / 2 + t / 2],
    "y",
    "x",
    innerMaterial,
    plainEdges,
  );
  const shelfDepth = D - t - SHELF_REAR_GAP - SHELF_FRONT_SETBACK,
    shelfZ = (t + SHELF_REAR_GAP - SHELF_FRONT_SETBACK) / 2;
  const clearHeight = (shelfZone - config.shelves * t) / (config.shelves + 1);
  let left = -W / 2 + t;
  for (let module = 0; module < config.modules; module++) {
    const bay = widths[module],
      x = left + bay / 2;
    if (lowerHeight)
      add(
        `SEP_${module}`,
        `Separador inferior ${module + 1}`,
        bay - 2 * SIDE_CLEARANCE,
        shelfDepth,
        [bay - 2 * SIDE_CLEARANCE, t, shelfDepth],
        [x, t + lowerHeight + t / 2, shelfZ],
        "x",
        "z",
        innerMaterial,
        frontEdge,
      );
    for (let shelf = 0; shelf < config.shelves; shelf++)
      add(
        `REPISA_${module}_${shelf}`,
        `Repisa ${module + 1}.${shelf + 1}`,
        bay - 2 * SIDE_CLEARANCE,
        shelfDepth,
        [bay - 2 * SIDE_CLEARANCE, t, shelfDepth],
        [x, shelfStart + (shelf + 1) * clearHeight + shelf * t + t / 2, shelfZ],
        "x",
        "z",
        innerMaterial,
        frontEdge,
      );
    if (config.doors !== "none") {
      const doorHeight = (lowerHeight || I) - 2 * FRONT_GAP,
        doorWidth = bay - 2 * FRONT_GAP;
      add(
        `PUERTA_${module}`,
        `Puerta ${module + 1}`,
        doorHeight,
        doorWidth,
        [doorWidth, doorHeight, t],
        [x, t + FRONT_GAP + doorHeight / 2, D / 2 - t / 2],
        "y",
        "x",
        outerMaterial,
        doorEdges,
        true,
      );
    }
    left += bay;
    if (module < config.modules - 1) {
      add(
        `DIV_${module + 1}`,
        `División ${module + 1}`,
        I,
        D - t,
        [t, I, D - t],
        [left + t / 2, H / 2, t / 2],
        "y",
        "z",
        innerMaterial,
        frontEdge,
      );
      left += t;
    }
  }
  const area = panels.reduce(
    (sum, panel) => sum + (panel.length * panel.width) / 1e6,
    0,
  );
  const edges =
    panels.reduce(
      (sum, panel) =>
        sum +
        (panel.edges.top === "Ninguno" ? 0 : panel.width) +
        (panel.edges.bottom === "Ninguno" ? 0 : panel.width) +
        (panel.edges.left === "Ninguno" ? 0 : panel.length) +
        (panel.edges.right === "Ninguno" ? 0 : panel.length),
      0,
    ) / 1000;
  const doorPanels = panels.filter((panel) => panel.door),
    doors = doorPanels.length,
    hardware = doors * settings.doorHardware;
  const rates = new Map(
    settings.materials.map((material) => [
      material.id,
      (material.price * settings.materialRate) / 100,
    ]),
  );
  const materials = panels.reduce(
    (sum, panel) =>
      sum + ((panel.length * panel.width) / 1e6) * rates.get(panel.material)!,
    0,
  );
  const installation = config.install ? settings.installation : 0,
    delivery = config.transport ? settings.delivery : 0;
  const cost =
    product.basePrice + materials + edges * settings.edgeRate + hardware;
  const price =
    Math.ceil((cost / (1 - settings.margin) + installation + delivery) / 10) *
    10;
  return {
    panels,
    area,
    edges,
    doors,
    price,
    breakdown: {
      materials,
      edges: edges * settings.edgeRate,
      hardware,
      labor: product.basePrice,
      installation,
      delivery,
    },
    accessories: [
      {
        name: "Bisagras (referenciales)",
        quantity: doorPanels.reduce(
          (sum, panel) => sum + (panel.length > 1500 ? 3 : 2),
          0,
        ),
      },
      {
        name:
          config.handle === "push"
            ? "Sistema push"
            : `Jalador ${config.handle}`,
        quantity: doors,
      },
      {
        name: "Soportes de repisa",
        quantity: config.modules * config.shelves * 4,
      },
    ].filter((accessory) => accessory.quantity > 0),
  };
}
export function money(value: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 0,
  }).format(value);
}
/** Quoting alone does not stop spreadsheet formulas. Escape executable-looking text too. */
export function quoteCSVCell(value: unknown): string {
  const raw = String(value ?? "");
  const safe =
    /^[\s\u0000-\u001f]*[=+\-@]/.test(raw) || /^[\t\r]/.test(raw)
      ? `'${raw}`
      : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function cutCSV(result: Result): string {
  return (
    "\ufeff" +
    [
      "Despiece preliminar — no autorizado para producción",
      "Código;Pieza;Cantidad;Largo/alto mm;Ancho mm;Espesor mm;Material;Veta;Superior;Inferior;Izquierdo;Derecho",
      ...result.panels.map((panel) =>
        [
          panel.id,
          panel.name,
          panel.quantity,
          panel.length,
          panel.width,
          panel.thickness,
          panel.materialName,
          panel.grain,
          panel.edges.top,
          panel.edges.bottom,
          panel.edges.left,
          panel.edges.right,
        ]
          .map(quoteCSVCell)
          .join(";"),
      ),
    ].join("\r\n")
  );
}
