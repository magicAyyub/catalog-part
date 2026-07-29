import { db } from "@/lib/db/client";
import { apiCache } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Encapsule un appel de liste API avec persistance SQLite locale.
 * Si la clé est déjà en base, retourne la valeur immédiatement.
 * Sinon, appelle l'API, l'enregistre en base et la renvoie.
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
