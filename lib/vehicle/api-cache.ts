import { db } from "@/lib/db/client";
import { apiCache } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { gzipSync, gunzipSync } from "zlib";
import { logger } from "@/lib/logger";

/**
 * Encapsule un appel API avec persistance SQLite locale.
 * Si la clé est déjà en base, retourne la valeur immédiatement.
 * Sinon, appelle l'API, l'enregistre en base et la renvoie.
 *
 * Sans expiration : réservé aux données stables (référentiels, fiches article).
 */
export async function getWithCache<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
    const [cached] = await db
        .select()
        .from(apiCache)
        .where(eq(apiCache.key, key))
        .limit(1);

    if (cached) {
        try {
            return JSON.parse(cached.valueJson) as T;
        } catch (e) {
            console.warn(`Erreur lors du parsing du cache SQLite pour ${key}:`, e);
        }
    }

    const freshData = await fetchFn();

    try {
        await db
            .insert(apiCache)
            .values({
                key,
                valueJson: JSON.stringify(freshData),
                updatedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: apiCache.key,
                set: {
                    valueJson: JSON.stringify(freshData),
                    updatedAt: new Date(),
                },
            });
    } catch (e) {
        console.warn(`Impossible de sauvegarder la clé ${key} dans api_cache :`, e);
    }

    return freshData;
}

/** Marqueur de préfixe : distingue une valeur compressée d'un JSON en clair. */
const GZIP_PREFIX = "gz:";

/**
 * Même contrat que `getWithCache`, mais la valeur est stockée compressée.
 *
 * Destiné aux réponses volumineuses : une fiche `article-complete-details` pèse
 * ~274 Ko (302 références OEM, 1 203 véhicules compatibles). Sur plusieurs
 * milliers d'articles consultés, la base atteindrait le gigaoctet. Le JSON,
 * très répétitif, se compresse d'environ 8 à 10 fois — ce qui rend le cache
 * viable dans la durée sans rien retirer à l'affichage.
 *
 * Les valeurs écrites par `getWithCache` restent lisibles ici : l'absence de
 * préfixe indique du JSON en clair.
 */
export async function getWithCompressedCache<T>(
    key: string,
    fetchFn: () => Promise<T>
): Promise<T> {
    const [cached] = await db
        .select({ valueJson: apiCache.valueJson })
        .from(apiCache)
        .where(eq(apiCache.key, key))
        .limit(1);

    if (cached) {
        try {
            const raw = cached.valueJson.startsWith(GZIP_PREFIX)
                ? gunzipSync(Buffer.from(cached.valueJson.slice(GZIP_PREFIX.length), "base64")).toString("utf-8")
                : cached.valueJson;
            return JSON.parse(raw) as T;
        } catch (error) {
            // Entrée illisible : on la traite comme absente et on la réécrira.
            logger.warn("Unreadable compressed cache entry — refetching", {
                module: "api-cache",
                action: "decode_error",
                key,
                error,
            });
        }
    }

    const freshData = await fetchFn();

    try {
        const json = JSON.stringify(freshData);
        const packed = GZIP_PREFIX + gzipSync(Buffer.from(json, "utf-8")).toString("base64");
        await db
            .insert(apiCache)
            .values({ key, valueJson: packed, updatedAt: new Date() })
            .onConflictDoUpdate({
                target: apiCache.key,
                set: { valueJson: packed, updatedAt: new Date() },
            });
    } catch (error) {
        logger.warn("Failed to write compressed cache entry", {
            module: "api-cache",
            action: "write_error",
            key,
            error,
        });
    }

    return freshData;
}