"use client";

import { useState } from "react";
import { VehicleCascade } from "@/components/vehicle/vehicle-cascade";
import { PartsSection } from "@/components/parts/parts-section";

export default function Home() {
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [syncError, setSyncError] = useState<Error | null>(null);

  function handleVehicleSelected(vehicleId: number) {
    setSelectedVehicleId(vehicleId);
    setIsSynced(false);
    setIsSyncing(true);
    setSyncError(null);
  }

  function handleSyncComplete(vehicleId: number) {
    setSelectedVehicleId(vehicleId);
    setIsSyncing(false);
    setIsSynced(true);
    setSyncError(null);
  }

  function handleSyncError(error: Error | null) {
    setIsSyncing(false);
    setSyncError(error);
  }

  return (
    <main className="mx-auto max-w-[1600px] w-full px-4 py-10 sm:px-6 lg:px-8">
      {/* En-tête */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Catalogue de pièces auto
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Identifiez votre véhicule pour trouver les pièces compatibles.
        </p>
      </div>

      {/* Sélecteur véhicule */}
      <section className="mb-10 rounded-xl border border-border bg-card p-6 shadow-sm max-w-4xl">
        <h2 className="mb-5 text-base font-semibold text-foreground">Votre véhicule</h2>
        <VehicleCascade
          onVehicleSelected={handleVehicleSelected}
          onSyncComplete={handleSyncComplete}
          onSyncError={handleSyncError}
        />
      </section>

      {/* Section pièces : visible uniquement après sélection */}
      {selectedVehicleId && (
        <>
          {/* Séparateur */}
          <div className="mb-10 border-t border-border" />

          <PartsSection
            vehicleId={selectedVehicleId}
            isSyncing={isSyncing}
            isSynced={isSynced}
            syncError={syncError}
          />
        </>
      )}
    </main>
  );
}
