import type { Product, Config, Panel } from "../lib/furniture";
import type { PublicMaterial } from "../lib/furniture";
export type { PublicMaterial } from "../lib/furniture";
export type Quote = {
  panels: Panel[];
  area: number;
  edges: number;
  doors: number;
  price: number;
  accessories: { name: string; quantity: number }[];
};
export type PublicProduct = Omit<Product, "basePrice"> & {
  publicPrice: number;
  preview: Quote;
};
export type PublicSettings = {
  whatsapp: string;
  availability: string;
  leadWeeks: number;
  materials: PublicMaterial[];
};
export type Design = {
  id: string;
  name?: string;
  quantity: number;
  version: number;
  product: PublicProduct;
  config: Config;
  price: number;
  created: string;
  result: Quote;
  materials: PublicMaterial[];
};
