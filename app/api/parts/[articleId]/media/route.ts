import { NextResponse } from "next/server";
import { rapidApi } from "@/lib/rapidapi/client";
import { getWithCache } from "@/lib/vehicle/api-cache";
import { logger } from "@/lib/logger";

/**
 * GET /api/parts/[articleId]/media
 *
 * Image gallery of a reference. Cached with no expiry: the visuals of an article
 * do not change, and this route used to be called on every drawer opening with
 * no cache at all, one billed call per click.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ articleId: string }> }
) {
    const { articleId } = await params;
    const id = Number(articleId);

    if (!id) {
        return NextResponse.json({ error: "articleId invalide" }, { status: 400 });
    }

    try {
        const media = await getWithCache(`article_media_${id}`, () => rapidApi.getArticleMedia(id));
        return NextResponse.json(media);
    } catch (error) {
        // La galerie est accessoire : le tiroir sait s'afficher sans.
        logger.warn("Article media lookup failed", {
            action: "article-media",
            articleId: id,
            error,
        });
        return NextResponse.json([]);
    }
}