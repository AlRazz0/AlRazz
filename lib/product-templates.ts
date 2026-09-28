import { seedProducts } from "./furniture.ts";
import type { Product } from "./furniture.ts";

/** Editor/import starting points only: these are never seeded into a database. */
export const constructionTemplates: Product[] = [
  {
    ...structuredClone(seedProducts[0]),
    id: "base-almacenaje",
    name: "Almacenaje con trasera",
    active: false,
    construction: { kind: "cabinet" },
  },
  {
    ...structuredClone(seedProducts[0]),
    id: "base-estante-abierto",
    name: "Estante sin trasera",
    active: false,
    construction: { kind: "open-shelf" },
    description:
      "Estantería abierta con divisiones y repisas de melamina de 18 mm.",
    limits: {
      width: { min: 600, max: 1800 },
      height: { min: 1000, max: 2200 },
      depth: { min: 250, max: 500 },
    },
    defaults: {
      ...seedProducts[0].defaults,
      width: 800,
      height: 1600,
      depth: 350,
      modules: 2,
      shelves: 4,
      doors: "none",
    },
  },
  {
    ...structuredClone(seedProducts[0]),
    id: "base-escritorio",
    name: "Escritorio abierto",
    category: "Escritorios",
    active: false,
    construction: { kind: "desk" },
    basePrice: 200,
    description:
      "Superficie de trabajo con laterales de apoyo, faldón trasero y espacio libre para las piernas.",
    limits: {
      width: { min: 800, max: 1200 },
      height: { min: 700, max: 850 },
      depth: { min: 450, max: 750 },
    },
    defaults: {
      ...seedProducts[0].defaults,
      width: 1100,
      height: 750,
      depth: 600,
      modules: 1,
      shelves: 0,
      doors: "none",
    },
  },
  {
    ...structuredClone(seedProducts[0]),
    id: "base-escritorio-lateral",
    name: "Escritorio con módulo lateral",
    category: "Escritorios",
    active: false,
    construction: {
      kind: "desk-storage",
      storageSide: "left",
      storageWidth: 450,
    },
    basePrice: 200,
    description:
      "Escritorio con almacenaje lateral, faldón trasero y espacio libre para las piernas.",
    limits: {
      width: { min: 1070, max: 1460 },
      height: { min: 700, max: 850 },
      depth: { min: 450, max: 750 },
    },
    defaults: {
      ...seedProducts[0].defaults,
      width: 1400,
      height: 750,
      depth: 600,
      modules: 1,
      shelves: 1,
      doors: "full",
    },
  },
  {
    ...structuredClone(seedProducts[0]),
    id: "base-ropero",
    name: "Ropero con maletero",
    category: "Roperos",
    active: false,
    basePrice: 240,
    construction: { kind: "wardrobe", loftHeight: 350, hangingModules: 1 },
    description:
      "Ropero con maletero superior, una columna para colgar y una columna con repisas.",
    limits: {
      width: { min: 800, max: 1800 },
      height: { min: 1600, max: 2600 },
      depth: { min: 500, max: 700 },
    },
    defaults: {
      ...seedProducts[0].defaults,
      width: 1200,
      height: 2100,
      depth: 600,
      modules: 2,
      shelves: 3,
      doors: "full",
    },
  },
  {
    ...structuredClone(seedProducts[0]),
    id: "base-cocina-inferior",
    name: "Base de cocina con zócalo",
    category: "Cocina",
    active: false,
    basePrice: 180,
    construction: {
      kind: "kitchen-base",
      plinthHeight: 100,
      plinthSetback: 70,
    },
    description:
      "Almacenaje de cocina sobre zócalo retranqueado, con tapa y carcasa de melamina de 18 mm.",
    limits: {
      width: { min: 400, max: 1800 },
      height: { min: 700, max: 1000 },
      depth: { min: 450, max: 750 },
    },
    defaults: {
      ...seedProducts[0].defaults,
      width: 600,
      height: 850,
      depth: 600,
      modules: 1,
      shelves: 1,
      doors: "full",
    },
  },
];

export function productTemplate(
  kind: NonNullable<Product["construction"]>["kind"],
): Product {
  const template = constructionTemplates.find(
    (product) => product.construction?.kind === kind,
  );
  if (!template) throw new Error("Tipo constructivo desconocido.");
  return structuredClone(template);
}
