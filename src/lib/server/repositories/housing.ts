import "server-only";
import type { DatabaseClient } from "../db";

export interface TenantHome {
  propertyId: string;
  name: string;
  street: string;
  postalCode: string;
  city: string;
  ownerId: string | null;
  unitId: string | null;
  unitName: string | null;
  location: string;
}
export async function findTenantHome(
  client: DatabaseClient,
  tenantId: string | null,
) {
  const { rows } = await client.query<TenantHome>(
    `SELECT p.id AS "propertyId",p.name,p.street,p.postal_code AS "postalCode",p.city,p.owner_id AS "ownerId",
    a.unit_id AS "unitId",a.unit_name AS "unitName",
    concat_ws(' · ',p.name,p.street,concat(p.postal_code,' ',p.city),a.unit_name) AS location
    FROM hausportal.tenant_assignments a JOIN hausportal.properties p ON p.id=a.property_id WHERE a.tenant_id=$1`,
    [tenantId],
  );
  return rows[0] ?? null;
}

export interface OwnerProperty {
  id: string;
  name: string;
  street: string;
  postalCode: string;
  city: string;
  units: string[];
}
export async function findOwnerProperties(
  client: DatabaseClient,
  ownerId: string | null,
  id?: string,
) {
  const { rows } = await client.query<OwnerProperty>(
    `SELECT p.id,p.name,p.street,p.postal_code AS "postalCode",p.city,
    ARRAY(SELECT u.name FROM hausportal.units u WHERE u.property_id=p.id ORDER BY u.name,u.id) AS units
    FROM hausportal.properties p WHERE p.owner_id=$1 AND ($2::text IS NULL OR p.id=$2) ORDER BY p.name,p.id`,
    [ownerId, id ?? null],
  );
  return rows;
}
