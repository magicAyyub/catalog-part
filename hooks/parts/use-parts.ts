"use client";

import { useQuery } from "@tanstack/react-query";

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
    categoryId: number;
}

async function fetchBatchParts(vehicleId: number, categoryIds: readonly number[]): Promise<PartItem[]> {
    const idsParam = categoryIds.join(",");
    const res = await fetch(`/api/parts?vehicleId=${vehicleId}&categoryIds=${idsParam}`);
    if (!res.ok) throw new Error("Impossible de charger les articles");
    return (await res.json()) as PartItem[];
}

/**
 * Charge l'ensemble des catégories en 1 seul appel groupé (`categoryIds=100030,100032`).
 */
export function useParts(vehicleId: number | null, categoryIds: readonly number[]) {
    const idsString = categoryIds.join(",");
    return useQuery({
        queryKey: ["parts", vehicleId, idsString],
        queryFn: () => fetchBatchParts(vehicleId!, categoryIds),
        enabled: !!vehicleId && categoryIds.length > 0,
        staleTime: 1000 * 60 * 30,
    });
}
