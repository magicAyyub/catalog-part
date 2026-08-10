import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { db } from "@/lib/db/client";
import { articleCriteriaFacets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export interface FacetResult {
    criteriaName: string;
    type: string | null;
    distinctValues: string[];
}

export async function GET(request: Request) {
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
            criteriaName: articleCriteriaFacets.criteriaName,
            type: articleCriteriaFacets.type,
            distinctValuesJson: articleCriteriaFacets.distinctValuesJson,
        })
        .from(articleCriteriaFacets)
        .where(
            and(
                eq(articleCriteriaFacets.vehicleId, vehicleId),
                eq(articleCriteriaFacets.categoryId, categoryId)
            )
        );

    const facets: FacetResult[] = rows.map((r) => ({
        criteriaName: r.criteriaName,
        type: r.type,
        distinctValues: JSON.parse(r.distinctValuesJson) as string[],
    }));

    return NextResponse.json(facets);
}
