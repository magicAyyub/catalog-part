import { useQuery } from "@tanstack/react-query";
import type { ApiModel } from "@/lib/rapidapi/types";

async function fetchModels(manufacturerId: number): Promise<ApiModel[]> {
  const res = await fetch(`/api/vehicle/models?manufacturerId=${manufacturerId}`);
  if (!res.ok) throw new Error("Impossible de charger les modèles");
  return res.json();
}

export function useModels(manufacturerId: number | null) {
  return useQuery({
    queryKey: ["models", manufacturerId],
    queryFn: () => fetchModels(manufacturerId!),
    enabled: !!manufacturerId, // ne s'exécute que si un fabricant est sélectionné
    staleTime: 1000 * 60 * 30, // 30min
  });
}
