"use client";

import { useState } from "react";
import { useManufacturers } from "@/hooks/vehicle/use-manufacturers";
import { useModels } from "@/hooks/vehicle/use-models";
import { useEngineTypes } from "@/hooks/vehicle/use-engine-types";
import { useSyncVehicle } from "@/hooks/parts/use-sync-vehicle";
import type { ApiManufacturer, ApiModel, ApiEngineType } from "@/lib/rapidapi/types";

interface VehicleCascadeProps {
    /** Appelé dès qu'un vehicleId est sélectionné (avant sync) */
    onVehicleSelected?: (vehicleId: number) => void;
    /** Appelé quand la sync SQLite est terminée (status synced ou cached) */
    onSyncComplete?: (vehicleId: number) => void;
}

export function VehicleCascade({ onVehicleSelected, onSyncComplete }: VehicleCascadeProps) {
    const [manufacturer, setManufacturer] = useState<ApiManufacturer | null>(null);
    const [model, setModel] = useState<ApiModel | null>(null);
    const [engineType, setEngineType] = useState<ApiEngineType | null>(null);

    const { data: manufacturers, isLoading: mfLoading, isError: mfError } = useManufacturers();
    const { data: models, isLoading: mdLoading } = useModels(manufacturer?.manufacturerId ?? null);
    const { data: engineTypes, isLoading: etLoading } = useEngineTypes(model?.modelId ?? null);

    const {
        mutate: syncVehicle,
        isPending: isSyncing,
        isSuccess: isSynced,
    } = useSyncVehicle();

    function handleManufacturerChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const id = Number(e.target.value);
        const found = manufacturers?.find((m) => m.manufacturerId === id) ?? null;
        setManufacturer(found);
        setModel(null);
        setEngineType(null);
    }

    function handleModelChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const id = Number(e.target.value);
        const found = models?.find((m) => m.modelId === id) ?? null;
        setModel(found);
        setEngineType(null);
    }

    function handleEngineTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const id = Number(e.target.value);
        const found = engineTypes?.find((et) => et.vehicleId === id) ?? null;
        setEngineType(found);

        if (found && manufacturer && model) {
            onVehicleSelected?.(found.vehicleId);

            syncVehicle(
                {
                    vehicleId: found.vehicleId,
                    manufacturerId: manufacturer.manufacturerId,
                    modelId: model.modelId,
                    engineType: found,
                },
                {
                    onSuccess: (data) => onSyncComplete?.(data.vehicleId),
                }
            );
        }
    }

    if (mfError) {
        return <p className="text-destructive">Erreur lors du chargement des fabricants.</p>;
    }

    const vehicleLabel = engineType
        ? `${manufacturer?.manufacturerName} ${model?.modelName} | ${engineType.typeEngineName}`
        : null;

    return (
        <div className="flex flex-col gap-6">
            {/* Sélecteurs en ligne sur grands écrans */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                {/* Fabricant */}
                <div className="flex flex-1 flex-col gap-1.5">
                    <label htmlFor="manufacturer-select" className="text-sm font-medium">
                        Fabricant
                    </label>
                    <select
                        id="manufacturer-select"
                        value={manufacturer?.manufacturerId ?? ""}
                        onChange={handleManufacturerChange}
                        disabled={mfLoading}
                        className="rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <option value="">{mfLoading ? "Chargement…" : "Sélectionner un fabricant"}</option>
                        {manufacturers?.map((m) => (
                            <option key={m.manufacturerId} value={m.manufacturerId}>
                                {m.manufacturerName}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Modèle */}
                <div className="flex flex-1 flex-col gap-1.5">
                    <label htmlFor="model-select" className="text-sm font-medium">
                        Modèle
                    </label>
                    <select
                        id="model-select"
                        value={model?.modelId ?? ""}
                        onChange={handleModelChange}
                        disabled={!manufacturer || mdLoading}
                        className="rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <option value="">
                            {!manufacturer
                                ? "D'abord un fabricant"
                                : mdLoading
                                ? "Chargement…"
                                : "Sélectionner un modèle"}
                        </option>
                        {models?.map((m) => (
                            <option key={m.modelId} value={m.modelId}>
                                {m.modelName} ({m.modelYearFrom.slice(0, 4)}
                                {m.modelYearTo ? ` – ${m.modelYearTo.slice(0, 4)}` : " →"})
                            </option>
                        ))}
                    </select>
                </div>

                {/* Motorisation */}
                <div className="flex flex-1 flex-col gap-1.5">
                    <label htmlFor="engine-type-select" className="text-sm font-medium">
                        Motorisation
                    </label>
                    <select
                        id="engine-type-select"
                        value={engineType?.vehicleId ?? ""}
                        onChange={handleEngineTypeChange}
                        disabled={!model || etLoading}
                        className="rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <option value="">
                            {!model
                                ? "D'abord un modèle"
                                : etLoading
                                ? "Chargement…"
                                : "Sélectionner une motorisation"}
                        </option>
                        {engineTypes?.map((et) => (
                            <option key={et.vehicleId} value={et.vehicleId}>
                                {et.typeEngineName} | {et.powerKw} kW ({et.fuelType})
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Bandeau de statut */}
            {engineType && (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
                    {isSyncing ? (
                        <>
                            <span className="animate-spin">⚙️</span>
                            <span className="text-muted-foreground">Synchronisation du catalogue…</span>
                        </>
                    ) : isSynced ? (
                        <>
                            <span className="text-green-500">✓</span>
                            <span className="font-medium">{vehicleLabel}</span>
                        </>
                    ) : null}
                </div>
            )}
        </div>
    );
}
