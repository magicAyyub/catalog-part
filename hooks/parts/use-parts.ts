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
    priceNet: number | null;
    priceBase: number | null;
    discountLabel: string | null;
    inStock: boolean | null;
    stockLabel: string | null;
}

async function fetchParts(vehicleId: number, categoryId: number): Promise<PartItem[]> {
    const res = await fetch(`/api/parts?vehicleId=${vehicleId}&categoryId=${categoryId}`);
    if (!res.ok) throw new Error("Impossible de charger les articles");
    return res.json();
}

export function useParts(
    vehicleId: number | null,
    categoryId: number | null,
    isSynced: boolean
) {
    return useQuery({
        queryKey: ["parts", vehicleId, categoryId],
        queryFn: () => fetchParts(vehicleId!, categoryId!),
        enabled: !!vehicleId && !!categoryId && isSynced,
        staleTime: 1000 * 60 * 30,
    });
}
