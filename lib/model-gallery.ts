import { z } from "zod";

export const gallerySchema = z.object({
  enabled: z.boolean().optional(),
  scene: z.enum(["warm", "light", "dark"]).optional(),
  caption: z.string().trim().max(220).optional(),
}).strict();
export type Gallery = z.infer<typeof gallerySchema>;
export function resolveGallery(gallery?: Gallery) {
  return { enabled: gallery?.enabled ?? true, scene: gallery?.scene ?? "warm", caption: gallery?.caption ?? "" };
}
