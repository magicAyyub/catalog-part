import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { articles, suppliers, articleSpecifications } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";

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

    // 1. Articles avec jointure suppliers
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

    // 2. Specs par article
    const articleIds = rows.map((r) => r.articleId);
    const specs = await db
        .select({
            articleId: articleSpecifications.articleId,
            criteriaName: articleSpecifications.criteriaName,
            criteriaValue: articleSpecifications.criteriaValue,
        })
        .from(articleSpecifications)
        .where(inArray(articleSpecifications.articleId, articleIds));

    // 3. Grouper les specs par articleId
    const specsMap = new Map<number, { criteriaName: string; criteriaValue: string }[]>();
    for (const s of specs) {
        const list = specsMap.get(s.articleId) ?? [];
        list.push({ criteriaName: s.criteriaName, criteriaValue: s.criteriaValue });
        specsMap.set(s.articleId, list);
    }

    // 4. Merger
    const result = rows.map((r) => ({
        ...r,
        specs: specsMap.get(r.articleId) ?? [],
    }));

    return NextResponse.json(result);
}
