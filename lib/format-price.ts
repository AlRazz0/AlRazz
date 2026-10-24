const soles = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  maximumFractionDigits: 0,
});

/** Display only. Quotes and rounding are still calculated by the shared engine. */
export function money(value: number): string {
  return soles.format(value);
}
