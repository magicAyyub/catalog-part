"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSyncVehicle } from "@/hooks/parts/use-sync-vehicle";
import { type PlateLookupResult, formatPlateInput } from "@/lib/vehicle/plate-resolver";

interface VehiclePlateSearchProps {
    onVehicleSelected?: (vehicleId: number) => void;
    onSyncComplete?: (
        vehicleId: number,
        details?: { label: string; plate?: string; vin?: string }
    ) => void;
    onSyncError?: (error: Error | null) => void;
}

export function VehiclePlateSearch({
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
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Erreur lors de la recherche.";
            setPlateError(msg);
        } finally {
            setIsLoadingPlate(false);
        }
    }

    function handleTestPlate(plate: string) {
        setRawInput(formatPlateInput(plate));
        setPlateError(null);
    }

    const isDev = process.env.NODE_ENV === "development";

    return (
        <div className="flex flex-col gap-4">
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-stretch gap-3">
                {/* Plaque d'immatriculation */}
                <div className="relative flex flex-1 items-center rounded-lg border border-input bg-background p-1 shadow-xs transition-shadow focus-within:ring-2 focus-within:ring-primary/40">
                    <div className="flex h-10 w-9 flex-col items-center justify-between rounded-l bg-blue-700 py-1 text-[9px] font-bold text-white select-none">
                        <div className="flex gap-0.5 text-[7px] text-yellow-300">★</div>
                        <span className="font-sans tracking-tight">F</span>
                    </div>

                    <input
                        type="text"
                        value={rawInput}
                        onChange={handleInputChange}
                        onPaste={handlePaste}
                        placeholder="AA-123-BB"
                        maxLength={9}
                        className="w-full bg-transparent px-3 text-center font-mono text-lg font-bold tracking-widest text-foreground placeholder:text-muted-foreground/40 focus:outline-none uppercase"
                        disabled={isLoadingPlate || isSyncing}
                    />
                </div>

                <Button
                    type="submit"
                    disabled={isLoadingPlate || isSyncing || !rawInput.trim()}
                    className="h-12 px-6 font-semibold"
                >
                    {isLoadingPlate || isSyncing ? "Identification…" : "Rechercher par plaque"}
                </Button>
            </form>

            {/* Raccourcis de plaques de test (visibles uniquement en mode développement) */}
            {isDev && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Exemples de plaques :</span>
                    {["AA-123-BB", "AB-123-CD", "GH-456-JK"].map((testPlate) => (
                        <button
                            key={testPlate}
                            type="button"
                            onClick={() => handleTestPlate(testPlate)}
                            className="rounded bg-muted px-2 py-1 font-mono text-xs hover:bg-muted/80 text-foreground transition-colors"
                        >
                            {testPlate}
                        </button>
                    ))}
                </div>
            )}

            {/* Erreur */}
            {plateError && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs font-medium text-destructive">
                    {plateError}
                </div>
            )}

            {/* Véhicule trouvé */}
            {foundVehicle && (
                <div className="flex flex-col gap-2 rounded-lg border border-green-500/20 bg-green-500/5 p-4 text-sm text-green-700 dark:text-green-400">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-medium">
                            <span className="flex size-5 items-center justify-center rounded-full bg-green-600 text-xs text-white">✓</span>
                            <span>
                                {foundVehicle.manufacturerName} {foundVehicle.modelName} | {foundVehicle.typeEngineName}
                            </span>
                        </div>
                        <span className="font-mono text-xs bg-green-600/10 px-2 py-0.5 rounded text-green-700 dark:text-green-300">
                            Plaque : {foundVehicle.plate}
                        </span>
                    </div>

                    {foundVehicle.vin && (
                        <p className="text-xs opacity-80 font-mono">
                            VIN : {foundVehicle.vin}
                        </p>
                    )}

                    {isSyncing && (
                        <p className="text-xs text-muted-foreground animate-pulse">
                            Chargement du catalogue de pièces pour ce véhicule...
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
