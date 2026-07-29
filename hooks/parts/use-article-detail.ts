import { useQuery } from "@tanstack/react-query";
import type { ApiArticleDetails } from "@/lib/rapidapi/types";

async function fetchArticleDetail(articleId: number): Promise<ApiArticleDetails> {
    const res = await fetch(`/api/parts/${articleId}`);
    if (!res.ok) throw new Error("Impossible de charger le détail de l'article");
    return res.json();
}

export function useArticleDetail(articleId: number | null) {
    return useQuery({
        queryKey: ["article-detail", articleId],
        queryFn: () => fetchArticleDetail(articleId!),
        enabled: !!articleId,
        // Pas de staleTime court : le détail d'article ne change pas
        staleTime: 1000 * 60 * 60,
    });
}
