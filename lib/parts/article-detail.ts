/**
 * Builds the detail of one reference, from the two sources it takes to make one.
 *
 * The local database answers for what the sync already brought back, with no
 * network call. `article-complete-details` answers for OEM references, EAN codes
 * and compatible vehicles, which the sync does not fetch.
 *
 * This lives outside the route on purpose: the detail page renders on the server
 * and must go through exactly this function, not through its own upstream call.
 * The remote half is cached permanently and compressed, the payload weighing
 * about 274 KB and one reference recurring across dozens of vehicles. Reaching
 * around this cache would put a billed call behind every page view.
 *
 * Server only.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { articles, articleSpecifications, suppliers } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { rapidApi } from "@/lib/rapidapi/client";
import { getWithCache, getWithCompressedCache } from "@/lib/vehicle/api-cache";
import type { ApiArticleDetails, ApiMediaItem } from "@/lib/rapidapi/types";

async function fetchArticleDetails(articleId: number): Promise<ApiArticleDetails | null> {
    try {
        return await getWithCompressedCache(`article_details_${articleId}`, () =>
            rapidApi.getArticleDetails(articleId)
        );
    } catch (error) {
        // Enrichissement optionnel : une indisponibilité n'empêche pas
        // d'afficher la fiche avec ce que la base contient déjà.
        logger.warn("Article details enrichment failed", {
            action: "article-detail",
            articleId,
            error,
        });
        return null;
    }
}

/**
 * The reference as the page shows it, or null when neither source knows it.
 *
 * Nothing is invented. An earlier version fabricated OEM references and
 * compatible vehicles whenever TecDoc stayed silent, which a permanent cache
 * would have frozen. An empty field is hidden by the page on its own.
 */
export async function loadArticleDetail(articleId: number): Promise<ApiArticleDetails | null> {
    const [art] = await db.select().from(articles).where(eq(articles.articleId, articleId)).limit(1);

    // Article inconnu localement : on sert la fiche TecDoc telle quelle.
    if (!art) return await fetchArticleDetails(articleId);

    const [supplier] = await db
        .select()
        .from(suppliers)
        .where(eq(suppliers.supplierId, art.supplierId))
        .limit(1);
    const dbSpecs = await db
        .select()
        .from(articleSpecifications)
        .where(eq(articleSpecifications.articleId, articleId));

    const supplierName = supplier?.supplierName || "Marque inconnue";
    const details = await fetchArticleDetails(articleId);
    const remote = details?.article;

    return {
        article: {
            articleId: art.articleId,
            articleNo: art.articleNo,
            articleProductName: art.articleProductName,
            supplierName,
            supplierId: art.supplierId,
            articleMediaType: art.articleMediaType || "",
            articleMediaFileName: art.articleMediaFileName || "",
            articleInfo: {
                articleId: art.articleId,
                articleNo: art.articleNo,
                supplierId: art.supplierId,
                supplierName,
                isAccessory: 0,
                articleProductName: art.articleProductName,
            },
            // Les caractéristiques locales viennent de la synchronisation des
            // critères ; repli sur la fiche TecDoc si elle n'a rien trouvé.
            allSpecifications:
                dbSpecs.length > 0
                    ? dbSpecs.map((s) => ({
                          criteriaName: s.criteriaName,
                          criteriaValue: s.criteriaValue,
                      }))
                    : (remote?.allSpecifications ?? []),
            eanNo: remote?.eanNo ?? null,
            oemNo: remote?.oemNo ?? [],
            s3image: art.s3image || remote?.s3image || "",
            compatibleCars: remote?.compatibleCars ?? [],
        },
    };
}

/** Image gallery, cached with no expiry. Accessory: the page renders without it. */
export async function loadArticleMedia(articleId: number): Promise<ApiMediaItem[]> {
    try {
        return await getWithCache(`article_media_${articleId}`, () =>
            rapidApi.getArticleMedia(articleId)
        );
    } catch (error) {
        logger.warn("Article media lookup failed", {
            action: "article-media",
            articleId,
            error,
        });
        return [];
    }
}
