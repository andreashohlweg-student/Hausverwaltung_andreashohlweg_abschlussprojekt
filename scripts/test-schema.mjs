import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.NEON_BRANCH?.startsWith("hausportal-check-"))
  throw new Error(
    "Schema-Tests benötigen einen isolierten hausportal-check-Branch.",
  );
const schema = `schema_check_${randomUUID().replaceAll("-", "")}`;
const url = new URL(process.env.DATABASE_URL_UNPOOLED);
url.searchParams.set("sslmode", "verify-full");
const client = new pg.Client({ connectionString: url.href });
await client.connect();
try {
  await client.query("BEGIN");
  for (const name of (await readdir("db/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = (await readFile(`db/migrations/${name}`, "utf8")).replace(
      /\bhausportal\b/g,
      schema,
    );
    await client.query(sql);
    console.log(`PASS Neuinstallation ${name}`);
  }
  const owner = (
    await client.query(`SELECT id FROM ${schema}.owners ORDER BY id LIMIT 1`)
  ).rows[0].id;
  const unit = (
    await client.query(
      `SELECT id,property_id FROM ${schema}.units ORDER BY id LIMIT 1`,
    )
  ).rows[0];
  const otherBuilding = (
    await client.query(
      `SELECT id FROM ${schema}.properties WHERE id<>$1 LIMIT 1`,
      [unit.property_id],
    )
  ).rows[0].id;
  const tenant = (
    await client.query(`SELECT id FROM ${schema}.tenants ORDER BY id LIMIT 1`)
  ).rows[0].id;
  const caseId = randomUUID();
  await client.query(
    `INSERT INTO ${schema}.users(id,email,name,role,tenant_id) VALUES('schema-user','schema@example.com','Schema','tenant',$1)`,
    [tenant],
  );
  await client.query(
    `INSERT INTO ${schema}.damages(id,reporter_id,tenant_id,property_id,unit_id,location,description,language) VALUES($1,'schema-user',$2,$3,$4,'Ort','Test','de')`,
    [caseId, tenant, unit.property_id, unit.id],
  );
  await client.query(
    `INSERT INTO ${schema}.damage_owner_assignments(damage_id,owner_id,owner_name,source) VALUES($1,$2,'Historischer Name','manual')`,
    [caseId, owner],
  );
  await client.query("SAVEPOINT moved_unit");
  await assert.rejects(
    client.query(`UPDATE ${schema}.units SET property_id=$1 WHERE id=$2`, [
      otherBuilding,
      unit.id,
    ]),
    { code: "23001" },
  );
  await client.query("ROLLBACK TO SAVEPOINT moved_unit");
  console.log(
    "PASS Fall und Einheit können keine unterschiedlichen Gebäude erhalten",
  );

  await client.query(`DELETE FROM ${schema}.properties WHERE id=$1`, [
    unit.property_id,
  ]);
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  const retained = (
    await client.query(
      `SELECT property_id,unit_id,location FROM ${schema}.damages WHERE id=$1`,
      [caseId],
    )
  ).rows[0];
  assert.deepEqual(retained, {
    property_id: null,
    unit_id: null,
    location: "Ort",
  });
  console.log(
    "PASS Gebäudelöschung erhält den eigenständigen Fall mit historischer Ortsangabe",
  );
  await client.query("ROLLBACK");
  console.log(
    "Schema-Tests erfolgreich; sämtliche Testtabellen und Änderungen zurückgerollt.",
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
