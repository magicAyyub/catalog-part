import { eq } from "drizzle-orm";
import { rapidApi } from "@/lib/rapidapi/client";
import { db, type Tx } from "@/lib/db/client";
import { ALLOWED_CATEGORY_IDS, ALLOWED_SUPPLIER_IDS } from "@/lib/config";
import {
    articleCriteria,
    articles,
    catalogSync,
    fitments,
    suppliers,
    vehicles,
} from "@/lib/db/schema";
import {
    findArticle,
    isCategorySynced,
    listVehicleArticles,
    type ArticleDetail,
    type CatalogArticle,
} from "@/lib/db/queries/catalog";
import { chunked } from "@/lib/acquisition/chunk";
import { logger } from "@/lib/logger";
import type { ApiArticleListItem, ApiCompatibleCar } from "@/lib/rapidapi/types";

interface CriteriaRow {
    articleId: number;
    name: string;
    value: string;
    type: string;
}

/**
 * Acquisition du catalogue pièces, dans les deux sens.
 *
 * Par véhicule à la demande, ce qui rend l'application utilisable tout de suite.
 * Par article ensuite : chaque fiche ouverte livre la centaine de véhicules que
 * la référence équipe, et ces compatibilités sont conservées. La base se remplit
 * donc à l'usage, sans remplissage initial.
 *
 * L'appel réseau précède toujours la transaction, le driver interdisant
 * d'attendre une promesse à l'intérieur.
 */

/**
 * Articles d'un véhicule pour une catégorie, acquis au premier passage.
 *
 * `vehicleIfMissing` sert la recherche par plaque, qui arrive avec un
 * identifiant fournisseur et aucune fiche en base. La fiche n'est écrite que
 * si TecDoc rend au moins un article : c'est la preuve que cet identifiant est
 * bien un `vehicleId`, et elle ne coûte pas un appel de plus puisque c'est
 * celui que la catégorie aurait payé de toute façon.
 */
export async function getVehicleArticles(
    vehicleId: number,
    categoryId: number,
    vehicleIfMissing?: typeof vehicles.$inferInsert
): Promise<CatalogArticle[]> {
    if (!ALLOWED_CATEGORY_IDS.has(categoryId)) return [];
    if (await isCategorySynced(vehicleId, categoryId)) {
        return listVehicleArticles(vehicleId, categoryId);
    }

    // TecDoc rend `null`, et pas un tableau vide, sur un vehicleId qu'il ignore.
    const fetched = (await rapidApi.listArticles(vehicleId, categoryId)).articles ?? [];

    // Véhicule inconnu et catalogue muet : on ne laisse aucune trace, sans quoi
    // un mauvais identifiant s'installerait dans le référentiel.
    if (vehicleIfMissing && fetched.length === 0) return [];

    const kept = fetched.filter((a) => ALLOWED_SUPPLIER_IDS.has(a.supplierId));
    const criteria = await fetchCriteria(vehicleId, kept);

    db.transaction((tx) => {
        if (vehicleIfMissing) {
            tx.insert(vehicles).values(vehicleIfMissing).onConflictDoNothing().run();
        }

        insertSuppliers(
            tx,
            kept.map((a) => ({ supplierId: a.supplierId, name: a.supplierName }))
        );

        for (const rows of chunked(kept)) {
            tx.insert(articles)
                .values(
                    rows.map((a) => ({
                        articleId: a.articleId,
                        articleNo: a.articleNo,
                        supplierId: a.supplierId,
                        productId: a.productId,
                        productName: a.articleProductName,
                        mediaType: a.articleMediaType,
                        mediaFileName: a.articleMediaFileName,
                        imageUrl: a.s3image,
                    }))
                )
                .onConflictDoNothing()
                .run();
        }

        insertFitments(
            tx,
            kept.map((a) => ({ vehicleId, articleId: a.articleId, categoryId }))
        );

        for (const rows of chunked(criteria)) {
            tx.insert(articleCriteria).values(rows).onConflictDoNothing().run();
        }

        tx.insert(catalogSync)
            .values({ vehicleId, categoryId, articleCount: kept.length, syncedAt: new Date() })
            .onConflictDoUpdate({
                target: [catalogSync.vehicleId, catalogSync.categoryId],
                set: { articleCount: kept.length, syncedAt: new Date() },
            })
            .run();
    });

    logger.info("Catalog acquired for vehicle", {
        module: "acquisition",
        action: "vehicle_articles",
        vehicleId,
        categoryId,
        fetched: fetched.length,
        kept: kept.length,
        criteriaRows: criteria.length,
    });

    return listVehicleArticles(vehicleId, categoryId);
}

/**
 * Fiche complète d'une référence, enrichie une seule fois.
 *
 * L'appel rend les critères, l'EAN et les véhicules compatibles. Ces derniers
 * sont rattachés à la catégorie dans laquelle la référence a été découverte :
 * une plaquette reste une plaquette quel que soit le véhicule.
 */
export async function getArticleDetail(articleId: number): Promise<ArticleDetail | null> {
    const known = await findArticle(articleId);
    if (!known || known.detailsFetchedAt) return known;

    const categoryIds = await articleCategories(articleId);
    // Les critères du véhicule priment : ils sont contextuels et typés, là où
    // `allSpecifications` est la fiche générique de l'article. Mélanger les deux
    // ferait cohabiter deux vocabulaires pour la même caractéristique.
    const hasVehicleCriteria = known.criteria.length > 0;

    try {
        const { article } = await rapidApi.getArticleDetails(articleId);

        db.transaction((tx) => {
            if (!hasVehicleCriteria) {
                for (const rows of chunked(article.allSpecifications)) {
                    tx.insert(articleCriteria)
                        .values(
                            rows.map((spec) => ({
                                articleId,
                                name: spec.criteriaName,
                                value: spec.criteriaValue,
                                type: null,
                            }))
                        )
                        .onConflictDoNothing()
                        .run();
                }
            }

            insertCompatibleVehicles(tx, article.compatibleCars);
            insertFitments(
                tx,
                article.compatibleCars.flatMap((car) =>
                    categoryIds.map((categoryId) => ({
                        vehicleId: car.vehicleId,
                        articleId,
                        categoryId,
                    }))
                )
            );

            tx.update(articles)
                .set({
                    eanNumber: article.eanNo?.eanNumbers ?? null,
                    detailsFetchedAt: new Date(),
                })
                .where(eq(articles.articleId, articleId))
                .run();
        });

        logger.info("Article details acquired", {
            module: "acquisition",
            action: "article_details",
            articleId,
            compatibleCars: article.compatibleCars.length,
        });
    } catch (error) {
        // Enrichissement facultatif : la fiche reste affichable avec ce que la
        // base contient déjà, et la prochaine ouverture réessaiera.
        logger.warn("Article details enrichment failed", {
            module: "acquisition",
            action: "article_details",
            articleId,
            error,
        });
    }

    return findArticle(articleId);
}

/**
 * Critères techniques de toute la liste, en un appel par couple article
 * générique / équipementier.
 *
 * Une catégorie n'ayant en pratique qu'un seul `productId`, cela revient à un
 * appel par équipementier autorisé, et chaque réponse couvre tous les articles
 * du couple. La réponse déborde sur des articles qu'on n'affiche pas : les
 * garder exposerait un filtre ne correspondant à aucune pièce à l'écran.
 *
 * Un échec est journalisé et n'interrompt pas l'acquisition : une pièce sans
 * critère reste affichable.
 */
async function fetchCriteria(
    vehicleId: number,
    keptArticles: ApiArticleListItem[]
): Promise<CriteriaRow[]> {
    const keptIds = new Set(keptArticles.map((a) => a.articleId));
    const pairs = new Map<string, { productId: number; supplierId: number }>();

    for (const article of keptArticles) {
        if (!article.productId) continue;
        pairs.set(`${article.productId}:${article.supplierId}`, {
            productId: article.productId,
            supplierId: article.supplierId,
        });
    }

    const rows = new Map<string, CriteriaRow>();

    for (const { productId, supplierId } of pairs.values()) {
        try {
            const res = await rapidApi.getSparePartCriteria(productId, vehicleId, supplierId);
            for (const row of res?.articles ?? []) {
                if (!keptIds.has(row.articleId)) continue;
                rows.set(`${row.articleId}|${row.criteriaName}|${row.criteriaValue}`, {
                    articleId: row.articleId,
                    name: row.criteriaName,
                    value: row.criteriaValue,
                    type: row.type,
                });
            }
        } catch (error) {
            logger.warn("Spare part criteria lookup failed", {
                module: "acquisition",
                action: "criteria_error",
                vehicleId,
                productId,
                supplierId,
                error,
            });
        }
    }

    return [...rows.values()];
}

async function articleCategories(articleId: number): Promise<number[]> {
    const rows = await db
        .selectDistinct({ categoryId: fitments.categoryId })
        .from(fitments)
        .where(eq(fitments.articleId, articleId));
    return rows.map((r) => r.categoryId);
}

function insertSuppliers(tx: Tx, rows: { supplierId: number; name: string }[]): void {
    const unique = [...new Map(rows.map((s) => [s.supplierId, s])).values()];
    for (const batch of chunked(unique)) {
        tx.insert(suppliers).values(batch).onConflictDoNothing().run();
    }
}

function insertFitments(
    tx: Tx,
    rows: { vehicleId: number; articleId: number; categoryId: number }[]
): void {
    for (const batch of chunked(rows)) {
        tx.insert(fitments).values(batch).onConflictDoNothing().run();
    }
}

/** Les véhicules compatibles n'ont que sept champs : on ne remplace jamais une fiche de cascade. */
function insertCompatibleVehicles(tx: Tx, cars: ApiCompatibleCar[]): void {
    for (const batch of chunked(cars)) {
        tx.insert(vehicles)
            .values(
                batch.map((car) => ({
                    vehicleId: car.vehicleId,
                    modelId: car.modelId,
                    manufacturerName: car.manufacturerName,
                    modelName: car.modelName,
                    typeEngineName: car.typeEngineName,
                    constructionIntervalStart: car.constructionIntervalStart,
                    constructionIntervalEnd: car.constructionIntervalEnd,
                }))
            )
            .onConflictDoNothing()
            .run();
    }
}
