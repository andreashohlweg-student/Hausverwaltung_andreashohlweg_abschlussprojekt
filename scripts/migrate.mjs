import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";

process.loadEnvFile?.(".env.local");
const connectionString =
  process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) throw new Error("DATABASE_URL_UNPOOLED fehlt.");
const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(72194601)");
  await client.query("CREATE SCHEMA IF NOT EXISTS hausportal");
  await client.query(
    "CREATE TABLE IF NOT EXISTS hausportal.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const name of (await readdir("db/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(`db/migrations/${name}`, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await client.query(
      "SELECT checksum FROM hausportal.schema_migrations WHERE name=$1",
      [name],
    );
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum)
        throw new Error(`Angewendete Migration verändert: ${name}`);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO hausportal.schema_migrations(name, checksum) VALUES ($1,$2)",
        [name, checksum],
      );
      await client.query("COMMIT");
      console.log(`Migration angewendet: ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  console.log("Datenbankschema aktuell.");
} finally {
  await client.end();
}
