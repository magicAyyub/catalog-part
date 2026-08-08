import { NextResponse } from "next/server";
import { rapidApi } from "@/lib/rapidapi/client";
import { getWithCompressedCache } from "@/lib/vehicle/api-cache";
import { db } from "@/lib/db/client";
import { articles, suppliers, articleSpecifications } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { eq } from "drizzle-orm";
import type { ApiArticleDetails } from "@/lib/rapidapi/types";

/**
 * GET /api/parts/[articleId]
 *
 * Part detail, built from two sources: the local database for price, stock and
 * already synchronized criteria, with no network call, and
 * `article-complete-details` for OEM references, EAN codes and compatible
 * vehicles, which the sync does not bring back.
 *
 * The second is cached permanently and compressed. The data is immutable, the
 * OEM references of a BOSCH part do not change, the response weighs about
 * 274 KB, and one reference recurs across dozens of vehicles. Without that
 * cache, every click on the detail button cost a billed call.
 */
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

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ articleId: string }> }
) {
    const { articleId } = await params;
    const id = Number(articleId);

    if (!id) {
        return NextResponse.json({ error: "articleId invalide" }, { status: 400 });
    }

    try {
        const [art] = await db.select().from(articles).where(eq(articles.articleId, id)).limit(1);

        // Article inconnu localement : on sert la fiche TecDoc telle quelle.
        if (!art) {
            const data = await fetchArticleDetails(id);
            if (!data) {
                return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
            }
            return NextResponse.json(data);
        }

        const [supplier] = await db
            .select()
            .from(suppliers)
            .where(eq(suppliers.supplierId, art.supplierId))
            .limit(1);
        const dbSpecs = await db
            .select()
            .from(articleSpecifications)
            .where(eq(articleSpecifications.articleId, id));

        const supplierName = supplier?.supplierName || "Marque inconnue";
        const details = await fetchArticleDetails(id);
        const remote = details?.article;

        /**
         * Nothing is invented here. The previous version fabricated two OEM
         * references (`<REF>-OEM1`, `<REF>-OEM2`) and up to 20 compatible
         * vehicles taken from same-brand vehicles in the database whenever
         * TecDoc did not answer. That was shown to customers as manufacturer
         * data, and caching it permanently would have frozen the lie. An empty
         * field hides itself in the drawer.
         */
        return NextResponse.json({
            article: {
                articleId: art.articleId,
                articleNo: art.articleNo,
                articleProductName: art.articleProductName,
                supplierName,
                supplierId: art.supplierId,
                articleMediaType: art.articleMediaType || "",
                articleMediaFileName: art.articleMediaFileName || "",
                priceNet: art.priceNet,
                priceBase: art.priceBase,
                discountLabel: art.discountLabel,
                inStock: art.inStock,
                stockLabel: art.stockLabel,
                articleInfo: {
                    articleId: art.articleId,
                    articleNo: art.articleNo,
                    supplierId: art.supplierId,
                    supplierName,
                    isAccessory: 0,
                    articleProductName: art.articleProductName,
                },
                // Les caractéristiques locales viennent de la synchronisation
                // des critères ; repli sur la fiche TecDoc si la synchronisation
                // n'a rien trouvé pour cet article.
                allSpecifications:
                    dbSpecs.length > 0
                        ? dbSpecs.map((s) => ({
                              criteriaName: s.criteriaName,
                              criteriaValue: s.criteriaValue,
                          }))
                        : remote?.allSpecifications ?? [],
                eanNo: remote?.eanNo ?? null,
                oemNo: remote?.oemNo ?? [],
                s3image: art.s3image || remote?.s3image || "",
                compatibleCars: remote?.compatibleCars ?? [],
            },
        });
    } catch (error: unknown) {
        logger.warn("Article detail lookup error", { action: "article-detail", articleId: id, error });
        return NextResponse.json(
            { error: "Impossible de charger les détails de l'article." },
            { status: 500 }
        );
    }
}