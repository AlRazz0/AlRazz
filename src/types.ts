import type { Product, Config } from "../lib/furniture";
import type { VisualPanel } from "../lib/public-geometry";
import type { PublicMaterial } from "../lib/furniture";
export type { PublicMaterial } from "../lib/furniture";
export type Quote = {
  geometry: VisualPanel[];
  price: number;
};
export type PublicProduct = Omit<Product, "basePrice" | "pricing"> & {
  pricing?: { basis: "calculated" | "unit" | "linear-meter" };
  publicPrice: number;
  preview: Quote;
};
export type {
  KitchenPlan,
  KitchenItem,
  KitchenModule,
  KitchenQuote,
  KitchenDesign,
} from "../lib/kitchen";
export type PublicSettings = {
  whatsapp: string;
  whatsappSecondary: string;
  facebook?: string;
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
