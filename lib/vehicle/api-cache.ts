import { db } from "@/lib/db/client";
import { apiCache } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { gzipSync, gunzipSync } from "zlib";
import { logger } from "@/lib/logger";

/**
 * Wraps an API call with local SQLite persistence. Returns the stored value when
 * the key is present, otherwise calls the API, stores the result and returns it.
 *
 * No expiry: reserved for stable data such as referentials and article records.
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

/** Prefix marker telling a compressed value from plain JSON. */
const GZIP_PREFIX = "gz:";

/**
 * Same contract as `getWithCache`, value stored compressed.
 *
 * An `article-complete-details` record weighs about 274 KB and compresses
 * roughly ten times, which keeps the cache viable across thousands of articles.
 * Values written by `getWithCache` stay readable: no prefix means plain JSON.
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
            logger.warn("Unreadable compressed cache entry, refetching", {
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