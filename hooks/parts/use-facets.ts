import { useQuery } from "@tanstack/react-query";
import type { FacetResult } from "@/app/api/parts/facets/route";

export type { FacetResult };

async function fetchFacets(vehicleId: number, categoryId: number): Promise<FacetResult[]> {
    const res = await fetch(`/api/parts/facets?vehicleId=${vehicleId}&categoryId=${categoryId}`);
    if (!res.ok) throw new Error("Impossible de charger les facettes");
    return res.json();
}

export function useFacets(
    vehicleId: number | null,
    categoryId: number | null,
    isSynced: boolean
) {
    return useQuery({
        queryKey: ["facets", vehicleId, categoryId],
        queryFn: () => fetchFacets(vehicleId!, categoryId!),
        enabled: !!vehicleId && !!categoryId && isSynced,
        staleTime: 1000 * 60 * 30,
    });
}
