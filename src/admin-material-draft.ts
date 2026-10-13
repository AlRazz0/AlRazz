import { materialSchema, type Material } from "../lib/furniture.ts";
import { uniqueProductId } from "./admin-catalog-draft.ts";

export function newMaterialDraft(brand = "Hispano"): Material {
  return { id: "acabado-nuevo", name: "", color: "#c2a17c", price: 100,
    active: false, brand, code: "", board: "standard" };
}

export function applyMaterialDraft(
  materials: Material[], draft: Material, originalId: string | null,
): { materials: Material[]; material: Material } {
  if (!originalId && materials.length >= 100)
    throw Error("El catálogo admite hasta 100 acabados.");
  if (originalId && !materials.some((material) => material.id === originalId))
    throw Error("Este acabado cambió mientras lo editabas. Vuelve a abrirlo.");
  const material = materialSchema.parse({
    ...draft,
    id: originalId ?? uniqueProductId(`acabado-${draft.name}`, materials.map((item) => item.id)),
  });
  return {
    material,
    materials: originalId
      ? materials.map((item) => item.id === originalId ? material : item)
      : [material, ...materials],
  };
}
