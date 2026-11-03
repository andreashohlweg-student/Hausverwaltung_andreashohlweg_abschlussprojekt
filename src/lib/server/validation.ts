import { z } from "zod";
import { isDatabase } from "@/lib/domain";
const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(120);
const email = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
const phone = z.string().trim().max(40);
const database = z
  .object({
    version: z.literal(2),
    owners: z.array(z.object({ id, name, email, phone })).max(10000),
    tenants: z
      .array(
        z.object({
          id,
          name,
          email,
          phone,
          propertyId: z.string().max(100),
          unitId: z.string().max(100),
        }),
      )
      .max(10000),
    properties: z
      .array(
        z.object({
          id,
          name,
          street: z.string().trim().min(1).max(160),
          postalCode: z.string().regex(/^\d{5}$/),
          city: z.string().trim().min(1).max(100),
          ownerId: z.string().max(100),
        }),
      )
      .max(10000),
    units: z.array(z.object({ id, name, propertyId: id })).max(10000),
    employees: z
      .array(
        z.object({
          id,
          name,
          email,
          role: z.enum([
            "Verwaltung",
            "Buchhaltung",
            "Technik",
            "Administrator",
          ]),
        }),
      )
      .max(10000),
  })
  .refine(isDatabase, "Ungültige Zuordnungen.");
export const saveRequest = z.object({
  data: database,
  revision: z.number().int().nonnegative(),
});
export const inviteRequest = z.object({
  kind: z.enum(["owners", "tenants"]),
  contactId: id,
});
export const acceptRequest = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(12).max(128),
});
