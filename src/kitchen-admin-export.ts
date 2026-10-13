import { quoteCSVCell, type Result } from "../lib/furniture.ts";
import { extraLedgerRows, EXTRA_LEDGER_COLUMNS } from "../lib/product-extras.ts";

export function kitchenReferenceId(reference: string) {
  const value = reference.trim();
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuid.test(value)) return value.toLowerCase();
  try {
    const url = new URL(value, "https://elcapo.invalid");
    const id = url.searchParams.get("cocina") ?? "";
    if (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.pathname.replace(/\/$/, "") === "/cocinas" &&
      uuid.test(id)
    )
      return id.toLowerCase();
  } catch {
    /* Report invalid references without fetching arbitrary URLs. */
  }
  throw new Error(
    "Pega el enlace de una cocina guardada o su identificador completo.",
  );
}

type ModuleCuts = { itemId: string; product: { name: string }; result: Result };
export function kitchenCutCSV(modules: ModuleCuts[]) {
  const rows: unknown[][] = [
    ["DESPIECE PRELIMINAR — NO AUTORIZADO PARA PRODUCCIÓN"],
    [
      "Módulo",
      "Modelo",
      "Tipo",
      "Código",
      "Pieza",
      "Cantidad",
      "Unidad",
      "Largo/alto mm",
      "Ancho mm",
      "Espesor mm",
      "Material",
      "Veta",
      "Superior",
      "Inferior",
      "Izquierdo",
      "Derecho",
    ],
  ];
  for (const module of modules) {
    for (const panel of module.result.panels)
      rows.push([
        module.itemId,
        module.product.name,
        "MELAMINA",
        panel.id,
        panel.name,
        1,
        "ud",
        panel.length,
        panel.width,
        18,
        panel.materialName,
        panel.grain,
        panel.edges.top,
        panel.edges.bottom,
        panel.edges.left,
        panel.edges.right,
      ]);
    for (const fixture of module.result.fixtures ?? []) {
      if (fixture.kind === "front-door")
        rows.push([
          module.itemId,
          module.product.name,
          "VIDRIO",
          fixture.id,
          fixture.name,
          1,
          "ud",
          fixture.glassHeight,
          fixture.glassWidth,
          fixture.glassThickness,
          fixture.surface === "aluminum-glass"
            ? "Vidrio para marco de aluminio"
            : "Vidrio",
        ]);
    }
    for (const accessory of module.result.accessories)
      rows.push([
        module.itemId,
        module.product.name,
        "ACCESORIO / RESUMEN",
        "",
        accessory.name,
        accessory.quantity,
        accessory.unit ?? "ud",
      ]);
  }
  if (modules.some((module) => module.result.extras?.length)) {
    rows.push([], ["COMPLEMENTOS COTIZADOS — NO SON PIEZAS DE CORTE"],
      ["Módulo", "Modelo", "Código", "Complemento", "Cantidad", "Medida por unidad", "Unidad de cobro", "Tarifa de venta S/", "Importe S/"]);
    for (const module of modules) for (const extra of module.result.extras ?? []) {
      rows.push([module.itemId, module.product.name, extra.id, extra.name,
        extra.quantity, extra.measurement,
        extra.basis === "unit" ? "ud" : extra.basis === "linear-meter" ? "m" : "m²",
        extra.unitPrice, extra.amount]);
    }
  }
  if (modules.some((module) => module.result.extras?.length)) {
    rows.push(
      [],
      ["ACABADOS Y OPCIONES COBRADOS — NO REPRESENTAN PIEZAS NI INSTRUCCIONES DE FABRICACIÓN"],
      ["Módulo", "Modelo", ...EXTRA_LEDGER_COLUMNS],
    );
    for (const module of modules) {
      for (const row of extraLedgerRows(module.result.extras ?? []))
        rows.push([module.itemId, module.product.name, ...row]);
    }
  }
  return (
    "\ufeff" + rows.map((row) => row.map(quoteCSVCell).join(";")).join("\r\n")
  );
}
