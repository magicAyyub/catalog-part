import { NextResponse } from "next/server";
import { rapidApi } from "@/lib/rapidapi/client";
import { db } from "@/lib/db/client";
import { articles, suppliers, articleSpecifications, vehicles } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { eq } from "drizzle-orm";

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
        // 1. Chercher dans la base SQLite locale
        const dbArticles = await db.select().from(articles).where(eq(articles.articleId, id)).limit(1);

        if (dbArticles.length > 0) {
            const art = dbArticles[0];
            const dbSuppliers = await db.select().from(suppliers).where(eq(suppliers.supplierId, art.supplierId)).limit(1);
            const dbSpecs = await db.select().from(articleSpecifications).where(eq(articleSpecifications.articleId, id));
            const dbVehicles = await db.select().from(vehicles).where(eq(vehicles.vehicleId, art.vehicleId)).limit(1);

            const supplierName = dbSuppliers[0]?.supplierName || "Marque Inconnue";
            const veh = dbVehicles[0];

            return NextResponse.json({
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
                    allSpecifications: dbSpecs.map((s) => ({
                        criteriaName: s.criteriaName,
                        criteriaValue: s.criteriaValue,
                    })),
                    eanNo: null,
                    oemNo: [],
                    s3image: art.s3image || "",
                    compatibleCars: veh ? [{
                        vehicleId: veh.vehicleId,
                        modelId: veh.modelId || 0,
                        manufacturerName: veh.manufacturerName,
                        modelName: veh.modelName,
                        typeEngineName: veh.typeEngineName,
                        constructionIntervalStart: "",
                        constructionIntervalEnd: null,
                    }] : [],
                },
            });
        }

        // 2. Fallback vers l'API RapidAPI si non trouvé en base SQLite locale
        const data = await rapidApi.getArticleDetails(id);
        return NextResponse.json(data);
    } catch (error: unknown) {
        logger.warn("Article detail lookup fallback error", { action: "article-detail", articleId: id, error });
        return NextResponse.json(
            { error: "Impossible de charger les détails de l'article." },
            { status: 500 }
        );
    }
}
