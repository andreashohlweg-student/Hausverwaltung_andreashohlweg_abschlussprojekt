import "server-only";
import type {
  Database,
  Owner,
  Property,
  Tenant,
  Unit,
  Employee,
  EntityKind,
} from "@/lib/domain";
import type { AccountStatus } from "@/lib/account";
import type { DatabaseClient } from "../db";

export async function readRecords(client: DatabaseClient): Promise<Database> {
  const owners = await client.query<Owner>(
    "SELECT id,name,email,phone FROM hausportal.owners ORDER BY name,id",
  );
  const properties = await client.query<Property>(
    `SELECT id,name,street,postal_code AS "postalCode",city,coalesce(owner_id,'') AS "ownerId" FROM hausportal.properties ORDER BY name,id`,
  );
  const units = await client.query<Unit>(
    'SELECT id,name,property_id AS "propertyId" FROM hausportal.units ORDER BY name,id',
  );
  const tenants =
    await client.query<Tenant>(`SELECT t.id,t.name,t.email,t.phone,coalesce(a.property_id,'') AS "propertyId",coalesce(a.unit_id,'') AS "unitId"
    FROM hausportal.tenants t JOIN hausportal.tenant_assignments a ON a.tenant_id=t.id ORDER BY t.name,t.id`);
  const employees = await client.query<Employee>(
    "SELECT id,name,email,role FROM hausportal.employees ORDER BY name,id",
  );
  return {
    version: 2,
    owners: owners.rows,
    properties: properties.rows,
    units: units.rows,
    tenants: tenants.rows,
    employees: employees.rows,
  };
}

export async function readRevision(client: DatabaseClient) {
  return Number(
    (await client.query("SELECT revision FROM hausportal.state WHERE id=1"))
      .rows[0].revision,
  );
}
export async function incrementRevision(client: DatabaseClient) {
  return Number(
    (
      await client.query(
        "UPDATE hausportal.state SET revision=revision+1 WHERE id=1 RETURNING revision",
      )
    ).rows[0].revision,
  );
}

// Identifiers are a closed server-owned mapping; no SQL identifier comes from input.
const columns = {
  owners: ["id", "name", "email", "phone"],
  properties: ["id", "name", "street", "postal_code", "city", "owner_id"],
  units: ["id", "name", "property_id"],
  tenants: ["id", "name", "email", "phone", "property_id", "unit_id"],
  employees: ["id", "name", "email", "role"],
} as const;

export async function upsertRecord(
  client: DatabaseClient,
  kind: EntityKind,
  record: Database[EntityKind][number],
) {
  const r = record as unknown as Record<string, string>;
  const values =
    kind === "properties"
      ? [r.id, r.name, r.street, r.postalCode, r.city, r.ownerId || null]
      : kind === "units"
        ? [r.id, r.name, r.propertyId]
        : kind === "tenants"
          ? [
              r.id,
              r.name,
              r.email.toLowerCase(),
              r.phone,
              r.unitId ? null : r.propertyId || null,
              r.unitId || null,
            ]
          : kind === "employees"
            ? [r.id, r.name, r.email.toLowerCase(), r.role]
            : [r.id, r.name, r.email.toLowerCase(), r.phone];
  const fields = columns[kind];
  await client.query(
    `INSERT INTO hausportal.${kind}(${fields.join(",")}) VALUES(${fields.map((_, i) => `$${i + 1}`).join(",")})
    ON CONFLICT(id) DO UPDATE SET ${fields
      .slice(1)
      .map((column) => `${column}=excluded.${column}`)
      .join(",")}`,
    values,
  );
}
export async function deleteRecords(
  client: DatabaseClient,
  kind: EntityKind,
  ids: string[],
) {
  if (ids.length)
    await client.query(
      `DELETE FROM hausportal.${kind} WHERE id=ANY($1::text[])`,
      [ids],
    );
}

export async function activeContactAccounts(client: DatabaseClient) {
  return (
    await client.query<{
      owner_id: string | null;
      tenant_id: string | null;
      email: string;
    }>(
      "SELECT owner_id,tenant_id,email FROM hausportal.users WHERE active AND role<>'admin'",
    )
  ).rows;
}
export async function deactivateMissingContacts(
  client: DatabaseClient,
  ownerIds: string[],
  tenantIds: string[],
) {
  await client.query(
    `UPDATE hausportal.users SET active=false
    WHERE (role='owner' AND (owner_id IS NULL OR NOT(owner_id=ANY($1::text[]))))
    OR (role='tenant' AND (tenant_id IS NULL OR NOT(tenant_id=ANY($2::text[]))))`,
    [ownerIds, tenantIds],
  );
}
export async function unitHasReports(client: DatabaseClient, id: string) {
  return (
    (
      await client.query(
        "SELECT 1 FROM hausportal.damages WHERE unit_id=$1 LIMIT 1",
        [id],
      )
    ).rowCount !== 0
  );
}
export async function readAccountStatuses(client: DatabaseClient) {
  return (
    await client.query<AccountStatus>(`SELECT coalesce(owner_id,tenant_id) AS "contactId",role,'active' AS status FROM hausportal.users WHERE active AND role<>'admin'
    UNION ALL
    SELECT coalesce(i.owner_id,i.tenant_id) AS "contactId",i.role,
      CASE WHEN expires_at<now() THEN 'expired' WHEN delivery_status='failed' THEN 'failed' ELSE 'pending' END AS status
    FROM hausportal.invitations i WHERE accepted_at IS NULL AND revoked_at IS NULL AND role<>'admin'
    AND NOT EXISTS(SELECT 1 FROM hausportal.users u WHERE u.active AND lower(u.email)=lower(i.email))`)
  ).rows;
}
export async function readOwnerOptions(client: DatabaseClient) {
  return (
    await client.query<Pick<Owner, "id" | "name">>(
      "SELECT id,name FROM hausportal.owners ORDER BY name,id",
    )
  ).rows;
}
