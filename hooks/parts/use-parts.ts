"use client";

import { useQueries } from "@tanstack/react-query";

export interface PartSpec {
    criteriaName: string;
    criteriaValue: string;
}

export interface PartItem {
    articleId: number;
    articleNo: string;
    articleProductName: string;
    productId: number | null;
    supplierId: number;
    supplierName: string | null;
    supplierLogoName: string | null;
    articleMediaType: string | null;
    articleMediaFileName: string | null;
    s3image: string | null;
    specs: PartSpec[];
    /** Added client side: the route answers per category, so it never sends it back. */
    categoryId: number;
}

async function fetchParts(vehicleId: number, categoryId: number): Promise<PartItem[]> {
    const res = await fetch(`/api/parts?vehicleId=${vehicleId}&categoryId=${categoryId}`);
    if (!res.ok) throw new Error("Impossible de charger les articles");
    const parts = (await res.json()) as Omit<PartItem, "categoryId">[];
    return parts.map((part) => ({ ...part, categoryId }));
}

/**
 * Charge les deux catégories d'un coup et laisse le panneau filtrer, pour voir
 * plaquettes et disques ensemble. Le premier appel pour un véhicule déclenche
 * l'acquisition côté serveur, il est donc plus long que les suivants.
 */
export function useParts(vehicleId: number | null, categoryIds: readonly number[]) {
    return useQueries({
        queries: categoryIds.map((categoryId) => ({
            queryKey: ["parts", vehicleId, categoryId],
            queryFn: () => fetchParts(vehicleId!, categoryId),
            enabled: !!vehicleId,
            staleTime: 1000 * 60 * 30,
        })),
        // `combine` mémoïse le résultat fusionné, ce qu'un useMemo sur un tableau
        // de longueur variable ne peut pas faire proprement.
        combine: (results) => ({
            data: results.every((r) => r.data !== undefined)
                ? results.flatMap((r) => r.data ?? [])
                : undefined,
            isLoading: results.some((r) => r.isLoading),
            isError: results.some((r) => r.isError),
            error: results.find((r) => r.error)?.error ?? null,
        }),
    });
}
