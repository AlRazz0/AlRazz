import * as THREE from "three";

const LOCAL_SWATCH = /^\/images\/materials\/[a-z0-9-]+\.(?:jpg|jpeg|png|webp)$/;

/** A scene owns its textures; late image loads cannot update a replaced scene. */
export function createSwatchTextures(
  render: () => void,
  anisotropy = 1,
  load: (path: string) => Promise<THREE.Texture> = (path) =>
    new THREE.TextureLoader().loadAsync(path),
) {
  const entries = new Map<
    string,
    {
      texture: THREE.Texture | null;
      materials: Map<THREE.MeshStandardMaterial, THREE.Color>;
    }
  >();
  let disposed = false;

  function apply(material: THREE.MeshStandardMaterial, texture: THREE.Texture) {
    material.map = texture;
    // The image already contains the finish colour; HEX is only its fallback.
    material.color.set(0xffffff);
    material.needsUpdate = true;
  }

  return {
    attach(material: THREE.MeshStandardMaterial, path?: string) {
      // Same-origin raster assets also keep exported PNG canvases readable.
      if (disposed || !path || !LOCAL_SWATCH.test(path)) return;
      const existing = entries.get(path);
      if (existing) {
        if (!existing.materials.has(material))
          existing.materials.set(material, material.color.clone());
        if (existing.texture) {
          apply(material, existing.texture);
          render();
        }
        return;
      }
      const entry = {
        texture: null as THREE.Texture | null,
        materials: new Map([[material, material.color.clone()]]),
      };
      entries.set(path, entry);
      void load(path).then(
        (texture) => {
          if (disposed) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
          texture.anisotropy = Math.max(1, Math.min(4, anisotropy));
          texture.needsUpdate = true;
          entry.texture = texture;
          for (const target of entry.materials.keys()) apply(target, texture);
          render();
        },
        () => {
          // Missing/invalid images leave every material's HEX fallback intact.
        },
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of entries.values()) {
        for (const [material, fallback] of entry.materials) {
          if (entry.texture && material.map === entry.texture) {
            material.map = null;
            material.color.copy(fallback);
            material.needsUpdate = true;
          }
        }
        entry.materials.clear();
        entry.texture?.dispose();
      }
      entries.clear();
    },
  };
}
