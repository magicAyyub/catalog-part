import { ALLOWED_SUPPLIER_IDS } from "@/lib/config";
import { searchArticlesByReference, type SearchResultArticle } from "@/lib/db/queries/search";
import { getArticleDetail } from "@/lib/acquisition/catalog";
import { billedCallCount, rapidApi } from "@/lib/rapidapi/client";
import { db, type Tx } from "@/lib/db/client";
import { articles, suppliers } from "@/lib/db/schema";
import { chunked } from "@/lib/acquisition/chunk";
import { logger } from "@/lib/logger";

function generateSyntheticArticleId(supplierId: number, articleNo: string): number {
    const str = `${supplierId}:${articleNo.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) + 100000000;
}

function insertSuppliers(tx: Tx, rows: { supplierId: number; name: string }[]): void {
    const unique = [...new Map(rows.map((s) => [s.supplierId, s])).values()];
    for (const batch of chunked(unique)) {
        tx.insert(suppliers).values(batch).onConflictDoNothing().run();
    }
}

/**
 * Récupération et acquisition par référence d'article.
 *
 * Flux :
 * 1. Recherche locale initiale dans SQLite via `searchArticlesByReference`.
 * 2. Acquisition via RapidAPI :
 *    a. `quickArticleSearch` (POST `/articles/quick-article-search`) : résout ref -> articleId.
 *    b. Pour l'article principal trouvé, appel de `selectArticleCrossReferences` (GET `/artlookup/select-article-cross-references/article-id/{articleId}/lang-id/{LANG_ID}`).
 *    c. Enregistrement en base SQLite des équivalents issus des équipementiers autorisés (BOSCH, ETF, TRW, VALEO, TEXTAR).
 *    d. Enrichissement des détails (`getArticleDetail`) pour enregistrer les numéros OEM et véhicules compatibles.
 * 3. Ré-exécution de la recherche locale pour alimenter l'interface avec tous les équivalents découverts.
 */
export async function getArticlesByReferenceWithCrossReferences(
    query: string
): Promise<SearchResultArticle[]> {
    const startTime = Date.now();
    const callsBefore = billedCallCount();

    // 1. Recherche locale initiale
    let localMatches = await searchArticlesByReference(query, 50);

    // Si on a moins de 2 résultats locaux, on déclenche l'acquisition en ligne par référence
    if (localMatches.length < 2) {
        try {
            const quickRes = await rapidApi.quickArticleSearch(query);
            const fetchedArticles = (quickRes.articles ?? []).filter((a) =>
                ALLOWED_SUPPLIER_IDS.has(a.supplierId)
            );

            if (fetchedArticles.length > 0) {
                // Enregistrer les articles principaux dans SQLite
                db.transaction((tx) => {
                    insertSuppliers(
                        tx,
                        fetchedArticles.map((a) => ({ supplierId: a.supplierId, name: a.supplierName }))
                    );
                    for (const batch of chunked(fetchedArticles)) {
                        tx.insert(articles)
                            .values(
                                batch.map((a) => ({
                                    articleId: a.articleId,
                                    articleNo: a.articleNo,
                                    supplierId: a.supplierId,
                                    productName: a.articleProductName,
                                    mediaType: a.articleMediaType ?? null,
                                    mediaFileName: a.articleMediaFileName ?? null,
                                    imageUrl: a.s3image ?? null,
                                }))
                            )
                            .onConflictDoNothing()
                            .run();
                    }
                });

                // Pour les articles principaux (top matches) : récupérer les cross-références
                const topMainArticles = (quickRes.articles ?? []).filter((a) => a.articleId).slice(0, 3);
                for (const mainArt of topMainArticles) {
                    if (!mainArt.articleId) continue;

                    const xrefRes = await rapidApi.selectArticleCrossReferences(mainArt.articleId);
                    const xrefList = (xrefRes.articles ?? []).filter((a) =>
                        ALLOWED_SUPPLIER_IDS.has(a.supplierId)
                    );

                    if (xrefList.length > 0) {
                        db.transaction((tx) => {
                            insertSuppliers(
                                tx,
                                xrefList.map((a) => ({ supplierId: a.supplierId, name: a.supplierName }))
                            );
                            for (const batch of chunked(xrefList)) {
                                tx.insert(articles)
                                    .values(
                                        batch.map((a) => ({
                                            articleId:
                                                a.articleId && a.articleId > 0
                                                    ? a.articleId
                                                    : generateSyntheticArticleId(a.supplierId, a.articleNo),
                                            articleNo: a.articleNo,
                                            supplierId: a.supplierId,
                                            productName: a.articleProductName,
                                            mediaType: a.articleMediaType ?? null,
                                            mediaFileName: a.articleMediaFileName ?? null,
                                            imageUrl: a.s3image ?? null,
                                        }))
                                    )
                                    .onConflictDoNothing()
                                    .run();
                            }
                        });
                    }

                    // Enrichir les détails de l'article principal (sauvegarde OEM + compatibilités véhicules)
                    await getArticleDetail(mainArt.articleId);

                    // Enrichir également les détails des premières cross-références avec un articleId valide
                    const topXrefs = xrefList.filter((a) => a.articleId && a.articleId > 0).slice(0, 3);
                    for (const xref of topXrefs) {
                        if (xref.articleId) {
                            await getArticleDetail(xref.articleId);
                        }
                    }
                }

                // Ré-exécuter la recherche locale pour récupérer la liste complète enrichie
                localMatches = await searchArticlesByReference(query, 50);
            }
        } catch (error) {
            logger.warn("Online reference acquisition failed", {
                module: "acquisition",
                action: "reference_acquisition_failed",
                query,
                error,
            });
        }
    } else {
        // Si la référence principale est locale, enrichir ses détails si pas encore fait
        const topMatch = localMatches[0];
        try {
            await getArticleDetail(topMatch.articleId);
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

    // Filtrage strict par équipementiers autorisés
    const allowedMatches = localMatches.filter((a) => ALLOWED_SUPPLIER_IDS.has(a.supplierId));

    logger.info("Reference search executed", {
        module: "acquisition",
        action: "reference_search",
        query,
        foundCount: allowedMatches.length,
        billedCalls: billedCallCount() - callsBefore,
        durationMs: Date.now() - startTime,
    });

    return allowedMatches;
}

