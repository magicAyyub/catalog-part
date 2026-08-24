import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database(process.env.SQLITE_PATH ?? "./data/app.db");

// WAL pour laisser les lectures passer pendant une acquisition.
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

/**
 * Contexte transactionnel passé aux fonctions d'écriture.
 *
 * Le driver est synchrone et refuse un callback qui rend une promesse : tout
 * appel réseau doit rester en dehors de la transaction.
 */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
