import type { Config } from "./furniture.ts";

/** Public catalogue presentation only: no geometry, availability or price engine. */
export type ShowroomProduct = { id: string; name: string; category: string; description: string; active: boolean };
export const COLLECTION_PAGE_SIZE = 12;

export function normalizeShowroomText(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es").replace(/\s+/g, " ").trim();
}

/** Keep the API's category names and order; comparisons alone are normalized. */
export function showroomCategories(products: readonly ShowroomProduct[]): string[] {
  const categories = new Map<string, string>();
  for (const product of products) if (product.active) {
    const key = normalizeShowroomText(product.category);
    if (key && !categories.has(key)) categories.set(key, product.category);
  }
  return [...categories.values()];
}

/** A room/category link must resolve exactly, never through a partial match. */
export function resolveShowroomCategory(requested: string, categories: readonly string[]): string | undefined {
  const normalized = normalizeShowroomText(requested);
  return normalized ? categories.find(category => normalizeShowroomText(category) === normalized) : undefined;
}

export function filterShowroomProducts<T extends ShowroomProduct>(products: readonly T[], category: string, search: string): T[] {
  const categoryKey = normalizeShowroomText(category);
  const words = normalizeShowroomText(search).split(" ").filter(Boolean);
  return products.filter(product => {
    if (!product.active || (categoryKey && normalizeShowroomText(product.category) !== categoryKey)) return false;
    const text = normalizeShowroomText(`${product.name} ${product.category} ${product.description}`);
    return words.every(word => text.includes(word));
  });
}

export function resolveShowroomFinish<T extends { id: string; active: boolean }>(requested: string, materials: readonly T[]): T | undefined {
  return materials.find(material => material.active && material.id === requested.trim());
}

export function showroomProductHref(productId: string, activeFinishId?: string): string {
  const query = new URLSearchParams({ producto: productId });
  if (activeFinishId) query.set("acabado", activeFinishId);
  return `/mueble?${query}`;
}

export function showroomPage<T>(products: readonly T[], requestedCount = COLLECTION_PAGE_SIZE): { items: T[]; remaining: number } {
  const count = Number.isFinite(requestedCount) ? Math.max(COLLECTION_PAGE_SIZE, Math.floor(requestedCount)) : COLLECTION_PAGE_SIZE;
  const items = products.slice(0, count);
  return { items, remaining: Math.max(0, products.length - items.length) };
}

/** An explicit model URL never substitutes another model. A different finish
 * starts a fresh quote rather than borrowing the default preview or its price.
 */
export function resolveConfiguratorStart<T extends { id: string; active: boolean; defaults: Config }>(
  products: readonly T[], requestedId: string | null, requestedFinish: string | null,
  materials: readonly { id: string; active: boolean }[],
): { product: T; config: Config; usesCataloguePreview: boolean } | undefined {
  const product = requestedId === null ? products.find(product => product.active)
    : products.find(product => product.active && product.id === requestedId);
  if (!product) return;
  const config = structuredClone(product.defaults);
  if (requestedFinish && materials.some(material => material.active && material.id === requestedFinish)) config.finish = requestedFinish;
  return { product, config, usesCataloguePreview: config.finish === product.defaults.finish };
}
