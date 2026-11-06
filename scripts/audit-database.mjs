import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

// SELECT-only audit; --env-file can target a test branch without replacing local env.
process.loadEnvFile(".env.local");
const url = new URL(process.env.DATABASE_URL_UNPOOLED);
url.searchParams.set("sslmode", "verify-full");
const client = new pg.Client({ connectionString: url.href });
await client.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const tables = (
    await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='hausportal' AND table_type='BASE TABLE' ORDER BY table_name",
    )
  ).rows;
  const counts = {};
  for (const { table_name } of tables)
    counts[table_name] = Number(
      (await client.query(`SELECT count(*) FROM hausportal.${table_name}`))
        .rows[0].count,
    );
  console.log(JSON.stringify({ tables: counts }, null, 2));
  const checks = (
    await client.query(`SELECT
    (SELECT count(*)::int FROM hausportal.users u LEFT JOIN neon_auth."user" a ON a.id::text=u.id WHERE a.id IS NULL) AS missing_auth_identity,
    (SELECT count(*)::int FROM hausportal.users WHERE
      (role='admin' AND (owner_id IS NOT NULL OR tenant_id IS NOT NULL)) OR
      (role='owner' AND (tenant_id IS NOT NULL OR (active AND owner_id IS NULL))) OR
      (role='tenant' AND (owner_id IS NOT NULL OR (active AND tenant_id IS NULL)))) AS invalid_user_links,
    (SELECT count(*)::int FROM hausportal.damages d JOIN hausportal.units u ON u.id=d.unit_id WHERE u.property_id IS DISTINCT FROM d.property_id) AS inconsistent_damage_location,
    (SELECT count(*)::int FROM hausportal.damages d JOIN hausportal.users u ON u.id=d.reporter_id WHERE u.role<>'tenant') AS wrong_reporter_role,
    (SELECT count(*)::int FROM hausportal.damages d JOIN hausportal.users u ON u.id=d.assignee_id WHERE u.role<>'admin') AS wrong_assignee_role,
    (SELECT count(*)::int FROM hausportal.damage_messages m JOIN hausportal.users u ON u.id=m.author_id WHERE u.role<>m.author_role) AS wrong_message_author_role,
    (SELECT count(*)::int FROM hausportal.damages d LEFT JOIN hausportal.damage_invoices i ON i.damage_id=d.id WHERE (d.status IN ('invoiced','paid')) IS DISTINCT FROM (i.damage_id IS NOT NULL)) AS inconsistent_invoice_status,
    (SELECT count(*)::int FROM hausportal.damages d WHERE d.status IS DISTINCT FROM (SELECT e.status FROM hausportal.damage_events e WHERE e.damage_id=d.id ORDER BY e.id DESC LIMIT 1)) AS inconsistent_status_history
  `)
  ).rows[0];
  if (counts.damage_owner_assignments !== undefined) {
    Object.assign(
      checks,
      (
        await client.query(`SELECT
      (SELECT count(*)::int FROM hausportal.damage_owner_assignments a JOIN hausportal.damage_invoices i ON i.damage_id=a.damage_id WHERE a.ended_at IS NULL AND a.owner_id IS DISTINCT FROM i.owner_id) AS inconsistent_invoice_assignment,
      (SELECT count(*)::int FROM (SELECT damage_id,user_id FROM hausportal.damage_access GROUP BY damage_id,user_id HAVING count(*)>1) x) AS duplicate_access_rows,
      (SELECT count(*)::int FROM hausportal.damage_access a JOIN hausportal.users u ON u.id=a.user_id WHERE NOT u.active) AS inactive_user_access
    `)
      ).rows[0],
    );
  }
  for (const [name, count] of Object.entries(checks)) {
    assert.equal(count, 0, `Konsistenzprüfung fehlgeschlagen: ${name}`);
    console.log(`PASS ${name}: 0`);
  }
  const applied = (
    await client.query(
      "SELECT name,checksum FROM hausportal.schema_migrations ORDER BY name",
    )
  ).rows;
  const local = await readdir("db/migrations");
  for (const migration of applied) {
    assert.ok(
      local.includes(migration.name),
      `Migration fehlt: ${migration.name}`,
    );
    const checksum = createHash("sha256")
      .update(await readFile(`db/migrations/${migration.name}`))
      .digest("hex");
    assert.equal(
      checksum,
      migration.checksum,
      `Migration verändert: ${migration.name}`,
    );
  }
  console.log(`PASS ${applied.length} angewendete Migrationen unverändert`);
  await client.query("ROLLBACK");
} finally {
  await client.end();
}
