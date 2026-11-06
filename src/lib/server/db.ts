import "server-only";
import { Pool, type PoolClient } from "pg";
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

export type DatabaseClient = Pick<PoolClient, "query">;

export async function transaction<T>(
  work: (client: PoolClient) => Promise<T>,
  readOnly = false,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query(
      readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN",
    );
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// All writes that can affect case location or assignment use this lock first.
export async function lockApplicationState(client: DatabaseClient) {
  const { rows } = await client.query<{ revision: string }>(
    "SELECT revision FROM hausportal.state WHERE id=1 FOR UPDATE",
  );
  return Number(rows[0].revision);
}
