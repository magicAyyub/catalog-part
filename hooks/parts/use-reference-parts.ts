"use client";

import { useQuery } from "@tanstack/react-query";
import type { PartItem } from "./use-parts";

async function fetchReferenceParts(query: string): Promise<PartItem[]> {
    const res = await fetch(`/api/parts/reference?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error("Impossible de charger les pièces pour cette référence.");
    return (await res.json()) as PartItem[];
}

export function useReferenceParts(query: string | null) {
    const trimmed = query?.trim() ?? "";
    return useQuery({
        queryKey: ["reference-parts", trimmed],
        queryFn: () => fetchReferenceParts(trimmed),
        enabled: trimmed.length >= 3,
        staleTime: 1000 * 60 * 30, // 30min
    });
}
