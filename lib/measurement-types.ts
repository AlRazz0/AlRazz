export const measurementPages = ["home", "assistant", "configurator", "kitchen", "cart"] as const;
export type MeasurementPage = typeof measurementPages[number];
export const measurementSteps = ["visit", "assistant_result", "design_saved", "quote_started", "quote_submitted"] as const;
export type MeasurementStep = typeof measurementSteps[number];
export type VitalName = "INP" | "LCP" | "CLS";
export type MeasurementReport = {
  days: number; sessions: number; steps: { step: MeasurementStep; sessions: number }[];
  vitals: { page: MeasurementPage; device: "mobile" | "desktop"; name: VitalName; samples: number; p75: number }[];
};
export function measurementPage(path: string): MeasurementPage | null {
  return ({ "/": "home", "/asistente": "assistant", "/configurar": "configurator", "/cocinas": "kitchen", "/carrito": "cart" } as Record<string, MeasurementPage>)[path] ?? null;
}
export function percentile75(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b);
  return sorted[Math.ceil(sorted.length * .75) - 1];
}
