import type { Product } from "./furniture.ts";
import { publicExtras, type PublicProductExtra } from "./product-extras.ts";

export type PublicProductMetadata = Omit<Product, "basePrice" | "pricing" | "extras"> & {
  pricing?: { basis: NonNullable<Product["pricing"]>["basis"] };
  extras?: PublicProductExtra[];
  publicPrice: number;
};

/** Quoted totals are public; editable internal/base rates are not. */
export function publicProduct(product: Product, price: number): PublicProductMetadata {
  const { basePrice: _basePrice, pricing, extras, ...safe } = product;
  return {
    ...safe,
    ...(pricing ? { pricing: { basis: pricing.basis } } : {}),
    ...(extras ? { extras: publicExtras(extras) } : {}),
    publicPrice: price,
  };
}
