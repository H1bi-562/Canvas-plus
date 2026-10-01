import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const connectionString = process.env.NODE_ENV === "test" ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
const globalDb = globalThis as unknown as { canvasplusPool?: pg.Pool };
export const pool = globalDb.canvasplusPool ?? new pg.Pool({ connectionString, connectionTimeoutMillis: 10000, max: 10 });
if (process.env.NODE_ENV !== "production") globalDb.canvasplusPool = pool;
export const db = drizzle(pool, { schema });
