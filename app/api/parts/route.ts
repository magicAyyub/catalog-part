import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { db } from "@/lib/db/client";
import { articles, suppliers, articleSpecifications } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";

import { withRequestContext } from "@/lib/logs/request-context";
async function handleGet(request: Request) {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const vehicleId = Number(searchParams.get("vehicleId"));
    const categoryId = Number(searchParams.get("categoryId"));

    if (!vehicleId || !categoryId) {
        return NextResponse.json(
            { error: "vehicleId et categoryId sont requis" },
            { status: 400 }
        );
    }

    const rows = await db
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

export async function GET(request: Request) {
    return withRequestContext("parts", () => handleGet(request));
}
