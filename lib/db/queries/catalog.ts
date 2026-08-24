import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { articleCriteria, articles, catalogSync, fitments, suppliers, vehicles } from "@/lib/db/schema";
import type { Vehicle } from "@/lib/db/queries/vehicles";

/**
 * Lecture du catalogue pièces. Aucun appel réseau : ce qui manque en base
 * signifie que l'acquisition n'a pas encore eu lieu, ce que dit `isCategorySynced`.
 */

export interface Criteria {
    name: string;
    value: string;
    type: string | null;
}

export interface CatalogArticle {
    articleId: number;
    articleNo: string;
    productId: number | null;
    productName: string | null;
    supplierId: number;
    supplierName: string | null;
    mediaType: string | null;
    mediaFileName: string | null;
    imageUrl: string | null;
    criteria: Criteria[];
}

async function criteriaByArticle(articleIds: number[]): Promise<Map<number, Criteria[]>> {
    const grouped = new Map<number, Criteria[]>();
    if (articleIds.length === 0) return grouped;

    const rows = await db
        .select()
        .from(articleCriteria)
        .where(inArray(articleCriteria.articleId, articleIds))
        .orderBy(asc(articleCriteria.name));

    for (const row of rows) {
        const list = grouped.get(row.articleId) ?? [];
        list.push({ name: row.name, value: row.value, type: row.type });
        grouped.set(row.articleId, list);
    }
    return grouped;
}

/** Pièces compatibles avec un véhicule pour une catégorie. */
export async function listVehicleArticles(
    vehicleId: number,
    categoryId: number
): Promise<CatalogArticle[]> {
    const rows = await db
        .select({
            articleId: articles.articleId,
            articleNo: articles.articleNo,
            productId: articles.productId,
            productName: articles.productName,
            supplierId: articles.supplierId,
            supplierName: suppliers.name,
            mediaType: articles.mediaType,
            mediaFileName: articles.mediaFileName,
            imageUrl: articles.imageUrl,
        })
        .from(fitments)
        .innerJoin(articles, eq(fitments.articleId, articles.articleId))
        .leftJoin(suppliers, eq(articles.supplierId, suppliers.supplierId))
        .where(and(eq(fitments.vehicleId, vehicleId), eq(fitments.categoryId, categoryId)))
        .orderBy(asc(articles.articleNo));

    const grouped = await criteriaByArticle(rows.map((r) => r.articleId));
    return rows.map((row) => ({ ...row, criteria: grouped.get(row.articleId) ?? [] }));
}

export interface ArticleDetail extends CatalogArticle {
    eanNumber: string | null;
    detailsFetchedAt: Date | null;
}

export async function findArticle(articleId: number): Promise<ArticleDetail | null> {
    const [row] = await db
        .select({
            articleId: articles.articleId,
            articleNo: articles.articleNo,
            productId: articles.productId,
            productName: articles.productName,
            supplierId: articles.supplierId,
            supplierName: suppliers.name,
            mediaType: articles.mediaType,
            mediaFileName: articles.mediaFileName,
            imageUrl: articles.imageUrl,
            eanNumber: articles.eanNumber,
            detailsFetchedAt: articles.detailsFetchedAt,
        })
        .from(articles)
        .leftJoin(suppliers, eq(articles.supplierId, suppliers.supplierId))
        .where(eq(articles.articleId, articleId))
        .limit(1);

    if (!row) return null;

    const grouped = await criteriaByArticle([articleId]);
    return { ...row, criteria: grouped.get(articleId) ?? [] };
}

/** Véhicules qu'une référence équipe, alimenté par les fiches article déjà ouvertes. */
export async function listArticleVehicles(articleId: number): Promise<Vehicle[]> {
    const rows = await db
        .select({ vehicle: vehicles })
        .from(fitments)
        .innerJoin(vehicles, eq(fitments.vehicleId, vehicles.vehicleId))
        .where(eq(fitments.articleId, articleId))
        .orderBy(asc(vehicles.manufacturerName), asc(vehicles.modelName));
    return rows.map((r) => r.vehicle);
}

/**
 * Distingue « aucune pièce pour ce véhicule » de « pas encore interrogé ».
 * Sans ça, une catégorie vide déclencherait un appel à chaque affichage.
 */
export async function isCategorySynced(vehicleId: number, categoryId: number): Promise<boolean> {
    const [row] = await db
        .select({ vehicleId: catalogSync.vehicleId })
        .from(catalogSync)
        .where(and(eq(catalogSync.vehicleId, vehicleId), eq(catalogSync.categoryId, categoryId)))
        .limit(1);
    return Boolean(row);
}
