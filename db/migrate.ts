import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
async function main() {
  try {
    process.loadEnvFile?.(".env.local");
  } catch {
    /* Hosting can inject environment variables. */
  }
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL_UNPOOLED in .env.local first.");
  const pool = new Pool({
    connectionString: url,
    connectionTimeoutMillis: 10000,
  });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./db/migrations" });
    console.log("Database migrations applied.");
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
