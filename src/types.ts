import type { Config } from "../lib/furniture";
import type { PublicProductMetadata } from "../lib/public-product";
import type { VisualPanel } from "../lib/public-geometry";
import type { PublicMaterial } from "../lib/furniture";
export type { PublicMaterial } from "../lib/furniture";
export type Quote = {
  geometry: VisualPanel[];
  price: number;
};
export type PublicProduct = PublicProductMetadata & {
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
