import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { withRequestContext } from "@/lib/logs/request-context";
import { rapidApiFailure } from "@/lib/rapidapi/errors";
import { getVehicleArticles } from "@/lib/acquisition/catalog";
import { toApiArticle } from "@/lib/api/shapes";

/**
 * GET /api/parts?vehicleId=...&categoryId=... (ou categoryIds=100030,100032)
 *
 * Déclenche l'acquisition si le couple n'a jamais été interrogé.
 * Supporte un tableau de catégories pour regrouper les requêtes.
 */
async function handleGet(request: Request) {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const vehicleId = Number(searchParams.get("vehicleId"));

    const rawCategoryIds = searchParams.get("categoryIds") || searchParams.get("categoryId");
    const categoryIds = rawCategoryIds
        ? rawCategoryIds
              .split(",")
              .map((s) => Number(s.trim()))
              .filter((n) => Number.isSafeInteger(n) && n > 0)
        : [];

    if (!Number.isSafeInteger(vehicleId) || vehicleId <= 0 || categoryIds.length === 0) {
        return NextResponse.json(
            { error: "vehicleId ou categoryId(s) invalide" },
            { status: 400 }
        );
    }

    try {
        const results = await Promise.all(
            categoryIds.map(async (catId) => {
                const parts = await getVehicleArticles(vehicleId, catId);
                return parts.map((p) => ({ ...toApiArticle(p), categoryId: catId }));
            })
        );

        // Si une seule catégorie demandée (compatibilité), retourner le tableau simple d'articles
        if (searchParams.has("categoryId") && !searchParams.has("categoryIds")) {
            return NextResponse.json(
                results[0].map((item) => {
                    const copy = { ...item };
                    delete (copy as { categoryId?: number }).categoryId;
                    return copy;
                })
            );
        }

        return NextResponse.json(results.flat());
    } catch (error) {
        return rapidApiFailure(error, { vehicleId, categoryIds });
    }
}

export async function GET(request: Request) {
    return withRequestContext("parts", () => handleGet(request));
}
