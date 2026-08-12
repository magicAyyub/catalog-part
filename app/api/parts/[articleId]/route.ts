import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { logger } from "@/lib/logger";
import { withRequestContext } from "@/lib/logs/request-context";
import { loadArticleDetail } from "@/lib/parts/article-detail";

/**
 * GET /api/parts/[articleId]
 *
 * Thin wrapper over `loadArticleDetail`, which the detail page renders from as
 * well. Both go through the same permanent caches, so a page view and a fetch
 * cost the same: nothing.
 */
async function handleGet(_request: Request, { params }: { params: Promise<{ articleId: string }> }) {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const { articleId } = await params;
    const id = Number(articleId);

    if (!id) {
        return NextResponse.json({ error: "articleId invalide" }, { status: 400 });
    }

    try {
        const detail = await loadArticleDetail(id);
        if (!detail) {
            return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
        }
        return NextResponse.json(detail);
    } catch (error: unknown) {
        logger.warn("Article detail lookup error", { action: "article-detail", articleId: id, error });
        return NextResponse.json(
            { error: "Impossible de charger les détails de l'article." },
            { status: 500 }
        );
    }
}

export async function GET(
    request: Request,
    context: { params: Promise<{ articleId: string }> }
) {
    return withRequestContext("parts/detail", () => handleGet(request, context));
}
