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

function saveArticlesBatch(
    rows: {
        supplierId: number;
        supplierName: string;
        articleNo: string;
        articleProductName: string;
        articleId?: number | null;
        articleMediaType?: string | null;
        articleMediaFileName?: string | null;
        s3image?: string | null;
    }[]
): void {
    if (rows.length === 0) return;
    db.transaction((tx) => {
        insertSuppliers(
            tx,
            rows.map((a) => ({ supplierId: a.supplierId, name: a.supplierName }))
        );
        for (const batch of chunked(rows)) {
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

                // Pour les articles principaux (top matches) : récupérer les cross-références (niveau 1 & 2)
                const topMainArticles = (quickRes.articles ?? []).filter((a) => a.articleId).slice(0, 3);
                for (const mainArt of topMainArticles) {
                    if (!mainArt.articleId) continue;

                    // Niveau 1 : Cross-références directes
                    const xrefRes = await rapidApi.selectArticleCrossReferences(mainArt.articleId);
                    const xrefList = (xrefRes.articles ?? []).filter((a) =>
                        ALLOWED_SUPPLIER_IDS.has(a.supplierId)
                    );

                    if (xrefList.length > 0) {
                        saveArticlesBatch(xrefList);

                        // 3. Collection de tous les articleId uniques découverts pour enrichir leurs numéros OEM
                        const allDiscovered = [...xrefList];

                        // Niveau 2 : Interroger les cross-références des 2 premiers équivalents autorisés
                        // Cela permet de découvrir des marques comme VALEO quand TecDoc ne lie TRW qu'à BOSCH
                        const topFirstLevelAllowed = xrefList.filter((a) => a.articleId && a.articleId > 0).slice(0, 3);
                        for (const firstLevelArt of topFirstLevelAllowed) {
                            if (!firstLevelArt.articleId) continue;
                            try {
                                const secondXrefRes = await rapidApi.selectArticleCrossReferences(firstLevelArt.articleId);
                                const secondXrefList = (secondXrefRes.articles ?? []).filter((a) =>
                                    ALLOWED_SUPPLIER_IDS.has(a.supplierId)
                                );
                                saveArticlesBatch(secondXrefList);
                                allDiscovered.push(...secondXrefList);
                            } catch (err) {
                                logger.warn("Second level cross-reference fetch failed", {
                                    module: "acquisition",
                                    action: "second_level_xref_failed",
                                    articleId: firstLevelArt.articleId,
                                    error: err,
                                });
                            }
                        }

                        // 4. Enrichissement des détails (getArticleDetail) pour l'article principal et 
                        // les premiers articles de chaque équipementier pour sauvegarder les numéros OEM
                        await getArticleDetail(mainArt.articleId);

                        // Grouper par équipementier et prendre au plus 2 articles par équipementier
                        const bySupplier = new Map<number, number[]>();
                        for (const item of allDiscovered) {
                            if (item.articleId && item.articleId > 0 && item.articleId !== mainArt.articleId) {
                                const list = bySupplier.get(item.supplierId) ?? [];
                                if (list.length < 2 && !list.includes(item.articleId)) {
                                    list.push(item.articleId);
                                    bySupplier.set(item.supplierId, list);
                                }
                            }
                        }

                        const articleIdsToEnrich = [...bySupplier.values()].flat();
                        for (const artId of articleIdsToEnrich) {
                            await getArticleDetail(artId);
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

