import { quoteCSVCell, type Result } from "../lib/furniture.ts";

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
  return (
    "\ufeff" + rows.map((row) => row.map(quoteCSVCell).join(";")).join("\r\n")
  );
}
