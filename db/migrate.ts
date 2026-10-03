import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
try {
  process.loadEnvFile?.(".env.local");
} catch {
  /* Environment may be supplied by hosting. */
}
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL_UNPOOLED in .env.local first.");
const pool = new Pool({ connectionString: url });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./db/migrations" });
  console.log("Database migrations applied.");
} finally {
  await pool.end();
}
