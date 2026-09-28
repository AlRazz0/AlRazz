import type { Construction } from "../lib/furniture";

export const constructionLabels: Record<Construction["kind"], string> = {
  cabinet: "Almacenaje con trasera",
  "open-shelf": "Estantería sin trasera",
  desk: "Escritorio abierto",
  "desk-storage": "Escritorio con módulo lateral",
  wardrobe: "Ropero con altillo y colgado",
  "kitchen-base": "Mueble bajo de cocina",
};

export const constructionDescriptions: Record<Construction["kind"], string> = {
  cabinet: "Ajusta las divisiones, repisas y puertas de tu mueble.",
  "open-shelf":
    "Estructura abierta, sin trasera ni puertas. Ajusta sus divisiones y repisas.",
  desk: "Superficie de trabajo con laterales y espacio libre bajo el tablero. Esta estructura no lleva repisas ni puertas.",
  "desk-storage":
    "Superficie de trabajo con un módulo lateral de almacenaje. Ajusta las repisas y puertas de ese módulo.",
  wardrobe:
    "Altillo superior y módulos para colgar ropa desde la izquierda. Los módulos restantes admiten repisas.",
  "kitchen-base":
    "Almacenaje bajo con zócalo retirado del frente. Ajusta su altura, retiro, repisas y puertas.",
};
