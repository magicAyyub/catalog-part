import { eq, inArray, like, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { articleCriteria, articleOemNumbers, articles, catalogSync, fitments, vehicles } from "@/lib/db/schema";
import { normalizePlate } from "@/lib/vehicle/plate-resolver";
import { normalizeReference, searchArticlesByReference } from "@/lib/db/queries/search";
import { identifyPlate } from "@/lib/plate/identify";
import { logger } from "@/lib/logger";

export interface PurgeResult {
    success: boolean;
    message: string;
    purgedCount: number;
    details?: string;
}

export async function purgeCacheForPlate(rawPlate: string): Promise<PurgeResult> {
    const cleanPlate = normalizePlate(rawPlate);
    if (!cleanPlate) {
        return {
            success: false,
            message: "Format d'immatriculation invalide.",
            purgedCount: 0,
        };
    }

    let vehicleId: number | null = null;

    // 1. Essayer d'identifier le kType via la plaque
    try {
        const identified = await identifyPlate(cleanPlate);
        vehicleId = identified.kType;
    } catch {
        // En cas d'échec Exadis, tenter de trouver un véhicule en base ayant des fitments
    }

    if (!vehicleId) {
        // Recherche dans vehicles par libellés ou catalogSync
        const existingSync = await db
            .select({ vehicleId: catalogSync.vehicleId })
            .from(catalogSync)
            .limit(10);

        if (existingSync.length === 0) {
            return {
                success: false,
                message: `Aucun véhicule en cache trouvé pour la plaque ${cleanPlate}.`,
                purgedCount: 0,
            };
        }
    }

    let deletedSync = 0;
    let deletedFitments = 0;

    if (vehicleId) {
        const resSync = await db.delete(catalogSync).where(eq(catalogSync.vehicleId, vehicleId)).run();
        deletedSync = resSync.changes;

        const resFitments = await db.delete(fitments).where(eq(fitments.vehicleId, vehicleId)).run();
        deletedFitments = resFitments.changes;
    } else {
        // Si vehicleId non déterminé précisément, réinitialiser la table de sync globale
        const resSync = await db.delete(catalogSync).run();
        deletedSync = resSync.changes;
    }

    logger.info("Cache purged for plate", {
        module: "admin",
        action: "cache_purge_plate",
        plate: cleanPlate,
        vehicleId,
        deletedSync,
        deletedFitments,
    });

    return {
        success: true,
        message: `Cache purgé avec succès pour la plaque ${cleanPlate}. (${deletedSync} catégories réinitialisées, ${deletedFitments} compatibilités supprimées)`,
        purgedCount: deletedSync + deletedFitments,
    };
}

export async function purgeCacheForReference(rawReference: string): Promise<PurgeResult> {
    const cleaned = normalizeReference(rawReference);
    if (cleaned.length < 2) {
        return {
            success: false,
            message: "Référence trop courte pour la purge.",
            purgedCount: 0,
        };
    }

    // 1. Trouver les articles en base correspondant à cette référence ou numéros OEM
    const matches = await searchArticlesByReference(cleaned, 100);
    const matchedArticleIds = matches.map((m) => m.articleId);

    if (matchedArticleIds.length === 0) {
        return {
            success: false,
            message: `Aucun article en cache trouvé pour la référence "${cleaned}".`,
            purgedCount: 0,
        };
    }

    // 2. Réinitialiser `detailsFetchedAt` pour forcer la réacquisition RapidAPI lors du prochain passage
    const resReset = await db
        .update(articles)
        .set({ detailsFetchedAt: null })
        .where(inArray(articles.articleId, matchedArticleIds))
        .run();

    // 3. Supprimer les entrées OEM et critères pour forcer l'enrichissement frais
    const resOem = await db
        .delete(articleOemNumbers)
        .where(inArray(articleOemNumbers.articleId, matchedArticleIds))
        .run();

    const resCriteria = await db
        .delete(articleCriteria)
        .where(inArray(articleCriteria.articleId, matchedArticleIds))
        .run();

    logger.info("Cache purged for reference", {
        module: "admin",
        action: "cache_purge_reference",
        query: cleaned,
        matchedCount: matchedArticleIds.length,
        resReset: resReset.changes,
    });

    return {
        success: true,
        message: `Cache réinitialisé avec succès pour la référence "${cleaned}" (${matchedArticleIds.length} article(s) remis à zéro).`,
        purgedCount: resReset.changes + resOem.changes + resCriteria.changes,
    };
}

export async function purgeAllCache(): Promise<PurgeResult> {
    const resSync = await db.delete(catalogSync).run();
    const resReset = await db.update(articles).set({ detailsFetchedAt: null }).run();

    logger.info("Global cache purged", {
        module: "admin",
        action: "cache_purge_all",
        deletedSync: resSync.changes,
        resetArticles: resReset.changes,
    });

    return {
        success: true,
        message: `Cache global réinitialisé avec succès (${resSync.changes} syncs purgées, ${resReset.changes} fiches articles remises à zéro).`,
        purgedCount: resSync.changes + resReset.changes,
    };
}
