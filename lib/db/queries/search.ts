import { like, or, eq, inArray, asc, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { articleCriteria, articleOemNumbers, articles, suppliers } from "@/lib/db/schema";
import type { CatalogArticle, Criteria } from "./catalog";

export interface SearchResultArticle extends CatalogArticle {
    categoryName?: string;
}

export function normalizeReference(raw: string): string {
    return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
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

export async function searchArticlesByReference(
    query: string,
    limit: number = 20
): Promise<SearchResultArticle[]> {
    const cleaned = normalizeReference(query);
    if (cleaned.length < 3) return [];

    const searchPattern = `%${cleaned}%`;

    // sql expression pour enlever espaces, tirets et points de article_no dans SQLite
    const cleanedArticleNoSql = sql`UPPER(REPLACE(REPLACE(REPLACE(${articles.articleNo}, ' ', ''), '-', ''), '.', ''))`;

    const directRows = await db
        .select({ articleId: articles.articleId })
        .from(articles)
        .where(
            or(
                sql`${cleanedArticleNoSql} LIKE ${searchPattern}`,
                like(articles.eanNumber, searchPattern)
            )
        )
        .limit(limit);

    const articleIdSet = new Set<number>(directRows.map((r) => r.articleId));

    // 2. Recherche par WVA dans articleCriteria si la limite n'est pas atteinte
    if (articleIdSet.size < limit) {
        const wvaRows = await db
            .select({ articleId: articleCriteria.articleId })
            .from(articleCriteria)
            .where(
                or(
                    like(articleCriteria.name, "%WVA%"),
                    like(articleCriteria.name, "%wva%")
                )
            )
            .limit(limit * 2);

        for (const r of wvaRows) {
            articleIdSet.add(r.articleId);
            if (articleIdSet.size >= limit) break;
        }
    }

    // 3. Recherche par numéro OEM s'il en manque encore
    if (articleIdSet.size < limit) {
        const oemRows = await db
            .select({ articleId: articleOemNumbers.articleId })
            .from(articleOemNumbers)
            .where(like(articleOemNumbers.cleanedNo, searchPattern))
            .limit(limit);

        for (const r of oemRows) {
            articleIdSet.add(r.articleId);
            if (articleIdSet.size >= limit) break;
        }
    }

    const matchingIds = Array.from(articleIdSet).slice(0, limit);
    if (matchingIds.length === 0) return [];

    const fullRows = await db
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
        .from(articles)
        .leftJoin(suppliers, eq(articles.supplierId, suppliers.supplierId))
        .where(inArray(articles.articleId, matchingIds))
        .orderBy(asc(articles.articleNo));

    const groupedCriteria = await criteriaByArticle(matchingIds);

    return fullRows.map((row) => ({
        ...row,
        criteria: groupedCriteria.get(row.articleId) ?? [],
    }));
}
