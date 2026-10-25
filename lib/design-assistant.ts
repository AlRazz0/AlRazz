import { z } from "zod";
import {
  createFurnitureBuilder, getConstruction, getConstructionOptions, getFrontOptions,
  settingsSchema, type Config, type Construction, type Product, type Settings,
} from "./furniture.ts";
import { buildKitchen, publicKitchenQuote, type KitchenPlan, type KitchenQuote } from "./kitchen.ts";
import { publicFurnitureResult, publicProduct, type PublicProductMetadata } from "./public-product.ts";
import { kitchenSpaceReasons, summarizeKitchenSpace, type KitchenSpaceSummary } from "./kitchen-space-summary.ts";

const measure = (minimum: number, maximum: number) => z.number().finite().int().min(minimum).max(maximum).multipleOf(10, "Usa medidas en pasos de 10 mm.");
export const designAssistantInputSchema = z.object({
  purpose: z.enum(["storage", "wardrobe", "desk", "kitchen"]),
  width: measure(600, 6000), height: measure(600, 4000), depth: measure(100, 3000),
  budget: z.number().finite().positive().max(1_000_000).optional(),
  finish: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,59}$/).optional(),
  layout: z.enum(["straight", "l"]).optional(), wallB: measure(1000, 6000).optional(),
  install: z.boolean().default(false), transport: z.boolean().default(false),
}).strict().superRefine((input, context) => {
  if (input.purpose !== "kitchen") return;
  if (input.width < 1000) context.addIssue({ code: z.ZodIssueCode.custom, path: ["width"], message: "La pared de cocina necesita al menos 1000 mm en este planificador." });
  if (input.height < 2000) context.addIssue({ code: z.ZodIssueCode.custom, path: ["height"], message: "Indica una altura de recinto de al menos 2000 mm para la cocina." });
  if (input.layout === "l" && input.wallB === undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ["wallB"], message: "Indica la medida real de la pared B para una cocina en L." });
});
export type DesignAssistantInput = z.infer<typeof designAssistantInputSchema>;
export type DesignAssistantBudgetState = "not-provided" | "within" | "over" | "quote-required";
/** Legacy kitchen ranking bounds: width is occupied A, depth is module depth, not the L envelope. Use spaceSummary for display. */
export type DesignAssistantFit = { width: number; height: number; depth: number; freeWidth: number; freeHeight: number; freeDepth: number };
type AssistantProduct = PublicProductMetadata & { preview: ReturnType<typeof publicFurnitureResult> };
type RecommendationBase = {
  id: string; title: string; price: number | null; fit: DesignAssistantFit; reasons: string[];
  withinBudget: boolean | null; budgetState: DesignAssistantBudgetState;
};
export type DesignAssistantOption = RecommendationBase & (
  | { kind: "furniture"; product: AssistantProduct; config: Config }
  | { kind: "kitchen"; plan: KitchenPlan; result: KitchenQuote; spaceSummary: KitchenSpaceSummary }
);
export type DesignAssistantResult = {
  input: DesignAssistantInput; options: DesignAssistantOption[];
  budgetState: DesignAssistantBudgetState | "no-options"; message: string; notices: string[];
};

const MAX_PRODUCTS = 32;
const MAX_FIT_ATTEMPTS = 32;
const kinds: Record<Exclude<DesignAssistantInput["purpose"], "kitchen">, readonly Construction["kind"][]> = {
  storage: ["cabinet", "open-shelf"], wardrobe: ["wardrobe"], desk: ["desk", "desk-storage"],
};
const serviceConfig = (config: Config, input: DesignAssistantInput) => ({ ...config, install: input.install, transport: input.transport });
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(value, maximum));
const ordered = (values: readonly number[], preferred: number) => [...values].sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred) || a - b);
const unique = <T,>(values: readonly T[]): T[] => [...new Set(values)];
function budgetInfo(price: number | null, budget?: number): Pick<RecommendationBase, "withinBudget" | "budgetState"> {
  if (price === null) return { withinBudget: null, budgetState: "quote-required" };
  if (budget === undefined) return { withinBudget: null, budgetState: "not-provided" };
  const withinBudget = price <= budget;
  return { withinBudget, budgetState: withinBudget ? "within" : "over" };
}
function fitInfo(input: DesignAssistantInput, width: number, height: number, depth: number): DesignAssistantFit {
  return { width, height, depth, freeWidth: input.width - width, freeHeight: input.height - height, freeDepth: input.depth - depth };
}
function fitReasons(fit: DesignAssistantFit): string[] {
  return [
    `${fit.width} × ${fit.height} × ${fit.depth} mm; melamina de 18 mm.`,
    `Quedan ${fit.freeWidth} mm de ancho, ${fit.freeHeight} mm de alto y ${fit.freeDepth} mm de fondo respecto al espacio indicado.`,
  ];
}
type Bounds = { width: number; height: number; depth: number };
function dimensions(product: Product, bounds: Bounds): Bounds[] {
  const ranges = Object.fromEntries((["width", "height", "depth"] as const).map(key => [key, {
    min: product.limits[key].min, max: Math.floor(Math.min(3000, product.limits[key].max, bounds[key]) / 10) * 10,
  }])) as Record<keyof Bounds, { min: number; max: number }>;
  if ((["width", "height", "depth"] as const).some(key => ranges[key].max < ranges[key].min)) return [];
  const preferred = Object.fromEntries((["width", "height", "depth"] as const).map(key => [key, clamp(product.defaults[key], ranges[key].min, ranges[key].max)])) as Bounds;
  return [preferred,
    { width: ranges.width.max, height: ranges.height.max, depth: preferred.depth },
    { width: ranges.width.min, height: Math.min(preferred.height, ranges.height.max), depth: preferred.depth },
  ].filter((value, index, values) => values.findIndex(candidate => JSON.stringify(candidate) === JSON.stringify(value)) === index);
}

/** Bounded layout search; every returned configuration is built by the shared server engine. */
function fitted(
  product: Product, size: Bounds, finish: string | undefined,
  build: ReturnType<typeof createFurnitureBuilder>, input: DesignAssistantInput,
): { config: Config; result: ReturnType<ReturnType<typeof createFurnitureBuilder>> } | undefined {
  const initial = serviceConfig({ ...structuredClone(product.defaults), ...size, ...(finish ? { finish } : {}), ...(input.finish ? { interior: "same" } : {}) }, input);
  const constructionOptions = getConstructionOptions(product, initial);
  const doors = unique([initial.doors, "none" as const, ...constructionOptions.doors]).filter(door => constructionOptions.doors.includes(door));
  let attempts = 0;
  for (const door of doors) {
    const fronts = door === "none" ? ["melamine" as const] : unique([initial.front ?? "melamine", "melamine" as const, ...getFrontOptions(product)]).filter(front => getFrontOptions(product).includes(front));
    for (const front of fronts) for (const modules of ordered(constructionOptions.modules, initial.modules)) {
      const modular = { ...initial, modules };
      const options = getConstructionOptions(product, modular);
      const shelfOptions = ordered(options.shelves, initial.shelves);
      const shelves = unique([shelfOptions[0], shelfOptions.includes(0) ? 0 : shelfOptions.at(-1)!]);
      for (const shelf of shelves) {
        if (++attempts > MAX_FIT_ATTEMPTS) return;
        const config: Config = { ...modular, shelves: shelf, doors: door, front,
          ...(front !== "melamine" ? { handle: "exterior" as const } : {}),
        };
        try { return { config, result: build(product, config) }; }
        catch { /* Another allowed distribution may fit, never relax its construction rules. */ }
      }
    }
  }
}

type Candidate = { option: DesignAssistantOption; score: number; order: number; model: string };
function candidateScore(option: DesignAssistantOption, input: DesignAssistantInput, preference: number) {
  const knownBudget = input.budget !== undefined && option.price !== null;
  const budgetGroup = input.budget === undefined ? 0 : option.withinBudget === true ? 0 : knownBudget ? 1 : 2;
  const over = knownBudget && option.price! > input.budget! ? (option.price! - input.budget!) / input.budget! : 0;
  const unused = option.fit.freeWidth / input.width + option.fit.freeHeight / input.height * .35 + option.fit.freeDepth / input.depth * .2;
  return budgetGroup * 1000 + Math.min(100, over) * 10 + unused + preference * .03;
}
function furnitureCandidates(input: DesignAssistantInput, products: readonly Product[], settings: Settings): Candidate[] {
  const build = createFurnitureBuilder(settings);
  const activeFinishes = new Set(settings.materials.filter(material => material.active).map(material => material.id));
  const options: Candidate[] = [];
  const available = products.filter(product => {
    if (!product.active) return false;
    try { return input.purpose !== "kitchen" && kinds[input.purpose].includes(getConstruction(product).kind); } catch { return false; }
  }).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).slice(0, MAX_PRODUCTS);
  for (const product of available) {
    const finish = input.finish ?? (activeFinishes.has(product.defaults.finish) ? product.defaults.finish : settings.materials.find(material => material.active)?.id);
    const sizes = dimensions(product, input);
    for (const [index, size] of sizes.entries()) {
      const proposal = fitted(product, size, finish, build, input);
      if (!proposal) continue;
      const { config, result } = proposal;
      const preview = publicFurnitureResult(result, product);
      const publicModel = { ...publicProduct(product, preview.price), preview };
      const fit = fitInfo(input, config.width, config.height, config.depth);
      const reasons = fitReasons(fit);
      if (config.modules !== product.defaults.modules) reasons.push(`Se proponen ${config.modules} columnas para respetar las luces y puertas de esta estructura.`);
      if (config.shelves !== product.defaults.shelves) reasons.push(`La separación disponible admite ${config.shelves} repisas por columna en esta propuesta.`);
      if (config.doors !== product.defaults.doors || config.front !== (product.defaults.front ?? "melamine")) reasons.push("La distribución de puertas se adaptó a las opciones y alturas permitidas del modelo; revísala en 3D.");
      const option: DesignAssistantOption = {
        kind: "furniture", id: `${product.id}-${index + 1}`, title: `${product.name} · ${index === 0 ? "equilibrado" : index === 1 ? "más espacio" : "compacto"}`,
        product: publicModel, config, price: preview.price, fit, reasons, ...budgetInfo(preview.price, input.budget),
      };
      options.push({ option, score: candidateScore(option, input, index), order: product.order, model: product.id });
    }
  }
  return options;
}

function kitchenCandidates(input: DesignAssistantInput, products: readonly Product[], settings: Settings): Candidate[] {
  const build = createFurnitureBuilder(settings);
  const available = products.filter(product => product.active && product.category === "Cocina").sort((a, b) => {
    const preferred = (product: Product) => {
      try { return getConstruction(product).kind === "kitchen-base" ? 0 : 1; } catch { return 2; }
    };
    return preferred(a) - preferred(b) || Math.abs(a.defaults.width - 600) - Math.abs(b.defaults.width - 600) || a.order - b.order || a.id.localeCompare(b.id);
  }).slice(0, MAX_PRODUCTS);
  const activeFinish = input.finish;
  const bound = { width: input.width, height: Math.min(1100, input.height), depth: input.depth };
  const floorModels = available.slice(0, 8).flatMap(product => {
    try {
      if (!["cabinet", "open-shelf", "kitchen-base"].includes(getConstruction(product).kind)) return [];
      const preferred = dimensions(product, bound)[0];
      if (!preferred) return [];
      // Fixed selling tariffs can prioritize the bounded shortlist without building
      // every model. Calculated/hidden tariffs never supply a public cost estimate.
      const tariff = product.showPrice !== false && product.pricing && product.pricing.basis !== "calculated"
        ? product.pricing.amount * (product.pricing.basis === "unit" ? 1 : preferred.width / 1000) : Infinity;
      return [{ product, preferred, tariff }];
    } catch { return []; }
  }).sort((a, b) => {
    if (input.budget !== undefined && a.tariff !== b.tariff) return a.tariff - b.tariff;
    return a.product.order - b.product.order || a.product.id.localeCompare(b.product.id);
  });
  const floor: { product: Product; config: Config }[] = [];
  for (const { product, preferred } of floorModels) {
    for (const depth of unique([preferred.depth, product.limits.depth.min])) {
      const width = input.layout === "l" ? Math.min(input.width, input.wallB! - depth - 50) : input.width;
      const size = dimensions(product, { ...bound, width, depth })[0];
      const proposal = size && fitted(product, size, activeFinish, build, { ...input, install: false, transport: false });
      if (proposal) { floor.push({ product, config: proposal.config }); break; }
    }
    if (floor.length === 2) break;
  }
  const upperModels = available.filter(product => {
    try { return ["cabinet", "open-shelf"].includes(getConstruction(product).kind); } catch { return false; }
  }).slice(0, 3);
  const candidates: Candidate[] = [];
  const seenPlans = new Set<string>();
  sources: for (const source of floor) for (const variant of ["compact", "storage", "upper"] as const) {
    const layout = input.layout ?? "straight";
    const wallB = layout === "l" ? input.wallB! : 1000;
    const width = source.config.width;
    const depth = source.config.depth;
    const countA = variant === "storage" ? Math.min(2, Math.floor(input.width / width)) : 1;
    const countB = layout === "l" ? Math.min(variant === "storage" ? 2 : 1, Math.floor((wallB - depth - 50) / width)) : 0;
    if (countA < 1 || (layout === "l" && countB < 1)) continue;
    const items: KitchenPlan["items"] = [];
    let sequence = 0;
    const add = (product: Product, config: Config, wall: "a" | "b", row: "base" | "wall") => items.push({ id: `assistant-${++sequence}`, kind: "furniture", productId: product.id, wall, row, config: { ...config, install: false, transport: false } });
    for (const wall of layout === "l" ? ["a", "b"] as const : ["a"] as const) {
      const count = wall === "a" ? countA : countB;
      for (let index = 0; index < count; index++) add(source.product, source.config, wall, "base");
    }
    let upper: { product: Product; config: Config } | undefined;
    if (variant === "upper") for (const product of upperModels) {
      const size = dimensions(product, { width, height: Math.min(1200, input.height - 1200), depth: Math.min(450, input.depth) })[0];
      const proposal = size && fitted(product, size, activeFinish, build, { ...input, install: false, transport: false });
      if (proposal) { upper = { product, config: proposal.config }; break; }
    }
    if (variant === "upper" && !upper) continue;
    let elevation = 1500;
    if (upper) {
      elevation = Math.min(1500, input.height - upper.config.height);
      if (elevation < 1200) continue;
      for (const wall of layout === "l" ? ["a", "b"] as const : ["a"] as const)
        add(upper.product, upper.config, wall, "wall");
    }
    const plan: KitchenPlan = { layout, walls: { a: input.width, b: wallB }, roomHeight: input.height, wallElevation: elevation, install: input.install, transport: input.transport, items };
    const fingerprint = JSON.stringify(plan.items);
    if (seenPlans.has(fingerprint)) continue;
    try {
      const snapshot = buildKitchen(plan, products, settings);
      const result = publicKitchenQuote(snapshot);
      const occupiedA = Math.max(...(["base", "wall"] as const).map(row => items.filter(item => item.wall === "a" && (item.row === "wall") === (row === "wall")).reduce((sum, item) => sum + (item.kind === "furniture" ? item.config.width : item.width), 0)));
      const greatestDepth = Math.max(...result.modules.map(module => module.size[2]));
      const fit = fitInfo(input, occupiedA, result.envelope.height, greatestDepth);
      const option: DesignAssistantOption = {
        kind: "kitchen", id: `kitchen-${source.product.id}-${variant}`, title: `${layout === "l" ? "Cocina en L" : "Cocina lineal"} · ${variant === "compact" ? "inicio compacto" : variant === "storage" ? "más almacenaje" : "con alacenas"}`,
        plan, result, price: result.price, fit, spaceSummary: summarizeKitchenSpace(result),
        reasons: kitchenSpaceReasons(items.length),
        ...budgetInfo(result.price, input.budget),
      };
      candidates.push({ option, score: candidateScore(option, input, variant === "compact" ? 0 : variant === "storage" ? 1 : 2), order: source.product.order, model: source.product.id });
      seenPlans.add(fingerprint);
      if (candidates.length === 3) break sources;
    } catch { /* A composition is offered only if the full kitchen engine accepts it. */ }
  }
  return candidates;
}

/** Server-only recommendation orchestration. Nothing is saved or published. */
export function getDesignRecommendations(raw: unknown, products: readonly Product[], rawSettings: Settings): DesignAssistantResult {
  const input = designAssistantInputSchema.parse(raw);
  const settings = settingsSchema.parse(rawSettings);
  if (input.finish && !settings.materials.some(material => material.active && material.id === input.finish))
    throw new z.ZodError([{ code: z.ZodIssueCode.custom, path: ["finish"], message: "Selecciona un acabado activo del catálogo." }]);
  const candidates = input.purpose === "kitchen" ? kitchenCandidates(input, products, settings) : furnitureCandidates(input, products, settings);
  candidates.sort((a, b) => a.score - b.score || a.order - b.order || a.option.id.localeCompare(b.option.id));
  const seen = new Set<string>();
  const options: DesignAssistantOption[] = [];
  for (const candidate of candidates) {
    const option = candidate.option;
    const key = option.kind === "furniture" ? `${option.product.id}:${JSON.stringify(option.config)}` : JSON.stringify(option.plan.items);
    if (seen.has(key)) continue;
    seen.add(key); options.push(structuredClone(option));
    if (options.length === 3) break;
  }
  const budgetState = !options.length ? "no-options" : input.budget === undefined ? (options.every(option => option.price === null) ? "quote-required" : "not-provided") : options.some(option => option.withinBudget === true) ? "within" : options.some(option => option.price !== null) ? "over" : "quote-required";
  const message = !options.length ? "No encontramos una propuesta válida con este espacio y el catálogo publicado. Revisa las medidas o consúltalas con el taller."
    : budgetState === "over" ? `Las propuestas con importe publicado superan el presupuesto indicado.${options.some(option => option.price === null) ? " Las opciones sin precio requieren cotización antes de compararlas." : ""} Puedes revisarlas sin que se haya guardado ni contratado nada.`
    : budgetState === "quote-required" ? "Estas propuestas caben; el taller debe cotizar sus modelos sin precio público antes de compararlos con tu presupuesto."
    : `Encontramos ${options.length} ${options.length === 1 ? "propuesta compatible" : "propuestas compatibles"}. Revisa sus medidas y opciones en el configurador.`;
  return { input, options, budgetState, message, notices: ["Melamina de 18 mm. Geometría y precios calculados en servidor con el catálogo vigente.", "Selección de propuestas compatibles; no es una optimización exhaustiva del catálogo ni del presupuesto.", "Importes referenciales. El taller confirma materiales, disponibilidad y fabricación antes de cerrar la cotización.", `Servicios seleccionados: instalación ${input.install ? "incluida" : "no incluida"}; transporte ${input.transport ? "incluido" : "no incluido"}.`] };
}
