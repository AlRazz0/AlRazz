import type { PublicMaterial } from "./types";

export function materialLabel(material: PublicMaterial) {
  return [
    material.brand,
    material.name + (material.code ? ` (${material.code})` : ""),
    material.board === "rh" ? "RH · 18 mm" : "18 mm",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function materialBrands(materials: PublicMaterial[]) {
  const priority = ["Hispano", "Vesto", "Pelikano"];
  return [...new Set(materials.map((m) => m.brand).filter(Boolean))].sort(
    (a, b) => {
      const rank = (brand: string) =>
        priority.includes(brand) ? priority.indexOf(brand) : priority.length;
      return rank(a) - rank(b) || a.localeCompare(b, "es");
    },
  );
}
