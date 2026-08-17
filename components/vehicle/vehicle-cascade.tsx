"use client";

import { useState, useMemo } from "react";
import { useManufacturers } from "@/hooks/vehicle/use-manufacturers";
import { useModels } from "@/hooks/vehicle/use-models";
import { useEngineTypes } from "@/hooks/vehicle/use-engine-types";
import { useSyncVehicle } from "@/hooks/parts/use-sync-vehicle";
import type { ApiManufacturer, ApiModel, ApiEngineType } from "@/lib/rapidapi/types";
import { VehiclePlateSearch } from "./vehicle-plate-search";
import { Button } from "@/components/ui/button";
import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
    ComboboxTrigger,
    ComboboxValue,
} from "@/components/ui/combobox";

interface VehicleCascadeProps {
    /** Vrai pendant la traduction d'une plaque, avant qu'un vehicleId existe. */
    onIdentifyingChange?: (identifying: boolean) => void;
    /** Appelé dès qu'un vehicleId est sélectionné (avant sync) */
    onVehicleSelected?: (vehicleId: number) => void;
    /** Appelé quand la sync SQLite est terminée (status synced ou cached) */
    onSyncComplete?: (
        vehicleId: number,
        details?: { label: string; plate?: string; vin?: string }
    ) => void;
    /** Callback d'erreur de synchronisation pour le composant parent */
    onSyncError?: (error: Error | null) => void;
}

// ─── Icônes SVG sobres ───────────────────────────────────────────────────────

function AlertTriangleIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="size-4"
            aria-hidden="true"
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="size-4"
            aria-hidden="true"
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
    );
}

function SpinnerIcon() {
    return (
        <svg
            className="animate-spin size-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
        >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
    );
}

export function VehicleCascade({
    onIdentifyingChange,
    onVehicleSelected,
    onSyncComplete,
    onSyncError,
}: VehicleCascadeProps) {
    const [manufacturer, setManufacturer] = useState<ApiManufacturer | null>(null);
    const [model, setModel] = useState<ApiModel | null>(null);
    const [engineType, setEngineType] = useState<ApiEngineType | null>(null);
    const [showErrorDetails, setShowErrorDetails] = useState(false);

    const {
        data: manufacturers,
        isLoading: mfLoading,
        isError: mfError,
        error: mfErrorObj,
        refetch: refetchManufacturers,
    } = useManufacturers();
    const { data: models, isLoading: mdLoading } = useModels(manufacturer?.manufacturerId ?? null);
    const { data: engineTypes, isLoading: etLoading } = useEngineTypes(model?.modelId ?? null);

    const {
        mutate: syncVehicle,
        isPending: isSyncing,
        isSuccess: isSynced,
        error: syncError,
        reset: resetSync,
    } = useSyncVehicle();

    const uniqueManufacturers = useMemo(() => {
        if (!manufacturers) return [];
        return Array.from(new Map(manufacturers.map((m) => [m.manufacturerId, m])).values());
    }, [manufacturers]);

    const uniqueModels = useMemo(() => {
        if (!models) return [];
        return Array.from(new Map(models.map((m) => [m.modelId, m])).values());
    }, [models]);

    const uniqueEngineTypes = useMemo(() => {
        if (!engineTypes) return [];
        return Array.from(new Map(engineTypes.map((et) => [et.vehicleId, et])).values());
    }, [engineTypes]);

    function triggerSync(selectedEngine: ApiEngineType) {
        if (!manufacturer || !model) return;
        onSyncError?.(null);
        setShowErrorDetails(false);

        syncVehicle(
            {
                vehicleId: selectedEngine.vehicleId,
                manufacturerId: manufacturer.manufacturerId,
                modelId: model.modelId,
                engineType: selectedEngine,
            },
            {
                onSuccess: (data) => {
                    onSyncComplete?.(data.vehicleId, {
                        label: `${manufacturer.manufacturerName} ${model.modelName} | ${selectedEngine.typeEngineName}`,
                    });
                },
                onError: (err) => {
                    onSyncError?.(err);
                },
            }
        );
    }

    const [showMfErrorDetails, setShowMfErrorDetails] = useState(false);

    if (mfError) {
        return (
            <div className="flex flex-col gap-3 rounded-lg border border-destructive/15 bg-destructive/5 p-4 text-sm text-foreground">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium text-destructive">
                        <AlertTriangleIcon />
                        <span>Erreur de chargement des constructeurs</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowMfErrorDetails(!showMfErrorDetails)}
                            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                        >
                            {showMfErrorDetails ? "Masquer les détails" : "Afficher les détails"}
                        </button>
                        <button
                            onClick={() => refetchManufacturers()}
                            className="rounded bg-destructive/10 px-2.5 py-1 text-xs font-semibold hover:bg-destructive/20 text-destructive transition-colors"
                        >
                            Réessayer
                        </button>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                    Une erreur s'est produite lors de la connexion au service de catalogue.
                </p>
                {showMfErrorDetails && (
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-muted/50 border border-border/40 p-3 font-mono text-xs text-muted-foreground leading-relaxed">
                        {mfErrorObj instanceof Error ? mfErrorObj.message : "Erreur inconnue"}
                    </pre>
                )}
            </div>
        );
    }

    const vehicleLabel = engineType
        ? `${manufacturer?.manufacturerName} ${model?.modelName} | ${engineType.typeEngineName}`
        : null;

    return (
        <div className="rounded-lg bg-banner-navy p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-0">
                {/* 1. Recherche par plaque d'immatriculation */}
                <div className="flex-1">
                    <p className="mb-3.5 font-heading text-base font-semibold text-white">
                        Recherche par plaque d&apos;immatriculation
                    </p>
                    <VehiclePlateSearch
                        onIdentifyingChange={onIdentifyingChange}
                        onVehicleSelected={onVehicleSelected}
                        onSyncComplete={onSyncComplete}
                        onSyncError={onSyncError}
                    />
                </div>

                {/* Séparateur "OU" */}
                <div className="flex items-center justify-center py-2 lg:px-6 lg:py-0">
                    <div className="flex w-full items-center gap-3 lg:hidden">
                        <div className="h-px flex-1 bg-white/20" />
                        <span className="text-xs font-bold text-white/50">OU</span>
                        <div className="h-px flex-1 bg-white/20" />
                    </div>
                    <div className="hidden lg:flex lg:h-full lg:flex-col lg:items-center">
                        <div className="w-px flex-1 bg-white/20" />
                        <span className="my-3 flex size-9 shrink-0 items-center justify-center rounded-full border border-white/30 text-xs font-bold text-white">
                            OU
                        </span>
                        <div className="w-px flex-1 bg-white/20" />
                    </div>
                </div>

                {/* 2. Recherche par cascade (Marque / Modèle / Motorisation) */}
                <div className="flex-1">
                    <p className="mb-3.5 font-heading text-base font-semibold text-white">
                        Recherche par modèle
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        {/* Fabricant */}
                        <div className="flex flex-1 flex-col gap-1.5 min-w-0">
                            <Combobox
                                items={uniqueManufacturers}
                                value={manufacturer}
                                onValueChange={(m) => {
                                    setManufacturer(m);
                                    setModel(null);
                                    setEngineType(null);
                                    resetSync();
                                    onSyncError?.(null);
                                }}
                                itemToStringValue={(m) => m?.manufacturerName ?? ""}
                                disabled={mfLoading}
                            >
                                <ComboboxTrigger
                                    render={
                                        <Button
                                            variant="outline"
                                            className="w-full justify-between border-transparent bg-white font-normal text-left min-w-0 overflow-hidden text-navy shadow-sm hover:bg-white/90"
                                            disabled={mfLoading}
                                        />
                                    }
                                >
                                    <ComboboxValue>
                                        {(m) => (
                                            <span className="truncate">
                                                {m ? m.manufacturerName : mfLoading ? "Chargement…" : "Fabricant"}
                                            </span>
                                        )}
                                    </ComboboxValue>
                                </ComboboxTrigger>
                                <ComboboxContent className="w-(--anchor-width)">
                                    <ComboboxInput showTrigger={false} placeholder="Rechercher un fabricant..." />
                                    <ComboboxEmpty>Aucun fabricant trouvé.</ComboboxEmpty>
                                    <ComboboxList>
                                        {(m) => (
                                            <ComboboxItem key={m.manufacturerId} value={m}>
                                                {m.manufacturerName}
                                            </ComboboxItem>
                                        )}
                                    </ComboboxList>
                                </ComboboxContent>
                            </Combobox>
                        </div>

                        {/* Modèle */}
                        <div className="flex flex-1 flex-col gap-1.5 min-w-0">
                            <Combobox
                                items={uniqueModels}
                                value={model}
                                onValueChange={(m) => {
                                    setModel(m);
                                    setEngineType(null);
                                    resetSync();
                                    onSyncError?.(null);
                                }}
                                itemToStringValue={(m) =>
                                    m
                                        ? `${m.modelName} (${m.modelYearFrom.slice(0, 4)}${
                                              m.modelYearTo ? ` – ${m.modelYearTo.slice(0, 4)}` : " →"
                                          })`
                                        : ""
                                }
                                disabled={!manufacturer || mdLoading}
                            >
                                <ComboboxTrigger
                                    render={
                                        <Button
                                            variant="outline"
                                            className="w-full justify-between border-transparent bg-white font-normal text-left min-w-0 overflow-hidden text-navy shadow-sm hover:bg-white/90"
                                            disabled={!manufacturer || mdLoading}
                                        />
                                    }
                                >
                                    <ComboboxValue>
                                        {(m) => (
                                            <span className="truncate">
                                                {m
                                                    ? `${m.modelName} (${m.modelYearFrom.slice(0, 4)}${
                                                          m.modelYearTo ? ` – ${m.modelYearTo.slice(0, 4)}` : " →"
                                                      })`
                                                    : !manufacturer
                                                    ? "D'abord un fabricant"
                                                    : mdLoading
                                                    ? "Chargement…"
                                                    : "Modèle"}
                                            </span>
                                        )}
                                    </ComboboxValue>
                                </ComboboxTrigger>
                                <ComboboxContent className="w-(--anchor-width)">
                                    <ComboboxInput showTrigger={false} placeholder="Rechercher un modèle..." />
                                    <ComboboxEmpty>Aucun modèle trouvé.</ComboboxEmpty>
                                    <ComboboxList>
                                        {(m) => (
                                            <ComboboxItem key={m.modelId} value={m}>
                                                {m.modelName} ({m.modelYearFrom.slice(0, 4)}
                                                {m.modelYearTo ? ` – ${m.modelYearTo.slice(0, 4)}` : " →"})
                                            </ComboboxItem>
                                        )}
                                    </ComboboxList>
                                </ComboboxContent>
                            </Combobox>
                        </div>

                        {/* Motorisation */}
                        <div className="flex flex-1 flex-col gap-1.5 min-w-0">
                            <Combobox
                                items={uniqueEngineTypes}
                                value={engineType}
                                onValueChange={(et) => {
                                    setEngineType(et);
                                    resetSync();
                                    if (et && manufacturer && model) {
                                        onVehicleSelected?.(et.vehicleId);
                                        triggerSync(et);
                                    }
                                }}
                                itemToStringValue={(et) => (et ? `${et.typeEngineName} | ${et.powerKw} kW (${et.fuelType})` : "")}
                                disabled={!model || etLoading}
                            >
                                <ComboboxTrigger
                                    render={
                                        <Button
                                            variant="outline"
                                            className="w-full justify-between border-transparent bg-white font-normal text-left min-w-0 overflow-hidden text-navy shadow-sm hover:bg-white/90"
                                            disabled={!model || etLoading}
                                        />
                                    }
                                >
                                    <ComboboxValue>
                                        {(et) => (
                                            <span className="truncate">
                                                {et
                                                    ? `${et.typeEngineName} | ${et.powerKw} kW (${et.fuelType})`
                                                    : !model
                                                    ? "D'abord un modèle"
                                                    : etLoading
                                                    ? "Chargement…"
                                                    : "Motorisation"}
                                            </span>
                                        )}
                                    </ComboboxValue>
                                </ComboboxTrigger>
                                <ComboboxContent className="w-(--anchor-width)">
                                    <ComboboxInput showTrigger={false} placeholder="Rechercher une motorisation..." />
                                    <ComboboxEmpty>Aucune motorisation trouvée.</ComboboxEmpty>
                                    <ComboboxList>
                                        {(et) => (
                                            <ComboboxItem key={et.vehicleId} value={et}>
                                                {et.typeEngineName} | {et.powerKw} kW ({et.fuelType})
                                            </ComboboxItem>
                                        )}
                                    </ComboboxList>
                                </ComboboxContent>
                            </Combobox>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bandeau de statut ou d'erreur */}
            {engineType && (
                <div className="mt-6 flex flex-col gap-3">
                    {isSyncing && (
                        <div className="flex items-center gap-3 rounded-md bg-white/10 px-4 py-3 text-sm">
                            <SpinnerIcon />
                            <span className="text-white/80">
                                Synchronisation du catalogue en cours… (Cette opération peut prendre quelques secondes)
                            </span>
                        </div>
                    )}

                    {isSynced && !isSyncing && (
                        <div className="flex items-center gap-2 rounded-md bg-white/10 px-4 py-3 text-sm text-white">
                            <CheckIcon />
                            <span className="font-medium">{vehicleLabel} prêt</span>
                        </div>
                    )}

                    {syncError && !isSyncing && (
                        <div className="flex flex-col gap-2 rounded-md bg-white/10 p-4 text-sm text-white">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 font-medium">
                                    <AlertTriangleIcon />
                                    <span>Erreur lors du chargement des pièces</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setShowErrorDetails(!showErrorDetails)}
                                        className="text-xs text-white/70 hover:text-white underline underline-offset-2"
                                    >
                                        {showErrorDetails ? "Masquer les détails" : "Afficher les détails"}
                                    </button>
                                    <button
                                        onClick={() => triggerSync(engineType)}
                                        className="rounded bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/20 transition-colors"
                                    >
                                        Réessayer
                                    </button>
                                </div>
                            </div>
                            {showErrorDetails && (
                                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-white/10 p-3 font-mono text-xs text-white/70 leading-relaxed">
                                    {syncError.message}
                                </pre>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
