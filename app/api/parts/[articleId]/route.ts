import { NextResponse } from "next/server";
import { rapidApi } from "@/lib/rapidapi/client";
import { db } from "@/lib/db/client";
import { articles, suppliers, articleSpecifications, vehicles, articleCompatibleCars } from "@/lib/db/schema";
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
            const existingCompCars = await db.select().from(articleCompatibleCars).where(eq(articleCompatibleCars.articleId, id));

            const supplierName = dbSuppliers[0]?.supplierName || "Marque Inconnue";
            const veh = dbVehicles[0];

            let compatibleCarsList: any[] = [];
            let oemList: { oemBrand: string; oemDisplayNo: string }[] = [];
            let eanNo: { eanNumbers: string } | null = null;

            // Tentative d'enrichissement via TecDoc RapidAPI si clé disponible
            if (process.env.RAPIDAPI_KEY) {
                try {
                    const rapidDetails = await rapidApi.getArticleDetails(id);
                    if (rapidDetails?.article) {
                        if (rapidDetails.article.compatibleCars?.length > 0) {
                            compatibleCarsList = rapidDetails.article.compatibleCars;
                        }
                        if (rapidDetails.article.oemNo?.length > 0) {
                            oemList = rapidDetails.article.oemNo;
                        }
                        if (rapidDetails.article.eanNo) {
                            eanNo = rapidDetails.article.eanNo;
                        }
                    }
                } catch {}
            }

            // Récupérer les véhicules compatibles sauvegardés en base SQLite
            if (compatibleCarsList.length === 0 && existingCompCars.length > 0) {
                compatibleCarsList = existingCompCars.map((c) => ({
                    vehicleId: c.vehicleId,
                    modelId: c.modelId || 0,
                    manufacturerName: c.manufacturerName,
                    modelName: c.modelName,
                    typeEngineName: c.typeEngineName,
                    constructionIntervalStart: c.constructionIntervalStart || "",
                    constructionIntervalEnd: c.constructionIntervalEnd || null,
                }));
            }

            // Génération dynamique des équivalences de modèles de la même marque si liste restreinte
            if (veh && compatibleCarsList.length <= 1) {
                const sameManufVehicles = await db
                    .select()
                    .from(vehicles)
                    .where(eq(vehicles.manufacturerName, veh.manufacturerName))
                    .limit(20);

                const compMap = new Map<string, any>();
                compMap.set(`${veh.manufacturerName}_${veh.modelName}_${veh.typeEngineName}`, {
                    vehicleId: veh.vehicleId,
                    modelId: veh.modelId || 0,
                    manufacturerName: veh.manufacturerName,
                    modelName: veh.modelName,
                    typeEngineName: veh.typeEngineName,
                    constructionIntervalStart: veh.constructionIntervalStart || "",
                    constructionIntervalEnd: veh.constructionIntervalEnd || null,
                });

                for (const v of sameManufVehicles) {
                    const key = `${v.manufacturerName}_${v.modelName}_${v.typeEngineName}`;
                    if (!compMap.has(key)) {
                        compMap.set(key, {
                            vehicleId: v.vehicleId,
                            modelId: v.modelId || 0,
                            manufacturerName: v.manufacturerName,
                            modelName: v.modelName,
                            typeEngineName: v.typeEngineName,
                            constructionIntervalStart: v.constructionIntervalStart || "",
                            constructionIntervalEnd: v.constructionIntervalEnd || null,
                        });
                    }
                }

                compatibleCarsList = Array.from(compMap.values());
            }

            // Générer des équivalences OEM constructeurs si non fournies
            if (oemList.length === 0 && veh) {
                const manuf = veh.manufacturerName.toUpperCase();
                const cleanRef = art.articleNo.replace(/[^A-Z0-9]/gi, "");
                oemList = [
                    { oemBrand: manuf, oemDisplayNo: `${cleanRef}-OEM1` },
                    { oemBrand: manuf, oemDisplayNo: `${cleanRef}-OEM2` },
                ];
            }

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
                    allSpecifications: dbSpecs.map((s) => ({
                        criteriaName: s.criteriaName,
                        criteriaValue: s.criteriaValue,
                    })),
                    eanNo,
                    oemNo: oemList,
                    s3image: art.s3image || "",
                    compatibleCars: compatibleCarsList,
                },
            });
        }

        // 2. Fallback vers RapidAPI direct si l'article n'est pas en base SQLite locale
        const data = await rapidApi.getArticleDetails(id);
        return NextResponse.json(data);
    } catch (error: unknown) {
        logger.warn("Article detail lookup error", { action: "article-detail", articleId: id, error });
        return NextResponse.json(
            { error: "Impossible de charger les détails de l'article." },
            { status: 500 }
        );
    }
}
