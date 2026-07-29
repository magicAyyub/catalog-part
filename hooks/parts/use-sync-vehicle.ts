import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SyncRequestBody } from "@/app/api/vehicle/sync/route";

interface SyncResponse {
    status: "synced" | "cached";
    vehicleId: number;
}

async function postSync(body: SyncRequestBody): Promise<SyncResponse> {
    const res = await fetch("/api/vehicle/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Échec de la synchronisation");
    }
    return res.json();
}

export function useSyncVehicle() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: postSync,
        onSuccess: (data) => {
            // Invalide les queries parts/facets du véhicule nouvellement synchro
            // pour forcer un re-fetch si elles étaient déjà en cache avec des données vides
            queryClient.invalidateQueries({ queryKey: ["parts", data.vehicleId] });
            queryClient.invalidateQueries({ queryKey: ["facets", data.vehicleId] });
        },
    });
}
