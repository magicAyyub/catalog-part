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
    const candidateLimit = Math.max(limit * 10, 200);

    // 1. Recherche directe par articleNo ou eanNumber (exacte puis partielle)
    const directRows = await db
        .select({ articleId: articles.articleId })
        .from(articles)
        .where(
            or(
                sql`${cleanedArticleNoSql} = ${cleaned}`,
                sql`${cleanedEanSql} = ${cleaned}`,
                sql`${cleanedArticleNoSql} LIKE ${searchPattern}`,
                sql`${cleanedEanSql} LIKE ${searchPattern}`
            )
        )
        .limit(candidateLimit);

    const candidateIds = new Set<number>(directRows.map((r) => r.articleId));

    // 2. Recherche par WVA dans articleCriteria
    const cleanedCriteriaValueSql = sql`UPPER(REPLACE(REPLACE(REPLACE(${articleCriteria.value}, ' ', ''), '-', ''), '.', ''))`;
    const wvaRows = await db
        .select({ articleId: articleCriteria.articleId })
        .from(articleCriteria)
        .where(sql`${cleanedCriteriaValueSql} LIKE ${searchPattern}`)
        .limit(candidateLimit);

    for (const r of wvaRows) {
        candidateIds.add(r.articleId);
    }

    // 3. Recherche par numéro OEM dans articleOemNumbers
    const oemRows = await db
        .select({ articleId: articleOemNumbers.articleId })
        .from(articleOemNumbers)
        .where(like(articleOemNumbers.cleanedNo, searchPattern))
        .limit(candidateLimit);

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

    // Évaluation multi-niveaux du score de pertinence
    const scoredArticles = fullRows
        .map((row) => {
            const normArticleNo = normalizeReference(row.articleNo);
            const normEan = row.eanNumber ? normalizeReference(row.eanNumber) : "";
            const rowCriteria = groupedCriteria.get(row.articleId) ?? [];
            const rowOems = groupedOem.get(row.articleId) ?? [];

            const wvaValues = rowCriteria.map((c) => normalizeReference(c.value));
            const oemValues = rowOems.map((o) => normalizeReference(o));

            let score = 0;

            // Tier 1 : Égalité stricte (1000 pts base)
            if (normArticleNo === cleaned) {
                score = 1200; // Exact match articleNo
            } else if (normEan === cleaned) {
                score = 1180; // Exact match EAN
            } else if (oemValues.includes(cleaned)) {
                score = 1150; // Exact match OEM
            } else if (wvaValues.includes(cleaned)) {
                score = 1140; // Exact match WVA
            }
            // Tier 2 : Début de chaîne (500 pts base)
            else if (
                normArticleNo.startsWith(cleaned) ||
                normEan.startsWith(cleaned) ||
                wvaValues.some((v) => v.startsWith(cleaned)) ||
                oemValues.some((v) => v.startsWith(cleaned))
            ) {
                score = 500;
            }
            // Tier 3 : Contient la sous-chaîne (100 pts base)
            else if (
                normArticleNo.includes(cleaned) ||
                normEan.includes(cleaned) ||
                wvaValues.some((v) => v.includes(cleaned)) ||
                oemValues.some((v) => v.includes(cleaned))
            ) {
                score = 100;
            }

            // Éliminer tout article sans correspondance réelle
            if (score === 0) return null;

            // Bonus d'écart de longueur (jusqu'à +50 pts pour les références plus proches de la taille saisie)
            const lengthDiff = Math.abs(normArticleNo.length - cleaned.length);
            score += Math.max(0, 50 - lengthDiff);

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

            return { article, score, normArticleNo };
        })
        .filter((item): item is { article: SearchResultArticle; score: number; normArticleNo: string } => Boolean(item));

    // Trier par score de pertinence décroissant, puis par longueur de référence croissante
    scoredArticles.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.normArticleNo.length - b.normArticleNo.length;
    });

    return scoredArticles.slice(0, limit).map((item) => item.article);
}
