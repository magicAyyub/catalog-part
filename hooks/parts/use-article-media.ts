import { useQuery } from "@tanstack/react-query";
import type { ApiMediaItem } from "@/lib/rapidapi/types";

async function fetchArticleMedia(articleId: number): Promise<ApiMediaItem[]> {
    const res = await fetch(`/api/parts/${articleId}/media`);
    if (!res.ok) throw new Error("Impossible de charger les médias de l'article");
    return res.json();
}

export function useArticleMedia(articleId: number | null) {
    return useQuery({
        queryKey: ["article-media", articleId],
        queryFn: () => fetchArticleMedia(articleId!),
        enabled: !!articleId,
        staleTime: 1000 * 60 * 60,
    });
}
