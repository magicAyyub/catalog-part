import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { withRequestContext } from "@/lib/logs/request-context";
import { loadArticleMedia } from "@/lib/parts/article-detail";

/**
 * GET /api/parts/[articleId]/media
 *
 * Image gallery of a reference, cached with no expiry: the visuals of an article
 * do not change, and this route used to be called on every drawer opening with
 * no cache at all, one billed call per click.
 */
async function handleGet(_request: Request, { params }: { params: Promise<{ articleId: string }> }) {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const { articleId } = await params;
    const id = Number(articleId);

    if (!id) {
        return NextResponse.json({ error: "articleId invalide" }, { status: 400 });
    }

    return NextResponse.json(await loadArticleMedia(id));
}

export async function GET(
    request: Request,
    context: { params: Promise<{ articleId: string }> }
) {
    return withRequestContext("parts/media", () => handleGet(request, context));
}
