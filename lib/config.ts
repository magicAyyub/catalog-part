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

export const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? "";
export const RAPIDAPI_BASE_URL = process.env.BASE_URL ?? "https://auto-parts-catalog.p.rapidapi.com";
export const LANG_ID = "6";
export const COUNTRY_FILTER_ID = "63";
export const TYPE_ID = "1";

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

// Équipementiers autorisés, via ALLOWED_SUPPLIER_IDS_PROD dans .env.
// C'est le levier de coût le plus direct : un équipementier de plus, c'est un
// appel « critères » de plus par catégorie et par véhicule.
export const ALLOWED_SUPPLIER_IDS: Set<number> = parseIntList(
    process.env.ALLOWED_SUPPLIER_IDS_PROD,
    [7657, 161, 30, 21, 39]
);
