import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";

let pool: Pool | undefined;

function connectionPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    });
    attachDatabasePool(pool);
  }
  return pool;
}

export function database() {
  return drizzle(connectionPool(), { schema });
}

export async function checkDatabase() {
  const dbPool = connectionPool();
  const ping = await dbPool.query<{ ok: number }>("select 1::int as ok");
  const expectedTables = ["tenants", "accounts", "auth_sessions", "records", "audit"];
  const tableResult = await dbPool.query<{ table_name: string }>(
    `select table_name
       from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])`,
    [expectedTables],
  );
  const tables = tableResult.rows.map((row) => row.table_name).sort();
  return {
    connected: ping.rows[0]?.ok === 1,
    migrated: expectedTables.every((name) => tables.includes(name)),
    tables,
  };
}
