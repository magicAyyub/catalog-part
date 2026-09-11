import { ALLOWED_SUPPLIER_IDS } from "@/lib/config";
import { searchArticlesByReference, type SearchResultArticle } from "@/lib/db/queries/search";
import { getArticleDetail } from "@/lib/acquisition/catalog";
import { logger } from "@/lib/logger";

/**
 * Récupération et acquisition par référence d'article.
 *
 * 1. Cherche dans le référentiel local SQLite.
 * 2. Si la référence principale est trouvée, enrichit ses détails (OEM + véhicules compatibles).
 * 3. Re-recherche les équivalents par numéros OEM / EAN dans le référentiel local.
 * 4. Filtre strictement selon ALLOWED_SUPPLIER_IDS (BOSCH, ETF, TRW, VALEO, TEXTAR).
 */
export async function getArticlesByReferenceWithCrossReferences(
    query: string
): Promise<SearchResultArticle[]> {
    const startTime = Date.now();

    // 1. Recherche locale initiale
    let localMatches = await searchArticlesByReference(query, 50);

    // Si on a des correspondances, enrichir les détails de la cible principale (pour récupérer les OEM)
    if (localMatches.length > 0) {
        const topMatch = localMatches[0];
        try {
            await getArticleDetail(topMatch.articleId);
            // Réexécuter la recherche pour capturer tous les nouveaux équivalents rattachés aux OEM
            localMatches = await searchArticlesByReference(query, 50);
        } catch (error) {
            logger.warn("Cross-reference enrichment error", {
                module: "acquisition",
                action: "cross_reference_enrichment_failed",
                articleId: topMatch.articleId,
                error,
            });
        }
    }

    // Filtrage strict ultime par équipementiers autorisés
    const allowedMatches = localMatches.filter((a) => ALLOWED_SUPPLIER_IDS.has(a.supplierId));

    logger.info("Reference search executed", {
        module: "acquisition",
        action: "reference_search",
        query,
        foundCount: allowedMatches.length,
        durationMs: Date.now() - startTime,
    });

    return allowedMatches;
}
