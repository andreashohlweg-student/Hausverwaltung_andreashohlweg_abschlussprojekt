import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";

const globalDatabase = globalThis as unknown as { hausportalPool?: Pool };
export function getPool(): Pool {
  if (!globalDatabase.hausportalPool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL fehlt.");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
    });
    pool.on("error", () =>
      console.error("Postgres-Verbindung wurde geschlossen."),
    );
    if (process.env.VERCEL) attachDatabasePool(pool);
    globalDatabase.hausportalPool = pool;
  }
  return globalDatabase.hausportalPool;
}
