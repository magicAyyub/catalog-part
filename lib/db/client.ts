import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database(process.env.SQLITE_PATH ?? "./data/app.db");

// Pragmas recommandés pour un usage web (lectures concurrentes fréquentes, écritures par la sync)
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Insérer automatiquement les catégories par défaut si absentes dans la base SQLite
try {
    sqlite.exec(`
        INSERT OR IGNORE INTO categories (category_id, label_fr, label_en)
        VALUES 
            (100030, 'Plaquettes de frein', 'Brake Pads'),
            (100032, 'Disques de frein', 'Brake Discs');
    `);
} catch {
    // La table sera créée lors de la première migration
}

export const db = drizzle(sqlite, { schema });