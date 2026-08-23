"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSyncVehicle } from "@/hooks/parts/use-sync-vehicle";
import { type PlateLookupResult, formatPlateInput } from "@/lib/vehicle/plate-resolver";

interface VehiclePlateSearchProps {
    /** Remonté pour que la page montre une attente, le formulaire étant trop haut. */
    onIdentifyingChange?: (identifying: boolean) => void;
    onVehicleSelected?: (vehicleId: number) => void;
    onSyncComplete?: (
        vehicleId: number,
        details?: { label: string; plate?: string; vin?: string }
    ) => void;
    onSyncError?: (error: Error | null) => void;
}

export function VehiclePlateSearch({
    onIdentifyingChange,
    onVehicleSelected,
    onSyncComplete,
    onSyncError,
}: VehiclePlateSearchProps) {
    const [rawInput, setRawInput] = useState("");
    const [isLoadingPlate, setIsLoadingPlate] = useState(false);
    const [plateError, setPlateError] = useState<string | null>(null);
    const [foundVehicle, setFoundVehicle] = useState<PlateLookupResult | null>(null);

    const {
        mutate: syncVehicle,
        isPending: isSyncing,
        isSuccess: isSynced,
        error: syncError,
        reset: resetSync,
    } = useSyncVehicle();

    function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        const formatted = formatPlateInput(e.target.value);
        setRawInput(formatted);
        setPlateError(null);
    }

    function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
        e.preventDefault();
        const pastedText = e.clipboardData.getData("text");
        const formatted = formatPlateInput(pastedText);
        setRawInput(formatted);
        setPlateError(null);
    }

    async function handleSearch(e?: React.FormEvent) {
        e?.preventDefault();

        if (!rawInput.trim()) {
            setPlateError("Veuillez entrer un numéro d'immatriculation.");
            return;
        }

        setIsLoadingPlate(true);
        onIdentifyingChange?.(true);
        setPlateError(null);
        setFoundVehicle(null);
        resetSync();
        onSyncError?.(null);

        try {
            const res = await fetch("/api/vehicle/by-plate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plate: rawInput }),
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.error || "Impossible de trouver ce véhicule.");
            }

            const vehicle: PlateLookupResult = data.vehicle;

            // Non confirmé veut dire mal nommé, pas inutilisable : la
            // synchronisation part quand même et c'est elle qui tranche, sur les
            // articles rendus par TecDoc plutôt que sur des libellés.
            if (!vehicle.confirmed) {
                setPlateError(data.notice ?? null);
            }

            setFoundVehicle(vehicle);
            onVehicleSelected?.(vehicle.vehicleId);

            syncVehicle(
                {
                    vehicleId: vehicle.vehicleId,
                    manufacturerId: vehicle.manufacturerId,
                    modelId: vehicle.modelId,
                    engineType: vehicle.engineType,
                },
                {
                    onSuccess: (syncData) => {
                        onSyncComplete?.(syncData.vehicleId, {
                            label: `${vehicle.manufacturerName} ${vehicle.modelName} | ${vehicle.typeEngineName}`,
                            plate: vehicle.plate,
                            vin: vehicle.vin,
                        });
                    },
                    onError: (err: Error) => {
                        onSyncError?.(err);
                    },
                }
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Erreur lors de la recherche.";
            setPlateError(msg);
        } finally {
            setIsLoadingPlate(false);
            // La section pièces prend le relais dès qu'un véhicule est retenu :
            // on rend la main sans laisser de trou entre les deux attentes.
            onIdentifyingChange?.(false);
        }
    }

    return (
        <div className="flex flex-col gap-3">
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-stretch gap-2.5">
                {/* Plaque d'immatriculation */}
                <div className="relative flex flex-1 items-center rounded-md bg-white p-1 shadow-sm">
                    <div className="flex h-10 w-9 flex-col items-center justify-between rounded-l bg-royal py-1 text-[9px] font-bold text-white select-none">
                        <div className="flex gap-0.5 text-[7px] text-gold">★</div>
                        <span className="font-sans tracking-tight">F</span>
                    </div>

                    <input
                        type="text"
                        value={rawInput}
                        onChange={handleInputChange}
                        onPaste={handlePaste}
                        placeholder="AA-123-BB"
                        maxLength={9}
                        className="w-full bg-transparent px-3 text-center font-mono text-lg font-bold tracking-widest text-navy placeholder:text-navy/30 focus:outline-none uppercase"
                        disabled={isLoadingPlate || isSyncing}
                    />
                </div>

                <Button
                    type="submit"
                    disabled={isLoadingPlate || isSyncing || !rawInput.trim()}
                    className="h-12 shrink-0 bg-royal px-6 font-heading font-bold text-white hover:bg-royal-hover"
                >
                    {isLoadingPlate || isSyncing ? "Identification…" : "Rechercher"}
                </Button>
            </form>

            {/* Erreur */}
            {plateError && (
                <div className="rounded-md bg-white/10 p-2.5 text-xs font-medium text-white">
                    {plateError}
                </div>
            )}

            {/* Véhicule trouvé */}
            {foundVehicle && (
                <div className="flex flex-col gap-1.5 rounded-md bg-white/10 p-3 text-sm text-white">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-medium">
                            <span className="flex size-5 items-center justify-center rounded-full bg-white/20 text-xs">
                                {foundVehicle.confirmed ? "✓" : "!"}
                            </span>
                            <span>
                                {foundVehicle.manufacturerName} {foundVehicle.modelName} | {foundVehicle.typeEngineName}
                            </span>
                        </div>
                        <span className="font-mono text-xs rounded bg-white/10 px-2 py-0.5">
                            {foundVehicle.plate}
                        </span>
                    </div>

                    {isSyncing && (
                        <p className="text-xs text-white/70 animate-pulse">
                            Chargement du catalogue de pièces pour ce véhicule…
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
