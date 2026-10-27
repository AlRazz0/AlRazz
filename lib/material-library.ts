import type { PublicMaterial } from "./furniture.ts";

const normalized = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es").replace(/\s+/g, " ").trim();
export type MaterialLibraryFilters = { search: string; brand?: string; board?: PublicMaterial["board"] };
export const materialBoardLabel = (board: PublicMaterial["board"]) => board === "rh" ? "Tablero RH" : "Tablero estándar";

/** All filter choices come from the active public catalogue, retaining its names. */
export function materialLibraryOptions(materials: readonly PublicMaterial[]): { brands: string[]; boards: PublicMaterial["board"][] } {
  const brands = new Map<string, string>(), boards = new Set<PublicMaterial["board"]>();
  for (const material of materials) if (material.active) {
    const brand = material.brand.trim();
    if (!brands.has(normalized(brand))) brands.set(normalized(brand), brand);
    boards.add(material.board ?? "standard");
  }
  return { brands: [...brands.values()].sort((a, b) => a.localeCompare(b, "es")), boards: [...boards].sort() };
}

export function filterMaterialLibrary(materials: readonly PublicMaterial[], filters: MaterialLibraryFilters): PublicMaterial[] {
  const words = normalized(filters.search).split(" ").filter(Boolean);
  return materials.filter(material => {
    if (!material.active || (filters.brand !== undefined && normalized(material.brand) !== normalized(filters.brand)) ||
      (filters.board !== undefined && (material.board ?? "standard") !== filters.board)) return false;
    const text = normalized(`${material.name} ${material.brand} ${material.code} ${material.texture ?? ""} ${materialBoardLabel(material.board)}`);
    return words.every(word => text.includes(word));
  });
}

/** The selected active material is first, even for a one-to-three finish catalogue.
 * Background samples preserve API order; no catalogue record is modified.
 */
export function materialPresentationSamples(materials: readonly PublicMaterial[], selectedId: string, limit: number): PublicMaterial[] {
  const active = materials.filter(material => material.active);
  const selected = active.find(material => material.id === selectedId) ?? active[0];
  if (!selected || !Number.isFinite(limit) || limit < 1) return [];
  return [selected, ...active.filter(material => material.id !== selected.id)].slice(0, Math.floor(limit));
}

export function materialCollectionHref(material: Pick<PublicMaterial, "id" | "active">): string | undefined {
  return material.active ? `/coleccion?${new URLSearchParams({ acabado: material.id })}` : undefined;
}
