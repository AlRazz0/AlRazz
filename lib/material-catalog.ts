import type { Material } from "./furniture.ts";

/** Enrich legacy references without overriding workshop choices or snapshots. */
export function mergeCommercialMaterials(
  current: readonly Material[],
  presets: readonly Material[],
  activateNew = false,
): Material[] {
  const byId = new Map(presets.map((material) => [material.id, material]));
  const merged = current.map((material) => {
    const preset = byId.get(material.id);
    if (
      !preset ||
      material.brand !== preset.brand ||
      material.name !== preset.name ||
      material.board !== preset.board
    )
      return { ...material };
    const next = { ...material };
    for (const field of ["swatch", "sourceUrl", "texture"] as const) {
      // An explicit empty string is a deliberate choice to remove that metadata.
      if (next[field] === undefined && preset[field] !== undefined)
        next[field] = preset[field];
    }
    if (next.renderTexture === undefined && preset.renderTexture !== undefined)
      next.renderTexture = preset.renderTexture;
    return next;
  });
  const existing = new Set(current.map((material) => material.id));
  for (const preset of presets)
    if (!existing.has(preset.id))
      merged.push({ ...preset, active: activateNew });
  return merged;
}
