import { z } from "zod";
import { commercialMaterials } from "./material-presets.ts";
import { gallerySchema } from "./model-gallery.ts";

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
    // Optional so historical designs keep their original material projection.
    swatch: z
      .string()
      .regex(/^$|^\/images\/materials\/[a-z0-9-]+\.(?:jpg|jpeg|png|webp)$/)
      .optional(),
    sourceUrl: z
      .string()
      .max(600)
      .refine((value) => {
        if (!value) return true;
        try {
          const url = new URL(value);
          return (
            url.protocol === "https:" &&
            !url.username &&
            !url.password &&
            [
              "tableroshispanos.es",
              "www.tableroshispanos.es",
              "arauco.com",
              "www.arauco.com",
              "pelikano.com",
              "www.pelikano.com",
            ].includes(url.hostname)
          );
        } catch {
          return false;
        }
      }, "Usa una ficha HTTPS oficial de Hispano, Arauco o Pelíkano")
      .optional(),
    texture: z.string().trim().max(80).optional(),
    renderTexture: z.boolean().optional(),
  })
  .strict();
export type Material = z.infer<typeof materialSchema>;
export const frontKinds = ["melamine", "glass", "aluminum-glass"] as const;
export const frontSchema = z.enum(frontKinds);
export type Front = z.infer<typeof frontSchema>;
export const pricingSchema = z.discriminatedUnion("basis", [
  z.object({ basis: z.literal("calculated") }).strict(),
  z.object({ basis: z.literal("unit"), amount: amount(100000) }).strict(),
  z
    .object({ basis: z.literal("linear-meter"), amount: amount(100000) })
    .strict(),
]);
export const frontRatesSchema = z
  .object({
    glass: z
      .object({
        basis: z.enum(["square-meter", "unit"]),
        amount: amount(10000),
      })
      .strict()
      .optional(),
    aluminum: z
      .object({
        basis: z.enum(["linear-meter", "unit"]),
        amount: amount(10000),
      })
      .strict()
      .optional(),
    hardware: amount(2000).optional(),
  })
  .strict();
export const configSchema = z
  .object({
    width: dim,
    height: dim,
    depth: dim,
    modules: z.number().int().min(1).max(6),
    shelves: z.number().int().min(0).max(7),
    doors: z.enum(["none", "lower", "full"]),
    front: frontSchema.optional(),
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
export const productCategories = [
  "Estanterías",
  "Libreros",
  "Aparadores",
  "Muebles de TV",
  "Escritorios",
  "Veladores",
  "Zapateras",
  "Auxiliares",
  "Cocina",
  "Roperos",
] as const;
export const constructionKinds = [
  "cabinet",
  "open-shelf",
  "desk",
  "desk-storage",
  "wardrobe",
  "kitchen-base",
] as const;
export const constructionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cabinet") }).strict(),
  z.object({ kind: z.literal("open-shelf") }).strict(),
  z.object({ kind: z.literal("desk") }).strict(),
  z
    .object({
      kind: z.literal("wardrobe"),
      loftHeight: z.number().int().min(200).max(600).multipleOf(10).optional(),
      hangingModules: z.number().int().min(1).max(6).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("kitchen-base"),
      plinthHeight: z.number().int().min(60).max(180).multipleOf(10).optional(),
      plinthSetback: z
        .number()
        .int()
        .min(30)
        .max(150)
        .multipleOf(10)
        .optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("desk-storage"),
      storageSide: z.enum(["left", "right"]).optional(),
      // Exterior pedestal width, including both of its 18 mm sides.
      storageWidth: z
        .number()
        .finite()
        .int()
        .min(250)
        .max(650)
        .multipleOf(10)
        .optional(),
    })
    .strict(),
]);
export type Construction = z.infer<typeof constructionSchema>;
export type ResolvedConstruction =
  | Exclude<
      Construction,
      { kind: "desk-storage" | "wardrobe" | "kitchen-base" }
    >
  | {
      kind: "desk-storage";
      storageSide: "left" | "right";
      storageWidth: number;
    }
  | { kind: "wardrobe"; loftHeight: number; hangingModules: number }
  | { kind: "kitchen-base"; plinthHeight: number; plinthSetback: number };
export const productSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{2,60}$/),
    name: z.string().trim().min(2).max(70),
    category: z.enum(productCategories),
    construction: constructionSchema.optional(),
    gallery: gallerySchema.optional(),
    frontOptions: z
      .array(frontSchema)
      .min(1)
      .max(3)
      .refine(
        (values) => new Set(values).size === values.length,
        "No repitas tipos de frente",
      )
      .optional(),
    pricing: pricingSchema.optional(),
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
/** Optional fields remain absent in historical products, settings and snapshots. */
export function getFrontOptions(
  product: Pick<Product, "frontOptions">,
): Front[] {
  return [...(product.frontOptions ?? ["melamine"])];
}
export function getFrontRates(settings: Pick<Settings, "frontRates">) {
  return {
    glass: {
      ...(settings.frontRates?.glass ?? {
        basis: "square-meter" as const,
        amount: 180,
      }),
    },
    aluminum: {
      ...(settings.frontRates?.aluminum ?? {
        basis: "linear-meter" as const,
        amount: 45,
      }),
    },
    hardware: settings.frontRates?.hardware ?? 65,
  };
}
/** Resolve locally without adding defaults to stored products or snapshots. */
export function getConstruction(
  product: Pick<Product, "construction">,
): ResolvedConstruction {
  const construction = constructionSchema.parse(
    product.construction ?? { kind: "cabinet" },
  );
  if (construction.kind === "wardrobe")
    return {
      kind: "wardrobe",
      loftHeight: construction.loftHeight ?? 350,
      hangingModules: construction.hangingModules ?? 1,
    };
  if (construction.kind === "kitchen-base")
    return {
      kind: "kitchen-base",
      plinthHeight: construction.plinthHeight ?? 100,
      plinthSetback: construction.plinthSetback ?? 70,
    };
  return construction.kind === "desk-storage"
    ? {
        kind: "desk-storage",
        storageSide: construction.storageSide ?? "left",
        storageWidth: construction.storageWidth ?? 450,
      }
    : construction;
}
export function getConstructionOptions(
  product: Pick<Product, "construction">,
  config?: Pick<Config, "modules">,
): {
  modules: number[];
  shelves: number[];
  doors: Config["doors"][];
} {
  const construction = getConstruction(product);
  const { kind } = construction;
  if (kind === "desk") return { modules: [1], shelves: [0], doors: ["none"] };
  return {
    modules:
      kind === "desk-storage"
        ? [1]
        : [1, 2, 3, 4, 5, 6].filter(
            (value) =>
              kind !== "wardrobe" || value >= construction.hangingModules,
          ),
    shelves:
      kind === "wardrobe" &&
      config &&
      config.modules <= construction.hangingModules
        ? [0]
        : [0, 1, 2, 3, 4, 5, 6, 7],
    doors:
      kind === "open-shelf"
        ? ["none"]
        : kind === "desk-storage" ||
            kind === "wardrobe" ||
            kind === "kitchen-base"
          ? ["none", "full"]
          : ["none", "lower", "full"],
  };
}
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
    whatsappSecondary: z
      .string()
      .regex(
        /^$|^[1-9][0-9]{7,14}$/,
        "Usa código de país y número, sin + ni espacios",
      )
      .default(""),
    facebook: z
      .string()
      .trim()
      .max(600)
      .refine((value) => {
        if (!value) return true;
        try {
          const url = new URL(value);
          return (
            url.protocol === "https:" &&
            !url.username &&
            !url.password &&
            !url.port &&
            ["facebook.com", "www.facebook.com", "m.facebook.com"].includes(
              url.hostname,
            )
          );
        } catch {
          return false;
        }
      }, "Usa un enlace HTTPS de facebook.com, sin usuario ni contraseña en la dirección")
      .optional(),
    availability: z.enum([
      "Disponible",
      "Disponibilidad media",
      "Agenda limitada",
    ]),
    leadWeeks: z.number().int().min(1).max(52),
    materialRate: z.number().finite().min(10).max(1000),
    edgeRate: amount(100),
    doorHardware: amount(1000),
    clothesRailRate: amount(1000).optional(),
    clothesRailSupport: amount(500).optional(),
    frontRates: frontRatesSchema.optional(),
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
  whatsappSecondary: "",
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
  | "id"
  | "name"
  | "color"
  | "active"
  | "brand"
  | "code"
  | "board"
  | "swatch"
  | "sourceUrl"
  | "texture"
  | "renderTexture"
>;
/** Explicit whitelist: supplier cost indices never leave the server. */
export function publicMaterials(settings: Settings): PublicMaterial[] {
  return settingsSchema
    .parse(settings)
    .materials.filter((material) => material.active)
    .map(
      ({
        id,
        name,
        color,
        active,
        brand,
        code,
        board,
        swatch,
        sourceUrl,
        texture,
        renderTexture,
      }) => ({
        id,
        name,
        color,
        active,
        brand,
        code,
        board,
        ...(swatch !== undefined ? { swatch } : {}),
        ...(sourceUrl !== undefined ? { sourceUrl } : {}),
        ...(texture !== undefined ? { texture } : {}),
        ...(renderTexture !== undefined ? { renderTexture } : {}),
      }),
    );
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
  fixtures?: Fixture[];
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
    fronts?: number;
    sellingBase?: {
      basis: "unit" | "linear-meter";
      quantity: number;
      unitPrice: number;
      amount: number;
    };
  };
  accessories: {
    name: string;
    quantity: number;
    unit?: "m" | "m²" | "ud";
    unitCost?: number;
    cost?: number;
  }[];
};
/** Metal fittings are never melamine panels and never enter board cutting totals. */
export type ClothesRail = {
  id: string;
  name: string;
  kind: "clothes-rail";
  length: number;
  diameter: 25;
  position: [number, number, number];
};
/** A glass front is a separate fitting, never an 18 mm melamine cutting panel. */
export type FrontDoor = {
  id: string;
  name: string;
  kind: "front-door";
  surface: "glass" | "aluminum-glass";
  size: [number, number, number];
  position: [number, number, number];
  glassThickness: 6;
  glassWidth: number;
  glassHeight: number;
  glassArea: number;
  frameMeters: number;
};
export type Fixture = ClothesRail | FrontDoor;
export function clothesRailRates(
  settings: Pick<Settings, "clothesRailRate" | "clothesRailSupport">,
) {
  return {
    perMeter: settings.clothesRailRate ?? 35,
    perSupport: settings.clothesRailSupport ?? 8,
  };
}
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
function wardrobeLayout(
  config: Config,
  construction: Extract<ResolvedConstruction, { kind: "wardrobe" }>,
) {
  const mainHeight = config.height - 3 * THICKNESS - construction.loftHeight;
  return {
    mainHeight,
    loftY: THICKNESS + mainHeight + THICKNESS / 2,
    railY: THICKNESS + mainHeight - 80,
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
  const construction = getConstruction(product);
  const options = getConstructionOptions(product, config);
  const front = config.front ?? "melamine";
  if (
    !(config.doors === "none" && front === "melamine") &&
    !getFrontOptions(product).includes(front)
  )
    throw new Error("Este tipo de frente no está habilitado para el modelo.");
  if (
    (construction.kind === "desk" || construction.kind === "open-shelf") &&
    getFrontOptions(product).some((option) => option !== "melamine")
  )
    throw new Error("Esta construcción abierta no admite frentes de vidrio.");
  if (front !== "melamine" && config.doors === "none")
    throw new Error("Selecciona puertas para utilizar un frente de vidrio.");
  if (front !== "melamine" && config.handle !== "exterior")
    throw new Error(
      "Los frentes de vidrio requieren jalador exterior en este modelo preliminar.",
    );
  if (
    !options.modules.includes(config.modules) ||
    !options.shelves.includes(config.shelves) ||
    !options.doors.includes(config.doors)
  )
    throw new Error(
      "La distribución no es compatible con la construcción de este modelo.",
    );
  if (construction.kind === "desk" || construction.kind === "desk-storage") {
    if (
      config.height < 700 ||
      config.height > 850 ||
      config.depth < 450 ||
      config.depth > 750
    )
      throw new Error(
        "El escritorio admite alto de 700 a 850 mm y fondo de 450 a 750 mm.",
      );
    const maximumWidth = construction.kind === "desk" ? 1200 : 1600;
    if (config.width > maximumWidth)
      throw new Error(
        `Esta construcción de escritorio admite hasta ${maximumWidth} mm de ancho.`,
      );
    const kneeWidth =
      construction.kind === "desk"
        ? config.width - 2 * THICKNESS
        : config.width - construction.storageWidth - THICKNESS;
    if (
      kneeWidth < 600 ||
      (construction.kind === "desk-storage" && kneeWidth > 1000) ||
      config.height - THICKNESS < 620
    )
      throw new Error(
        "El hueco de trabajo requiere al menos 600 mm libres de ancho y 620 mm de alto; junto al pedestal admite hasta 1000 mm de ancho.",
      );
    // Unlike a shelf, a desktop has full-height side supports and a real rear apron.
    // These bounded pilot layouts still require workshop joint/load validation.
    if (construction.kind === "desk") return true;
  }
  const widths = moduleWidths(
    construction.kind === "desk-storage"
      ? { ...config, width: construction.storageWidth, modules: 1 }
      : config,
  );
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
  if (construction.kind === "wardrobe") {
    if (
      config.height < 1600 ||
      config.height > 2600 ||
      config.depth < 500 ||
      config.depth > 700
    )
      throw new Error(
        "El ropero admite alto de 1600 a 2600 mm y fondo de 500 a 700 mm.",
      );
    if (
      widths.slice(0, construction.hangingModules).some((width) => width < 350)
    )
      throw new Error(
        "Cada columna para colgar requiere al menos 350 mm libres de ancho.",
      );
    if (wardrobeLayout(config, construction).mainHeight - 80 - 25 / 2 < 900)
      throw new Error(
        "Deja al menos 900 mm libres bajo la barra: aumenta el alto o reduce el maletero.",
      );
  }
  if (
    construction.kind === "kitchen-base" &&
    (config.height < 700 ||
      config.height > 1000 ||
      config.depth < 450 ||
      config.depth > 750)
  )
    throw new Error(
      "La base de cocina admite alto de 700 a 1000 mm y fondo de 450 a 750 mm.",
    );
  const layout = verticalLayout(
    construction.kind === "kitchen-base"
      ? { ...config, height: config.height - construction.plinthHeight }
      : config,
  );
  if (
    front !== "melamine" &&
    (layout.lowerHeight || layout.interiorHeight) - 2 * FRONT_GAP > 1500
  )
    throw new Error(
      "Los frentes de vidrio admiten hasta 1500 mm de alto por puerta; reduce el alto o utiliza melamina.",
    );
  const shelfZone =
    construction.kind === "wardrobe"
      ? wardrobeLayout(config, construction).mainHeight
      : layout.shelfZone;
  if (
    (shelfZone - config.shelves * THICKNESS) / (config.shelves + 1) <
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
  const backThickness = construction.kind === "open-shelf" ? 0 : THICKNESS;
  if (config.depth - backThickness - SHELF_REAR_GAP - SHELF_FRONT_SETBACK <= 0)
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
  return createFurnitureBuilder(inputSettings)(product, config);
}
/** A private, validated settings snapshot for several builds within one request. */
export function createFurnitureBuilder(
  inputSettings: Settings = defaultSettings,
): (product: Product, config: Config) => Result {
  const settings = settingsSchema.parse(inputSettings);
  const rates = new Map(
    settings.materials.map((material) => [
      material.id,
      (material.price * settings.materialRate) / 100,
    ]),
  );
  return (product, config) =>
    buildWithSettings(product, config, settings, rates);
}
function buildWithSettings(
  product: Product,
  config: Config,
  settings: Settings,
  rates: ReadonlyMap<string, number>,
): Result {
  validateConfig(product, config);
  const outerMaterial = activeMaterial(settings, config.finish),
    innerMaterial = activeMaterial(
      settings,
      config.interior === "same" ? config.finish : config.interior,
    );
  const construction = getConstruction(product);
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
  const fixtures: Fixture[] = [];
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
    const front = config.front ?? "melamine";
    if (door && front !== "melamine") {
      const frameWidth = front === "aluminum-glass" ? 20 : 0;
      const depth = front === "aluminum-glass" ? 20 : 6;
      const glassWidth = size[0] - frameWidth * 2;
      const glassHeight = size[1] - frameWidth * 2;
      fixtures.push({
        id,
        name: `${name} · ${front === "glass" ? "vidrio" : "vidrio con marco de aluminio"}`,
        kind: "front-door",
        surface: front,
        size: [size[0], size[1], depth],
        position: [position[0], position[1], D / 2 - depth / 2],
        glassThickness: 6,
        glassWidth,
        glassHeight,
        glassArea: (glassWidth * glassHeight) / 1e6,
        frameMeters: frameWidth ? (2 * (size[0] + size[1])) / 1000 : 0,
      });
      return;
    }
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
  if (construction.kind === "desk" || construction.kind === "desk-storage") {
    const supportHeight = H - t;
    const apronHeight = 180;
    const sideEdges: Panel["edges"] = { ...frontEdge, left: "Grueso" };
    add(
      "TAPA",
      "Tapa de escritorio",
      W,
      D,
      [W, t, D],
      [0, H - t / 2, 0],
      "x",
      "z",
      outerMaterial,
      doorEdges,
    );
    const support = (id: string, name: string, x: number) =>
      add(
        id,
        name,
        supportHeight,
        D,
        [t, supportHeight, D],
        [x, supportHeight / 2, 0],
        "y",
        "z",
        outerMaterial,
        sideEdges,
      );
    let kneeWidth = W - 2 * t;
    let kneeCenter = 0;
    if (construction.kind === "desk") {
      support("LAT_IZQ", "Apoyo izquierdo", -W / 2 + t / 2);
      support("LAT_DER", "Apoyo derecho", W / 2 - t / 2);
    } else {
      const storageWidth = construction.storageWidth;
      const mirror = construction.storageSide === "left" ? 1 : -1;
      const center = (-W / 2 + storageWidth / 2) * mirror;
      const bay = storageWidth - 2 * t;
      support(
        "LAT_ALMACEN",
        "Lateral exterior del pedestal",
        (-W / 2 + t / 2) * mirror,
      );
      support(
        "DIV_ALMACEN",
        "Separación del pedestal y el hueco",
        (-W / 2 + storageWidth - t / 2) * mirror,
      );
      support(
        "APOYO_LIBRE",
        "Apoyo exterior del hueco",
        (W / 2 - t / 2) * mirror,
      );
      kneeWidth = W - storageWidth - t;
      kneeCenter = ((storageWidth - t) / 2) * mirror;
      add(
        "PISO_ALMACEN",
        "Piso del pedestal",
        bay,
        D,
        [bay, t, D],
        [center, t / 2, 0],
        "x",
        "z",
        innerMaterial,
        frontEdge,
      );
      add(
        "FONDO_ALMACEN",
        "Trasera del pedestal",
        I,
        bay,
        [bay, I, t],
        [center, H / 2, -D / 2 + t / 2],
        "y",
        "x",
        innerMaterial,
        plainEdges,
      );
      const shelfDepth = D - t - SHELF_REAR_GAP - SHELF_FRONT_SETBACK;
      const shelfZ = (t + SHELF_REAR_GAP - SHELF_FRONT_SETBACK) / 2;
      const clearance = (I - config.shelves * t) / (config.shelves + 1);
      for (let shelf = 0; shelf < config.shelves; shelf++)
        add(
          `REPISA_ALMACEN_${shelf}`,
          `Repisa del pedestal ${shelf + 1}`,
          bay - 2 * SIDE_CLEARANCE,
          shelfDepth,
          [bay - 2 * SIDE_CLEARANCE, t, shelfDepth],
          [center, t + (shelf + 1) * clearance + shelf * t + t / 2, shelfZ],
          "x",
          "z",
          innerMaterial,
          frontEdge,
        );
      if (config.doors === "full") {
        const doorHeight = I - 2 * FRONT_GAP,
          doorWidth = bay - 2 * FRONT_GAP;
        add(
          "PUERTA_ALMACEN",
          "Puerta del pedestal",
          doorHeight,
          doorWidth,
          [doorWidth, doorHeight, t],
          [center, H / 2, D / 2 - t / 2],
          "y",
          "x",
          outerMaterial,
          doorEdges,
          true,
        );
      }
    }
    // The apron occupies only the rear 18 mm and touches supports/top without overlap.
    add(
      "FALDON",
      "Faldón trasero de escritorio",
      kneeWidth,
      apronHeight,
      [kneeWidth, apronHeight, t],
      [kneeCenter, H - t - apronHeight / 2, -D / 2 + t / 2],
      "x",
      "y",
      innerMaterial,
      { ...plainEdges, left: "Grueso" },
    );
  } else {
    const bodyBottom =
      construction.kind === "kitchen-base" ? construction.plinthHeight : 0;
    const bodyHeight = H - bodyBottom;
    const innerHeight = bodyHeight - 2 * t;
    const bodyLayout = verticalLayout({ ...config, height: bodyHeight });
    const wardrobe =
      construction.kind === "wardrobe"
        ? wardrobeLayout(config, construction)
        : null;
    const backThickness = construction.kind === "open-shelf" ? 0 : t;
    const carcassEdges: Panel["edges"] =
      construction.kind === "open-shelf"
        ? { ...frontEdge, left: "Grueso" }
        : frontEdge;
    add(
      "LAT_IZQ",
      "Lateral izquierdo",
      bodyHeight,
      D,
      [t, bodyHeight, D],
      [-W / 2 + t / 2, bodyBottom + bodyHeight / 2, 0],
      "y",
      "z",
      outerMaterial,
      carcassEdges,
    );
    add(
      "LAT_DER",
      "Lateral derecho",
      bodyHeight,
      D,
      [t, bodyHeight, D],
      [W / 2 - t / 2, bodyBottom + bodyHeight / 2, 0],
      "y",
      "z",
      outerMaterial,
      carcassEdges,
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
      carcassEdges,
    );
    add(
      "PISO",
      "Piso",
      W - 2 * t,
      D,
      [W - 2 * t, t, D],
      [0, bodyBottom + t / 2, 0],
      "x",
      "z",
      outerMaterial,
      carcassEdges,
    );
    if (backThickness)
      add(
        "FONDO",
        "Trasera interior",
        innerHeight,
        W - 2 * t,
        [W - 2 * t, innerHeight, t],
        [0, bodyBottom + bodyHeight / 2, -D / 2 + t / 2],
        "y",
        "x",
        innerMaterial,
        plainEdges,
      );
    const shelfDepth = D - backThickness - SHELF_REAR_GAP - SHELF_FRONT_SETBACK,
      shelfZ = (backThickness + SHELF_REAR_GAP - SHELF_FRONT_SETBACK) / 2;
    const zone = wardrobe?.mainHeight ?? bodyLayout.shelfZone;
    const clearHeight = (zone - config.shelves * t) / (config.shelves + 1);
    let left = -W / 2 + t;
    for (let module = 0; module < config.modules; module++) {
      const bay = widths[module],
        x = left + bay / 2;
      if (wardrobe) {
        add(
          `MALETERO_${module}`,
          `Base del maletero ${module + 1}`,
          bay,
          D - t - SHELF_FRONT_SETBACK,
          [bay, t, D - t - SHELF_FRONT_SETBACK],
          [x, wardrobe.loftY, (t - SHELF_FRONT_SETBACK) / 2],
          "x",
          "z",
          innerMaterial,
          frontEdge,
        );
        if (
          construction.kind === "wardrobe" &&
          module < construction.hangingModules
        )
          fixtures.push({
            id: `BARRA_${module}`,
            name: `Barra de colgado ${module + 1}`,
            kind: "clothes-rail",
            length: bay - 4,
            diameter: 25,
            position: [x, wardrobe.railY, t / 2],
          });
      }
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
          carcassEdges,
        );
      const shelfCount =
        construction.kind === "wardrobe" && module < construction.hangingModules
          ? 0
          : config.shelves;
      for (let shelf = 0; shelf < shelfCount; shelf++)
        add(
          `REPISA_${module}_${shelf}`,
          `Repisa ${module + 1}.${shelf + 1}`,
          bay - 2 * SIDE_CLEARANCE,
          shelfDepth,
          [bay - 2 * SIDE_CLEARANCE, t, shelfDepth],
          [
            x,
            bodyBottom +
              bodyLayout.shelfStart +
              (shelf + 1) * clearHeight +
              shelf * t +
              t / 2,
            shelfZ,
          ],
          "x",
          "z",
          innerMaterial,
          carcassEdges,
        );
      if (config.doors !== "none") {
        const doorHeight = (lowerHeight || innerHeight) - 2 * FRONT_GAP,
          doorWidth = bay - 2 * FRONT_GAP;
        add(
          `PUERTA_${module}`,
          `Puerta ${module + 1}`,
          doorHeight,
          doorWidth,
          [doorWidth, doorHeight, t],
          [x, bodyBottom + t + FRONT_GAP + doorHeight / 2, D / 2 - t / 2],
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
          innerHeight,
          D - backThickness,
          [t, innerHeight, D - backThickness],
          [left + t / 2, bodyBottom + bodyHeight / 2, backThickness / 2],
          "y",
          "z",
          innerMaterial,
          carcassEdges,
        );
        left += t;
      }
    }
    if (construction.kind === "kitchen-base") {
      const kickDepth = D - construction.plinthSetback;
      const kickZ = -construction.plinthSetback / 2;
      const supportEdges: Panel["edges"] = { ...plainEdges, right: "Grueso" };
      for (const [label, x] of [
        ["IZQ", -W / 2 + t / 2],
        ["DER", W / 2 - t / 2],
      ] as const)
        add(
          `ZOCALO_${label}`,
          `Apoyo lateral de zócalo ${label}`,
          bodyBottom,
          kickDepth,
          [t, bodyBottom, kickDepth],
          [x, bodyBottom / 2, kickZ],
          "y",
          "z",
          outerMaterial,
          supportEdges,
        );
      for (const [label, z] of [
        ["FRENTE", D / 2 - construction.plinthSetback - t / 2],
        ["ATRAS", -D / 2 + t / 2],
      ] as const)
        add(
          `ZOCALO_${label}`,
          label === "FRENTE"
            ? "Frente de zócalo"
            : "Travesaño posterior de zócalo",
          W - 2 * t,
          bodyBottom,
          [W - 2 * t, bodyBottom, t],
          [0, bodyBottom / 2, z],
          "x",
          "y",
          outerMaterial,
          plainEdges,
        );
      let supportX = -W / 2 + t;
      for (let module = 0; module < config.modules - 1; module++) {
        supportX += widths[module];
        add(
          `ZOCALO_APOYO_${module + 1}`,
          `Apoyo interior de zócalo ${module + 1}`,
          bodyBottom,
          kickDepth - 2 * t,
          [t, bodyBottom, kickDepth - 2 * t],
          [supportX + t / 2, bodyBottom / 2, kickZ],
          "y",
          "z",
          innerMaterial,
          plainEdges,
        );
        supportX += t;
      }
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
  const rails = fixtures.filter(
    (fixture): fixture is ClothesRail => fixture.kind === "clothes-rail",
  );
  const fronts = fixtures.filter(
    (fixture): fixture is FrontDoor => fixture.kind === "front-door",
  );
  const railMeters = rails.reduce(
    (total, fixture) => total + fixture.length / 1000,
    0,
  );
  const railRates = clothesRailRates(settings);
  const railCost =
    railMeters * railRates.perMeter + rails.length * 2 * railRates.perSupport;
  const doorPanels = panels.filter((panel) => panel.door),
    doors = doorPanels.length + fronts.length,
    hardware = doorPanels.length * settings.doorHardware + railCost;
  const frontRates = getFrontRates(settings);
  const glassArea = fronts.reduce((sum, front) => sum + front.glassArea, 0);
  const aluminumFronts = fronts.filter(
    (front) => front.surface === "aluminum-glass",
  );
  const frameMeters = aluminumFronts.reduce(
    (sum, front) => sum + front.frameMeters,
    0,
  );
  const glassQuantity =
    frontRates.glass.basis === "unit" ? fronts.length : glassArea;
  const aluminumQuantity =
    frontRates.aluminum.basis === "unit" ? aluminumFronts.length : frameMeters;
  const frontCost =
    glassQuantity * frontRates.glass.amount +
    aluminumQuantity * frontRates.aluminum.amount +
    fronts.length * frontRates.hardware;
  const materials = panels.reduce(
    (sum, panel) =>
      sum + ((panel.length * panel.width) / 1e6) * rates.get(panel.material)!,
    0,
  );
  const installation = config.install ? settings.installation : 0,
    delivery = config.transport ? settings.delivery : 0;
  const cost =
    product.basePrice +
    materials +
    edges * settings.edgeRate +
    hardware +
    frontCost;
  const sellingBase =
    product.pricing && product.pricing.basis !== "calculated"
      ? {
          basis: product.pricing.basis,
          quantity: product.pricing.basis === "unit" ? 1 : W / 1000,
          unitPrice: product.pricing.amount,
          amount:
            product.pricing.amount *
            (product.pricing.basis === "unit" ? 1 : W / 1000),
        }
      : undefined;
  const furniturePrice = sellingBase
    ? sellingBase.amount + frontCost / (1 - settings.margin)
    : cost / (1 - settings.margin);
  const price = Math.ceil((furniturePrice + installation + delivery) / 10) * 10;
  return {
    panels,
    ...(fixtures.length ? { fixtures } : {}),
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
      ...(fronts.length ? { fronts: frontCost } : {}),
      ...(sellingBase ? { sellingBase } : {}),
    },
    accessories: [
      ...(rails.length
        ? [
            {
              name: "Barra de colgado metálica Ø25 mm",
              quantity: railMeters,
              unit: "m" as const,
              unitCost: railRates.perMeter,
              cost: railMeters * railRates.perMeter,
            },
            {
              name: "Soportes de barra de colgado",
              quantity: rails.length * 2,
              unit: "ud" as const,
              unitCost: railRates.perSupport,
              cost: rails.length * 2 * railRates.perSupport,
            },
          ]
        : []),
      ...(fronts.length
        ? [
            {
              name: "Vidrio de frente 6 mm (medida preliminar)",
              quantity: glassQuantity,
              unit:
                frontRates.glass.basis === "unit"
                  ? ("ud" as const)
                  : ("m²" as const),
              unitCost: frontRates.glass.amount,
              cost: glassQuantity * frontRates.glass.amount,
            },
            ...(aluminumFronts.length
              ? [
                  {
                    name: "Marco de aluminio de frente 20 mm (perímetro exterior preliminar)",
                    quantity: aluminumQuantity,
                    unit:
                      frontRates.aluminum.basis === "unit"
                        ? ("ud" as const)
                        : ("m" as const),
                    unitCost: frontRates.aluminum.amount,
                    cost: aluminumQuantity * frontRates.aluminum.amount,
                  },
                ]
              : []),
            {
              name: "Herrajes y jalador exterior para frente de vidrio (juego)",
              quantity: fronts.length,
              unit: "ud" as const,
              unitCost: frontRates.hardware,
              cost: fronts.length * frontRates.hardware,
            },
          ]
        : []),
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
        quantity: doorPanels.length,
      },
      {
        name: "Soportes de repisa",
        quantity:
          panels.filter((panel) => panel.id.startsWith("REPISA_")).length * 4,
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
