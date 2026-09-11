import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { withRequestContext } from "@/lib/logs/request-context";
import { getArticlesByReferenceWithCrossReferences } from "@/lib/acquisition/cross-references";
import { toApiArticle } from "@/lib/api/shapes";
import { rapidApiFailure } from "@/lib/rapidapi/errors";

/**
 * GET /api/parts/reference?q={term}
 *
 * Retourne la liste des pièces ciblées et leurs équivalents toutes marques autorisées (PartItem[]).
 */
async function handleGet(request: Request) {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";

    if (q.trim().length < 3) {
        return NextResponse.json([]);
    }

    try {
        const articles = await getArticlesByReferenceWithCrossReferences(q);
        return NextResponse.json(articles.map(toApiArticle));
    } catch (error) {
        return rapidApiFailure(error, { query: q });
    }
}

export async function GET(request: Request) {
    return withRequestContext("parts/reference", () => handleGet(request));
}
