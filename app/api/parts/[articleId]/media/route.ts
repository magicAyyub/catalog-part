import { NextResponse } from "next/server";
import { rapidApi } from "@/lib/rapidapi/client";

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
        const media = await rapidApi.getArticleMedia(id);
        return NextResponse.json(media);
    } catch {
        return NextResponse.json([]);
    }
}
