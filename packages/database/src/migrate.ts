import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
const { db, pool } = await import("./client");

try {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  console.log("Database migrations applied.");
} finally {
  await pool.end();
}
