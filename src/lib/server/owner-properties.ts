import type { AppUser } from "@/lib/account";
import { getPool } from "./db";
export interface OwnerProperty {
  id: string;
  name: string;
  street: string;
  postalCode: string;
  city: string;
  units: string[];
}
const selectProperties = `SELECT p.id,p.name,p.street,p.postal_code AS "postalCode",p.city,
  ARRAY(SELECT u.name FROM hausportal.units u WHERE u.property_id=p.id ORDER BY u.name,u.id) AS units
  FROM hausportal.properties p WHERE p.owner_id=$1`;
export async function listOwnerProperties(
  user: AppUser,
): Promise<OwnerProperty[]> {
  if (user.role !== "owner") return [];
  const { rows } = await getPool().query<OwnerProperty>(
    `${selectProperties} ORDER BY p.name,p.id`,
    [user.ownerId],
  );
  return rows;
}
export async function loadOwnerProperty(
  id: string,
  user: AppUser,
): Promise<OwnerProperty | null> {
  if (user.role !== "owner") return null;
  const { rows } = await getPool().query<OwnerProperty>(
    `${selectProperties} AND p.id=$2`,
    [user.ownerId, id],
  );
  return rows[0] ?? null;
}
