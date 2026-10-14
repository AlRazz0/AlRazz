import type { Product, Result } from "./furniture.ts";
import { publicExtras, type PublicProductExtra } from "./product-extras.ts";
import { publicGeometry } from "./public-geometry.ts";

export type PublicProductMetadata = Omit<Product, "basePrice" | "pricing" | "extras"> & {
  pricing?: { basis: NonNullable<Product["pricing"]>["basis"] };
  extras?: PublicProductExtra[];
  publicPrice: number | null;
};

/** Historical amounts stay frozen; either saved or current privacy can suppress them. */
export function publicPrice(
  product: Pick<Product, "showPrice">,
  price: number | null,
  currentProduct?: Pick<Product, "showPrice">,
): number | null {
  return product.showPrice === false || currentProduct?.showPrice === false ? null : price;
}

export function publicFurnitureResult(result: Result, product: Product, currentProduct?: Product) {
  return {
    geometry: publicGeometry(result.panels, result.fixtures),
    price: publicPrice(product, result.price, currentProduct),
  };
}

/** Publish totals only when enabled; editable internal/base rates are never public. */
export function publicProduct(product: Product, price: number | null, currentProduct?: Product): PublicProductMetadata {
  const { basePrice: _basePrice, pricing, extras, ...safe } = product;
  const visiblePrice = publicPrice(product, price, currentProduct);
  return {
    ...safe,
    ...(visiblePrice === null ? { showPrice: false } : {}),
    ...(pricing ? { pricing: { basis: pricing.basis } } : {}),
    ...(extras ? { extras: publicExtras(extras) } : {}),
    publicPrice: visiblePrice,
  };
}
