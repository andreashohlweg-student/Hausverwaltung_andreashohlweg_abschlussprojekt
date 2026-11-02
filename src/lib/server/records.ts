import type { Database, Owner, Tenant, Property, Employee } from "@/lib/domain";
import type { AccountStatus } from "@/lib/account";
import { getPool } from "./db";
import { RequestError } from "./access";

export async function loadDatabase(): Promise<{
  data: Database;
  revision: number;
}> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const owners = await client.query<Owner>(
      "SELECT id,name,email,phone FROM hausportal.owners ORDER BY name,id",
    );
    const properties = await client.query<Property>(
      'SELECT id,name,street,postal_code AS "postalCode",city,units,coalesce(owner_id,\'\') AS "ownerId" FROM hausportal.properties ORDER BY name,id',
    );
    const tenants = await client.query<Tenant>(
      "SELECT id,name,email,phone,coalesce(property_id,'') AS \"propertyId\",apartment FROM hausportal.tenants ORDER BY name,id",
    );
    const employees = await client.query<Employee>(
      "SELECT id,name,email,role FROM hausportal.employees ORDER BY name,id",
    );
    const state = await client.query(
      "SELECT revision FROM hausportal.state WHERE id=1",
    );
    await client.query("COMMIT");
    return {
      data: {
        version: 1,
        owners: owners.rows,
        properties: properties.rows,
        tenants: tenants.rows,
        employees: employees.rows,
      },
      revision: Number(state.rows[0].revision),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function saveDatabase(
  data: Database,
  expectedRevision: number,
): Promise<number> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const state = await client.query(
      "SELECT revision FROM hausportal.state WHERE id=1 FOR UPDATE",
    );
    if (Number(state.rows[0].revision) !== expectedRevision)
      throw new RequestError(
        "Die Daten wurden inzwischen geändert. Bitte lade die Seite neu.",
        409,
      );
    // Revoking access accompanies contact deletion; an orphaned account has no portal access.
    await client.query(
      "UPDATE hausportal.users SET active=false WHERE (role='owner' AND NOT(owner_id=ANY($1::text[]))) OR (role='tenant' AND NOT(tenant_id=ANY($2::text[])))",
      [data.owners.map((r) => r.id), data.tenants.map((r) => r.id)],
    );
    // Changing an account's email requires a new invitation, rather than silently transferring access.
    const existingUsers = await client.query(
      "SELECT owner_id,tenant_id,email FROM hausportal.users WHERE active=true AND role<>'admin'",
    );
    for (const user of existingUsers.rows) {
      const contact = user.owner_id
        ? data.owners.find((r) => r.id === user.owner_id)
        : data.tenants.find((r) => r.id === user.tenant_id);
      if (contact && contact.email.toLowerCase() !== user.email.toLowerCase())
        throw new RequestError(
          "Die E-Mail-Adresse eines aktivierten Zugangs kann hier nicht geändert werden.",
          409,
        );
    }
    for (const r of data.owners)
      await client.query(
        "INSERT INTO hausportal.owners(id,name,email,phone) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,phone=excluded.phone",
        [r.id, r.name, r.email.toLowerCase(), r.phone],
      );
    for (const r of data.properties)
      await client.query(
        "INSERT INTO hausportal.properties(id,name,street,postal_code,city,units,owner_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET name=excluded.name,street=excluded.street,postal_code=excluded.postal_code,city=excluded.city,units=excluded.units,owner_id=excluded.owner_id",
        [
          r.id,
          r.name,
          r.street,
          r.postalCode,
          r.city,
          r.units,
          r.ownerId || null,
        ],
      );
    for (const r of data.tenants)
      await client.query(
        "INSERT INTO hausportal.tenants(id,name,email,phone,property_id,apartment) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,phone=excluded.phone,property_id=excluded.property_id,apartment=excluded.apartment",
        [
          r.id,
          r.name,
          r.email.toLowerCase(),
          r.phone,
          r.propertyId || null,
          r.apartment,
        ],
      );
    for (const r of data.employees)
      await client.query(
        "INSERT INTO hausportal.employees(id,name,email,role) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,role=excluded.role",
        [r.id, r.name, r.email.toLowerCase(), r.role],
      );
    for (const [table, ids] of [
      ["tenants", data.tenants],
      ["properties", data.properties],
      ["owners", data.owners],
      ["employees", data.employees],
    ] as const) {
      await client.query(
        `DELETE FROM hausportal.${table} WHERE NOT(id=ANY($1::text[]))`,
        [ids.map((r) => r.id)],
      );
    }
    const result = await client.query(
      "UPDATE hausportal.state SET revision=revision+1 WHERE id=1 RETURNING revision",
    );
    await client.query("COMMIT");
    return Number(result.rows[0].revision);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function loadAccountStatuses(): Promise<AccountStatus[]> {
  const { rows } = await getPool().query<AccountStatus>(`
    SELECT coalesce(owner_id,tenant_id) AS "contactId",role,'active' AS status FROM hausportal.users WHERE active=true AND role<>'admin'
    UNION ALL
    SELECT coalesce(i.owner_id,i.tenant_id) AS "contactId",i.role,
      CASE WHEN expires_at<now() THEN 'expired' WHEN delivery_status='failed' THEN 'failed' ELSE 'pending' END AS status
    FROM hausportal.invitations i WHERE accepted_at IS NULL AND revoked_at IS NULL AND role<>'admin'
      AND NOT EXISTS (SELECT 1 FROM hausportal.users u WHERE u.active=true AND lower(u.email)=lower(i.email))
  `);
  return rows;
}
