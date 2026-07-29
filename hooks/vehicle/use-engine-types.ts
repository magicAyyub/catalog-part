import { useQuery } from "@tanstack/react-query";
import type { ApiEngineType } from "@/lib/rapidapi/types";

async function fetchEngineTypes(modelId: number): Promise<ApiEngineType[]> {
  const res = await fetch(`/api/vehicle/engine-types?modelId=${modelId}`);
  if (!res.ok) throw new Error("Impossible de charger les motorisations");
  return res.json();
}

export function useEngineTypes(modelId: number | null) {
  return useQuery({
    queryKey: ["engine-types", modelId],
    queryFn: () => fetchEngineTypes(modelId!),
    enabled: !!modelId, // ne s'exécute que si un modèle est sélectionné
    staleTime: 1000 * 60 * 30, // 30min
  });
}
