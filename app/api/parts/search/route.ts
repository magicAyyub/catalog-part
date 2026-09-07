import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { withRequestContext } from "@/lib/logs/request-context";
import { searchArticlesByReference } from "@/lib/db/queries/search";
import { toApiArticle } from "@/lib/api/shapes";

/**
 * GET /api/parts/search?q={term}&limit={n}
 *
 * Recherche une référence globale dans le référentiel (référence fabricant, EAN, WVA, OEM).
 */
async function handleGet(request: Request) {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 10, 1), 50);

    if (q.trim().length < 3) {
        return NextResponse.json([]);
    }

    try {
        const results = await searchArticlesByReference(q, limit);
        return NextResponse.json(results.map(toApiArticle));
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Erreur lors de la recherche." },
            { status: 500 }
        );
    }
}

export async function GET(request: Request) {
    return withRequestContext("parts/search", () => handleGet(request));
}
