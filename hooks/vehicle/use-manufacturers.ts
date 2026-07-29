import { useQuery } from "@tanstack/react-query";
import type { ApiManufacturer } from "@/lib/rapidapi/types";

async function fetchManufacturers(): Promise<ApiManufacturer[]> {
  const res = await fetch("/api/vehicle/manufacturers");
  if (!res.ok) throw new Error("Impossible de charger les fabricants");
  return res.json();
}

export function useManufacturers() {
  return useQuery({
    queryKey: ["manufacturers"],
    queryFn: fetchManufacturers,
    staleTime: 1000 * 60 * 60, // 1h — la liste des fabricants est très stable
  });
}
