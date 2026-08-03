"use client";

import { useState, useEffect } from "react";
import { VehicleCascade } from "@/components/vehicle/vehicle-cascade";
import { ActiveVehicleCard, type ActiveVehicleData } from "@/components/vehicle/active-vehicle-card";
import { PartsSection } from "@/components/parts/parts-section";

const STORAGE_KEY = "catalog_active_vehicle";

export default function Home() {
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [activeVehicleData, setActiveVehicleData] = useState<ActiveVehicleData | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [syncError, setSyncError] = useState<Error | null>(null);
  const [isRestored, setIsRestored] = useState(false);

  // Restauration de la sélection sauvegardée au rechargement de la page (F5)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: ActiveVehicleData = JSON.parse(stored);
        if (parsed && parsed.vehicleId) {
          setSelectedVehicleId(parsed.vehicleId);
          setActiveVehicleData(parsed);
          setIsSynced(true);
        }
      }
    } catch {
      // Si données corrompues, ignorer
    } finally {
      setIsRestored(true);
    }
  }, []);

  function handleVehicleSelected(vehicleId: number) {
    setSelectedVehicleId(vehicleId);
    setIsSynced(false);
    setIsSyncing(true);
    setSyncError(null);
  }

  function handleSyncComplete(
    vehicleId: number,
    details?: { label: string; plate?: string; vin?: string }
  ) {
    const vehicleData: ActiveVehicleData = {
      vehicleId,
      label: details?.label || `Véhicule #${vehicleId}`,
      plate: details?.plate,
      vin: details?.vin,
    };

    setSelectedVehicleId(vehicleId);
    setActiveVehicleData(vehicleData);
    setIsSyncing(false);
    setIsSynced(true);
    setSyncError(null);

    // Sauvegarde dans le localStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(vehicleData));
    } catch {
      // Quota dépassé ou localStorage désactivé
    }
  }

  function handleSyncError(error: Error | null) {
    setIsSyncing(false);
    setSyncError(error);
  }

  function handleResetVehicle() {
    setSelectedVehicleId(null);
    setActiveVehicleData(null);
    setIsSyncing(false);
    setIsSynced(false);
    setSyncError(null);

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignorer
    }
  }

  if (!isRestored) {
    return null; // Évite les flashs de layout pendant l'hydratation du localStorage
  }

  const isVehicleActive = selectedVehicleId && activeVehicleData && isSynced && !isSyncing;

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

      {/* Zone Sélection / Véhicule Actif */}
      <section className="mb-10 max-w-4xl">
        {isVehicleActive ? (
          <ActiveVehicleCard
            vehicle={activeVehicleData}
            onReset={handleResetVehicle}
          />
        ) : (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-5 text-base font-bold text-center tracking-tight text-foreground">
              Par plaque d'immatriculation
            </h2>
            <VehicleCascade
              onVehicleSelected={handleVehicleSelected}
              onSyncComplete={handleSyncComplete}
              onSyncError={handleSyncError}
            />
          </div>
        )}
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
