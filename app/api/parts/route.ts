import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { withRequestContext } from "@/lib/logs/request-context";
import { rapidApiFailure } from "@/lib/rapidapi/errors";
import { getVehicleArticles } from "@/lib/acquisition/catalog";
import { toApiArticle } from "@/lib/api/shapes";

/**
 * GET /api/parts?vehicleId&categoryId
 *
 * Déclenche l'acquisition si le couple n'a jamais été interrogé, ce qui rend la
 * première requête plus lente et les suivantes gratuites.
 */
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

    try {
        return NextResponse.json((await getVehicleArticles(vehicleId, categoryId)).map(toApiArticle));
    } catch (error) {
        return rapidApiFailure(error, { vehicleId, categoryId });
    }
}

export async function GET(request: Request) {
    return withRequestContext("parts", () => handleGet(request));
}
