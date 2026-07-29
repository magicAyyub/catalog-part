import { NextResponse } from "next/server";
import { rapidApi } from "@/lib/rapidapi/client";
import { getWithCache } from "@/lib/vehicle/api-cache";

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
        const data = await getWithCache(`article_details_${id}`, () =>
            rapidApi.getArticleDetails(id)
        );
        return NextResponse.json(data);
    } catch (error: any) {
        console.error(`Erreur récupération détails article ${id} :`, error);
        return NextResponse.json(
            { error: "Impossible de charger les détails de l'article." },
            { status: 500 }
        );
    }
}
