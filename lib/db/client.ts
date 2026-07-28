import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database(process.env.SQLITE_PATH ?? "./data/app.db");

// Pragmas recommandés pour un usage web (lectures concurrentes fréquentes, écritures par la sync)
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });