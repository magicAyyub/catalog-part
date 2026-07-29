/**
 * lib/config.ts
 *
 * Centralise toutes les constantes métier et d'infrastructure lues depuis
 * les variables d'environnement. Modifier le fichier .env suffit pour
 * ajuster le comportement sans toucher au code source.
 *
 * Réservé au serveur (API routes, sync-service). Ne pas importer côté client.
 */

function parseIntList(raw: string | undefined, fallback: number[]): Set<number> {
    if (!raw || raw.trim() === "") return new Set(fallback);
    return new Set(
        raw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map(Number)
            .filter((n) => !Number.isNaN(n))
    );
}

function parseIntEnv(raw: string | undefined, fallback: number): number {
    const n = Number(raw);
    return Number.isNaN(n) || raw === undefined ? fallback : n;
}

export const IS_MOCK = process.env.USE_MOCK_API === "true";

export const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? "";
export const RAPIDAPI_BASE_URL = process.env.BASE_URL ?? "https://auto-parts-catalog.p.rapidapi.com";
export const MOCK_BASE_URL = process.env.MOCK_BASE_URL ?? "http://localhost:4000";
export const LANG_ID = process.env.LANG_ID ?? "6";
export const COUNTRY_FILTER_ID = process.env.COUNTRY_FILTER_ID ?? "63";
export const TYPE_ID = process.env.TYPE_ID ?? "1";

// Durée de vie du cache. Configurable via SYNC_TTL_DAYS dans .env.
export const SYNC_TTL_MS = parseIntEnv(process.env.SYNC_TTL_DAYS, 30) * 24 * 60 * 60 * 1000;

// Catégories TecDoc à synchroniser. Configurable via ALLOWED_CATEGORY_IDS dans .env.
export const ALLOWED_CATEGORY_IDS = parseIntList(
    process.env.ALLOWED_CATEGORY_IDS,
    [100030, 100032]
);

export const CATEGORIES: { categoryId: number; labelFr: string }[] = [
    { categoryId: 100030, labelFr: "Plaquettes de frein" },
    { categoryId: 100032, labelFr: "Disques de frein" },
];

// Équipementiers autorisés. Deux listes distinctes selon le mode d'exécution.
// Production : ALLOWED_SUPPLIER_IDS_PROD dans .env (IDs TecDoc réels)
// Mock local  : ALLOWED_SUPPLIER_IDS_MOCK dans .env (IDs du serveur de fixtures)
export const ALLOWED_SUPPLIER_IDS: Set<number> = IS_MOCK
    ? parseIntList(process.env.ALLOWED_SUPPLIER_IDS_MOCK, [2, 8, 12])
    : parseIntList(process.env.ALLOWED_SUPPLIER_IDS_PROD, [7657, 161, 30, 21, 39]);
