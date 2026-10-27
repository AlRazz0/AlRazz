import { z } from "zod";
import { measurementPages, measurementSteps } from "./measurement-types.ts";
const base = { op: z.literal("measure"), consent: z.literal(true), session: z.string().uuid(), page: z.enum(measurementPages), device: z.enum(["mobile", "desktop"]) };
export const measurementSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("step"), step: z.enum(measurementSteps) }).strict(),
  z.object({ ...base, kind: z.literal("vital"), pageView: z.string().uuid(), name: z.enum(["INP", "LCP", "CLS"]), value: z.number().finite().nonnegative().max(120000), sequence: z.number().int().min(1).max(1000) }).strict(),
]).superRefine((value, ctx) => {
  if (value.kind === "vital" && value.name === "CLS" && value.value > 100) ctx.addIssue({code:"custom",path:["value"],message:"La medición CLS no es válida."});
});
