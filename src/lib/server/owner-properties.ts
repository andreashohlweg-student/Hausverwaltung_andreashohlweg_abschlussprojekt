import "server-only";
import type { AppUser } from "@/lib/account";
import { getPool } from "./db";
import { findOwnerProperties, findTenantHome } from "./repositories/housing";
export type { OwnerProperty } from "./repositories/housing";

export async function listOwnerProperties(user: AppUser) {
  if (user.role !== "owner") return [];
  return findOwnerProperties(getPool(), user.ownerId);
}
export async function loadOwnerProperty(id: string, user: AppUser) {
  if (user.role !== "owner") return null;
  return (await findOwnerProperties(getPool(), user.ownerId, id))[0] ?? null;
}
export async function loadTenantHome(user: AppUser) {
  if (user.role !== "tenant") return null;
  return findTenantHome(getPool(), user.tenantId);
}
