"use client";

import { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { useState } from "react";
import { readActiveVehicleId } from "@/lib/catalog/active-vehicle";

/** Une journée : au-delà, le catalogue est relu plutôt que restitué de mémoire. */
const PERSISTED_MAX_AGE = 1000 * 60 * 60 * 24;

export function Providers({ children }: { children: React.ReactNode }) {
  // useState garantit une instance unique par montage (évite le partage entre requêtes SSR)
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // On considère les données fraîches 30s par défaut
            staleTime: 1000 * 30,
            // Doit couvrir la durée de persistance, sinon une entrée restaurée
            // serait collectée avant d'avoir servi.
            gcTime: PERSISTED_MAX_AGE,
            // On ne re-fetch pas en cas d'échec réseau côté client
            retry: 1,
          },
        },
      })
  );

  // Sur le serveur il n'y a pas de stockage : le persister devient inerte.
  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window === "undefined" ? undefined : window.localStorage,
      key: "catalog_parts_cache",
    })
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: PERSISTED_MAX_AGE,
        dehydrateOptions: {
          /**
           * Seules les pièces du véhicule actif sont écrites.
           *
           * Les clés sont `["parts", vehicleId, categoryId]` : sans ce filtre,
           * chaque véhicule passé au comptoir laisserait son catalogue derrière
           * lui et le stockage finirait par saturer. Changer de véhicule
           * remplace donc ce qui est conservé, il ne s'y ajoute pas.
           */
          shouldDehydrateQuery: (query) => {
            if (query.state.status !== "success") return false;
            const [scope, vehicleId] = query.queryKey;
            return scope === "parts" && vehicleId === readActiveVehicleId();
          },
        },
      }}
    >
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </PersistQueryClientProvider>
  );
}
