import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { articles, suppliers, articleSpecifications } from "@/lib/db/schema";
import { searchByPlate } from "@/lib/suppliers/preference";
import { getTecDocSpecsForRef } from "@/lib/catalog/tecdoc-specs";
import { eq, and, inArray } from "drizzle-orm";

async function persistProducts(vehicleId: number, products: any[]) {
    for (let i = 0; i < products.length; i++) {
        const p = products[i];
        const brandName = p.brandDisplay || p.brand || p.brandKey || "Marque Inconnue";
        let supplierId = 1000;
        for (let j = 0; j < brandName.length; j++) {
            supplierId = (supplierId << 5) - supplierId + brandName.charCodeAt(j);
            supplierId |= 0;
        }
        supplierId = Math.abs(supplierId) % 900000 + 10000;

        await db.insert(suppliers).values({
            supplierId,
            supplierName: brandName,
            supplierMatchCode: brandName,
            supplierLogoName: null,
            s3image: null,
        }).onConflictDoNothing();

        const isDisque = p.productType === "disque";
        const categoryId = isDisque ? 100032 : 100030;
        const articleNo = p.refDisplay || p.reference || p.refKey || `ART-${i}`;
        const articleId = vehicleId * 10000 + (isDisque ? 5000 : 0) + i + 1;
        const imageUrl = p.imageUrl || p.catalog?.imageUrl || p.prices?.preference?.raw?.imageUrl || null;

        const priceNet = typeof p.priceNet === "number" ? p.priceNet : null;
        const priceBase = typeof p.priceBase === "number" ? p.priceBase : null;
        const discountLabel = p.discountLabel || null;
        const inStock = typeof p.inStock === "boolean" ? p.inStock : null;
        const stockLabel = p.stockLabel || null;

        await db.insert(articles).values({
            articleId,
            vehicleId,
            categoryId,
            articleNo,
            articleProductName: `${brandName} ${articleNo}`,
            productId: categoryId,
            supplierId,
            articleMediaType: imageUrl ? "image/jpeg" : null,
            articleMediaFileName: null,
            s3image: imageUrl,
            priceNet,
            priceBase,
            discountLabel,
            inStock,
            stockLabel,
        }).onConflictDoUpdate({
            target: [articles.articleId, articles.vehicleId, articles.categoryId],
            set: {
                articleNo,
                supplierId,
                s3image: imageUrl,
                priceNet,
                priceBase,
                discountLabel,
                inStock,
                stockLabel,
            },
        });

        await db.delete(articleSpecifications).where(eq(articleSpecifications.articleId, articleId));

        const specEntries: { criteriaName: string; criteriaValue: string }[] = [];
        const addedCriteria = new Set<string>();

        const addSpec = (name: string, val: any) => {
            if (val === undefined || val === null) return;
            const strVal = String(val).trim();
            if (!strVal || addedCriteria.has(name)) return;
            addedCriteria.add(name);
            specEntries.push({ criteriaName: name, criteriaValue: strVal });
        };

        if (p.axle) addSpec("Côté d'assemblage", p.axle);

        const tecdocSpec = getTecDocSpecsForRef(articleNo);
        const catalogSpec = {
            ...(tecdocSpec || {}),
            ...(p.specs || p.catalog || p.prices?.preference?.raw?.specs || {}),
        };

        if (catalogSpec.outerDiameter) addSpec("Diamètre extérieur [mm]", `${catalogSpec.outerDiameter} Mm`);
        if (catalogSpec.thickness) addSpec(isDisque ? "Épaisseur du disque [mm]" : "Épaisseur [mm]", `${catalogSpec.thickness} Mm`);
        if (catalogSpec.thicknessMin) addSpec("Épaisseur minimum [mm]", `${catalogSpec.thicknessMin} Mm`);
        if (catalogSpec.discType) addSpec("Type de disque de frein", catalogSpec.discType);
        if (catalogSpec.numberOfHoles) addSpec("Nombre de trous", `${catalogSpec.numberOfHoles}`);
        if (catalogSpec.centerDiameter) addSpec("Diamètre du centrage [mm]", `${catalogSpec.centerDiameter} Mm`);
        if (catalogSpec.pcd) addSpec("Cercle de perçage [mm]", `${catalogSpec.pcd} Mm`);
        if (catalogSpec.surface) addSpec("Surface", catalogSpec.surface);
        if (catalogSpec.width) addSpec("Largeur [mm]", `${catalogSpec.width} Mm`);
        if (catalogSpec.height) addSpec("Hauteur [mm]", `${catalogSpec.height} Mm`);
        if (catalogSpec.length) addSpec("Longueur [mm]", `${catalogSpec.length} Mm`);
        if (catalogSpec.forDiscDiameter) addSpec("Adapté au diamètre de disque [mm]", `${catalogSpec.forDiscDiameter} Mm`);
        if (p.wvaNumbers && Array.isArray(p.wvaNumbers) && p.wvaNumbers.length > 0) {
            addSpec("Numéro WVA", p.wvaNumbers.join(", "));
        }
        if (p.equivalentOf) addSpec("Équivalent de", p.equivalentOf);

        for (const s of specEntries) {
            await db.insert(articleSpecifications).values({
                articleId,
                criteriaName: s.criteriaName,
                criteriaValue: s.criteriaValue,
            }).onConflictDoNothing();
        }
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const vehicleId = Number(searchParams.get("vehicleId"));
    const categoryId = Number(searchParams.get("categoryId"));

    if (!vehicleId || !categoryId) {
        return NextResponse.json(
            { error: "vehicleId et categoryId sont requis" },
            { status: 400 }
        );
    }

    let rows = await db
        .select({
            articleId: articles.articleId,
            articleNo: articles.articleNo,
            articleProductName: articles.articleProductName,
            productId: articles.productId,
            supplierId: articles.supplierId,
            supplierName: suppliers.supplierName,
            supplierLogoName: suppliers.supplierLogoName,
            articleMediaType: articles.articleMediaType,
            articleMediaFileName: articles.articleMediaFileName,
            s3image: articles.s3image,
            priceNet: articles.priceNet,
            priceBase: articles.priceBase,
            discountLabel: articles.discountLabel,
            inStock: articles.inStock,
            stockLabel: articles.stockLabel,
        })
        .from(articles)
        .leftJoin(suppliers, eq(articles.supplierId, suppliers.supplierId))
        .where(
            and(
                eq(articles.vehicleId, vehicleId),
                eq(articles.categoryId, categoryId)
            )
        );

    // Dynamic fallback: si aucun article pour cette catégorie en base, lancer la recherche B2B
    if (rows.length === 0) {
        try {
            const categoryName = categoryId === 100032 ? "disque" : "plaquette";
            const scraperResult = await searchByPlate(String(vehicleId), categoryName);
            if (scraperResult && scraperResult.parts.length > 0) {
                await persistProducts(vehicleId, scraperResult.parts);

                rows = await db
                    .select({
                        articleId: articles.articleId,
                        articleNo: articles.articleNo,
                        articleProductName: articles.articleProductName,
                        productId: articles.productId,
                        supplierId: articles.supplierId,
                        supplierName: suppliers.supplierName,
                        supplierLogoName: suppliers.supplierLogoName,
                        articleMediaType: articles.articleMediaType,
                        articleMediaFileName: articles.articleMediaFileName,
                        s3image: articles.s3image,
                        priceNet: articles.priceNet,
                        priceBase: articles.priceBase,
                        discountLabel: articles.discountLabel,
                        inStock: articles.inStock,
                        stockLabel: articles.stockLabel,
                    })
                    .from(articles)
                    .leftJoin(suppliers, eq(articles.supplierId, suppliers.supplierId))
                    .where(
                        and(
                            eq(articles.vehicleId, vehicleId),
                            eq(articles.categoryId, categoryId)
                        )
                    );
            }
        } catch {
            // Ignore scraper errors
        }
    }

    if (rows.length === 0) {
        return NextResponse.json([]);
    }

    const articleIds = rows.map((r) => r.articleId);
    const specs = await db
        .select({
            articleId: articleSpecifications.articleId,
            criteriaName: articleSpecifications.criteriaName,
            criteriaValue: articleSpecifications.criteriaValue,
        })
        .from(articleSpecifications)
        .where(inArray(articleSpecifications.articleId, articleIds));

    // Grouper et dédoublonner les specs par articleId
    const specsMap = new Map<number, Map<string, string>>();
    for (const s of specs) {
        let articleSpecs = specsMap.get(s.articleId);
        if (!articleSpecs) {
            articleSpecs = new Map<string, string>();
            specsMap.set(s.articleId, articleSpecs);
        }
        if (!articleSpecs.has(s.criteriaName)) {
            articleSpecs.set(s.criteriaName, s.criteriaValue);
        }
    }

    const result = rows.map((r) => {
        const articleSpecsMap = specsMap.get(r.articleId);
        const specList: { criteriaName: string; criteriaValue: string }[] = [];
        if (articleSpecsMap) {
            for (const [criteriaName, criteriaValue] of articleSpecsMap.entries()) {
                specList.push({ criteriaName, criteriaValue });
            }
        }
        return {
            ...r,
            specs: specList,
        };
    });

    return NextResponse.json(result);
}
