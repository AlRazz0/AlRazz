import { z } from "zod";

const extraId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,59}$/);
const retailAmount = z.number().finite().min(0).max(100000);
export const extraPricingSchema = z.discriminatedUnion("basis", [
  z.object({ basis: z.literal("unit"), amount: retailAmount }).strict(),
  z.object({
    basis: z.literal("linear-meter"),
    amount: retailAmount,
    dimension: z.enum(["width", "height", "depth"]),
  }).strict(),
  z.object({
    basis: z.literal("square-meter"),
    amount: retailAmount,
    plane: z.enum(["front", "side", "top"]),
  }).strict(),
]);
export const productExtraSchema = z.object({
  id: extraId,
  name: z.string().trim().min(2).max(70),
  description: z.string().trim().max(180).optional(),
  active: z.boolean(),
  pricing: extraPricingSchema,
  maxQuantity: z.number().int().min(1).max(100),
}).strict();
export type ProductExtra = z.infer<typeof productExtraSchema>;
export const productExtrasSchema = z.array(productExtraSchema).max(20).superRefine((extras, context) => {
  const seen = new Set<string>();
  extras.forEach((extra, index) => {
    if (seen.has(extra.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "id"], message: "El código del acabado u opción está repetido" });
    seen.add(extra.id);
  });
});
export const extraSelectionsSchema = z.array(z.object({
  id: extraId,
  quantity: z.number().int().min(1).max(100),
}).strict()).max(20).superRefine((selections, context) => {
  const seen = new Set<string>();
  selections.forEach((selection, index) => {
    if (seen.has(selection.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "id"], message: "No repitas una opción seleccionada" });
    seen.add(selection.id);
  });
});
export type ExtraSelection = z.infer<typeof extraSelectionsSchema>[number];
export type PublicExtraPricing =
  | { basis: "unit" }
  | { basis: "linear-meter"; dimension: "width" | "height" | "depth" }
  | { basis: "square-meter"; plane: "front" | "side" | "top" };
export type PublicProductExtra = Omit<ProductExtra, "pricing"> & { pricing: PublicExtraPricing };

/** Explicit projection: no retail rate or hidden option is included in the catalog. */
export function publicExtras(extras: readonly ProductExtra[]): PublicProductExtra[] {
  return extras.filter((extra) => extra.active).map(({ id, name, description, active, pricing, maxQuantity }) => ({
    id, name, ...(description !== undefined ? { description } : {}), active, maxQuantity,
    pricing: pricing.basis === "unit"
      ? { basis: pricing.basis }
      : pricing.basis === "linear-meter"
        ? { basis: pricing.basis, dimension: pricing.dimension }
        : { basis: pricing.basis, plane: pricing.plane },
  }));
}

export function validateExtraSelections(extras: readonly ProductExtra[] | undefined, selections: readonly ExtraSelection[] | undefined): void {
  for (const selection of selections ?? []) {
    const extra = extras?.find((item) => item.id === selection.id && item.active);
    if (!extra) throw new Error(`La opción «${selection.id}» no está disponible para este modelo.`);
    if (selection.quantity > extra.maxQuantity) throw new Error(`La opción «${extra.name}» admite como máximo ${extra.maxQuantity} unidades.`);
  }
}

export type ExtraPriceLine = {
  id: string;
  name: string;
  basis: ProductExtra["pricing"]["basis"];
  quantity: number;
  measurement: number;
  unitPrice: number;
  amount: number;
  dimension?: "width" | "height" | "depth";
  plane?: "front" | "side" | "top";
};

/** Private ledger rows deliberately remain separate from manufactured parts. */
export function extraLedgerRows(lines: readonly ExtraPriceLine[]): unknown[][] {
  const dimensions = { width: "ancho", height: "alto", depth: "fondo" };
  const planes = { front: "ancho × alto", side: "fondo × alto", top: "ancho × fondo" };
  return lines.map((line) => [
    line.id,
    line.name,
    line.basis === "unit" ? "unidad" : line.basis === "linear-meter" ? "metro lineal" : "metro cuadrado",
    line.dimension ? dimensions[line.dimension] : line.plane ? planes[line.plane] : "por unidad",
    line.quantity,
    line.measurement,
    line.unitPrice,
    line.amount,
  ]);
}
export const EXTRA_LEDGER_COLUMNS = [
  "Código", "Acabado u opción", "Base de cobro", "Medida utilizada", "Cantidad",
  "Medición por unidad", "Tarifa de venta S/", "Subtotal S/",
] as const;

/** Optional retail services/options do not imply new geometry or manufacturing panels. */
export function priceExtraSelections(
  extras: readonly ProductExtra[] | undefined,
  config: { width: number; height: number; depth: number; extras?: ExtraSelection[] },
): ExtraPriceLine[] {
  validateExtraSelections(extras, config.extras);
  return (config.extras ?? []).map((selection) => {
    const extra = extras!.find((item) => item.id === selection.id)!;
    const rate = extra.pricing;
    const measurement = rate.basis === "unit" ? 1
      : rate.basis === "linear-meter" ? config[rate.dimension] / 1000
        : rate.plane === "front" ? config.width * config.height / 1e6
          : rate.plane === "side" ? config.depth * config.height / 1e6
            : config.width * config.depth / 1e6;
    return {
      id: extra.id, name: extra.name, basis: rate.basis,
      ...(rate.basis === "linear-meter" ? { dimension: rate.dimension } : {}),
      ...(rate.basis === "square-meter" ? { plane: rate.plane } : {}),
      quantity: selection.quantity, measurement, unitPrice: rate.amount,
      amount: measurement * selection.quantity * rate.amount,
    };
  });
}
