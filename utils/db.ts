import "dotenv/config"
import { Pool, type QueryResult } from "pg"

const pool = new Pool({connectionString: process.env.DATABASE_URL})

export function query<T extends QueryResultsRow = QueryResultRow>(text: string, params: unknown[] = []) {
    return pool.query<T>(text, params);
}
