import { like, or, eq, inArray, asc, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { articleCriteria, articleOemNumbers, articles, suppliers } from "@/lib/db/schema";
import { isEtfSupplier } from "@/lib/parts/suppliers";
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

async function oemByArticle(articleIds: number[]): Promise<Map<number, string[]>> {
    const grouped = new Map<number, string[]>();
    if (articleIds.length === 0) return grouped;

    const rows = await db
        .select({ articleId: articleOemNumbers.articleId, cleanedNo: articleOemNumbers.cleanedNo })
        .from(articleOemNumbers)
        .where(inArray(articleOemNumbers.articleId, articleIds));

    for (const row of rows) {
        const list = grouped.get(row.articleId) ?? [];
        list.push(row.cleanedNo);
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
    const cleanedArticleNoSql = sql`UPPER(REPLACE(REPLACE(REPLACE(${articles.articleNo}, ' ', ''), '-', ''), '.', ''))`;
    const cleanedEanSql = sql`UPPER(REPLACE(REPLACE(REPLACE(COALESCE(${articles.eanNumber}, ''), ' ', ''), '-', ''), '.', ''))`;

    // 1. Recherche directe par articleNo ou eanNumber
    const directRows = await db
        .select({ articleId: articles.articleId })
        .from(articles)
        .where(
            or(
                sql`${cleanedArticleNoSql} LIKE ${searchPattern}`,
                sql`${cleanedEanSql} LIKE ${searchPattern}`
            )
        )
        .limit(limit * 3);

    const candidateIds = new Set<number>(directRows.map((r) => r.articleId));

    // 2. Recherche par WVA dans articleCriteria (filtrage strict sur la VALEUR)
    const cleanedCriteriaValueSql = sql`UPPER(REPLACE(REPLACE(REPLACE(${articleCriteria.value}, ' ', ''), '-', ''), '.', ''))`;
    const wvaRows = await db
        .select({ articleId: articleCriteria.articleId })
        .from(articleCriteria)
        .where(sql`${cleanedCriteriaValueSql} LIKE ${searchPattern}`)
        .limit(limit * 3);

    for (const r of wvaRows) {
        candidateIds.add(r.articleId);
    }

    // 3. Recherche par numéro OEM dans articleOemNumbers
    const oemRows = await db
        .select({ articleId: articleOemNumbers.articleId })
        .from(articleOemNumbers)
        .where(like(articleOemNumbers.cleanedNo, searchPattern))
        .limit(limit * 3);

    for (const r of oemRows) {
        candidateIds.add(r.articleId);
    }

    if (candidateIds.size === 0) return [];

    const allCandidateIds = Array.from(candidateIds);
    const fullRows = await db
        .select({
            articleId: articles.articleId,
            articleNo: articles.articleNo,
            eanNumber: articles.eanNumber,
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
        .where(inArray(articles.articleId, allCandidateIds));

    const groupedCriteria = await criteriaByArticle(allCandidateIds);
    const groupedOem = await oemByArticle(allCandidateIds);

    // Évaluation du score de pertinence pour chaque article candidat
    const scoredArticles = fullRows
        .map((row) => {
            const normArticleNo = normalizeReference(row.articleNo);
            const normEan = row.eanNumber ? normalizeReference(row.eanNumber) : "";
            const rowCriteria = groupedCriteria.get(row.articleId) ?? [];
            const rowOems = groupedOem.get(row.articleId) ?? [];

            const wvaValues = rowCriteria.map((c) => normalizeReference(c.value));
            const oemValues = rowOems.map((o) => normalizeReference(o));

            let score = 0;

            // Égalité stricte (100 points)
            if (
                normArticleNo === cleaned ||
                normEan === cleaned ||
                wvaValues.includes(cleaned) ||
                oemValues.includes(cleaned)
            ) {
                score = 100;
            }
            // Début de chaîne (75 points)
            else if (
                normArticleNo.startsWith(cleaned) ||
                normEan.startsWith(cleaned) ||
                wvaValues.some((v) => v.startsWith(cleaned)) ||
                oemValues.some((v) => v.startsWith(cleaned))
            ) {
                score = 75;
            }
            // Contient la sous-chaîne (50 points)
            else if (
                normArticleNo.includes(cleaned) ||
                normEan.includes(cleaned) ||
                wvaValues.some((v) => v.includes(cleaned)) ||
                oemValues.some((v) => v.includes(cleaned))
            ) {
                score = 50;
            }

            // Éliminer tout article sans correspondance réelle
            if (score === 0) return null;

            // Bonus marque partenaire ETF (+10 points)
            if (isEtfSupplier(row.supplierId, row.supplierName)) {
                score += 10;
            }

            const { eanNumber, ...baseArticle } = row;
            void eanNumber;

            const article: SearchResultArticle = {
                ...baseArticle,
                criteria: rowCriteria,
            };

            return { article, score };
        })
        .filter((item): item is { article: SearchResultArticle; score: number } => Boolean(item));

    // Trier par score de pertinence décroissant
    scoredArticles.sort((a, b) => b.score - a.score);

    return scoredArticles.slice(0, limit).map((item) => item.article);
}
