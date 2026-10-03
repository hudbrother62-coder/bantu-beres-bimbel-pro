import { Pool } from "pg";

async function main() {
  try {
    process.loadEnvFile?.(".env.local");
  } catch {
    /* Hosting can inject environment variables. */
  }

  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_UNPOOLED atau DATABASE_URL belum diisi.");

  const pool = new Pool({
    connectionString: url,
    connectionTimeoutMillis: 10000,
    max: 1,
  });

  try {
    const ping = await pool.query<{ ok: number }>("select 1::int as ok");
    const tables = await pool.query<{ table_name: string }>(
      `select table_name
         from information_schema.tables
        where table_schema = 'public'
          and table_name = any($1::text[])
        order by table_name`,
      [["tenants", "accounts", "auth_sessions", "records", "audit"]],
    );

    const found = tables.rows.map((row) => row.table_name);
    const expected = ["tenants", "accounts", "auth_sessions", "records", "audit"];
    const migrated = expected.every((name) => found.includes(name));

    console.log(
      JSON.stringify(
        {
          connected: ping.rows[0]?.ok === 1,
          migrated,
          tables: found,
        },
        null,
        2,
      ),
    );

    if (!migrated) process.exitCode = 2;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Database check failed:", error.message);
  process.exitCode = 1;
});
