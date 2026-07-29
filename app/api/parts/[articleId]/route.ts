import { NextResponse } from "next/server";
import { rapidApi } from "@/lib/rapidapi/client";

// Ce endpoint reste un appel live RapidAPI : le détail d'un article est consulté
// ponctuellement (ouverture d'une fiche produit) et trop volumineux à pré-cacher.
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ articleId: string }> }
) {
    const { articleId } = await params;
    const id = Number(articleId);

    if (!id) {
        return NextResponse.json({ error: "articleId invalide" }, { status: 400 });
    }

    const data = await rapidApi.getArticleDetails(id);
    return NextResponse.json(data);
}
