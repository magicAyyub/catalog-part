import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { withRequestContext } from "@/lib/logs/request-context";
import { rapidApiFailure } from "@/lib/rapidapi/errors";
import { getArticleDetail } from "@/lib/acquisition/catalog";
import { toApiArticleDetail } from "@/lib/api/shapes";

async function handleGet(context: { params: Promise<{ articleId: string }> }) {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const articleId = Number((await context.params).articleId);
    if (!articleId) {
        return NextResponse.json({ error: "articleId invalide" }, { status: 400 });
    }

    try {
        const detail = await getArticleDetail(articleId);
        if (!detail) {
            return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
        }
        return NextResponse.json(toApiArticleDetail(detail));
    } catch (error) {
        return rapidApiFailure(error, { articleId });
    }
}

export async function GET(_request: Request, context: { params: Promise<{ articleId: string }> }) {
    return withRequestContext("parts/detail", () => handleGet(context));
}
