import { z } from "zod";
import { damageStatuses } from "@/lib/damage";
const text = (max: number) => z.string().trim().min(1).max(max);
const invoice = z
  .object({
    issuer: text(600),
    taxId: text(100),
    recipientAddress: text(500),
    serviceDate: z.iso.date(),
    service: text(2000),
    netCents: z.number().int().min(1).max(999999999),
    taxBasisPoints: z.union([z.literal(0), z.literal(700), z.literal(1900)]),
    taxNote: z.string().trim().max(500),
    paymentDetails: z.string().trim().max(600),
  })
  .refine(
    (value) => value.taxBasisPoints !== 0 || value.taxNote.length > 0,
    "Hinweis zur Steuerbefreiung fehlt.",
  );
export const newDamageRequest = z.object({
  id: z.uuid(),
  description: text(6000),
  language: z.enum(["de", "en"]),
});
const caseEditRequest = z.object({
  version: z.number().int().positive(),
  action: z.literal("update"),
  status: z.enum(damageStatuses).optional(),
  serviceOrdered: z.boolean().optional(),
  invoice: invoice.optional(),
});
export const damageUpdateRequest = z.discriminatedUnion("action", [
  caseEditRequest,
  z.object({
    action: z.literal("claim"),
    version: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("assign_owner"),
    version: z.number().int().positive(),
    ownerId: z.string().min(1).max(100).nullable(),
  }),
]);
export type DamageUpdate = z.infer<typeof damageUpdateRequest>;
export const damageMessageRequest = z.object({
  id: z.uuid(),
  channel: z.enum(["tenant", "owner"]),
  body: text(6000),
});
