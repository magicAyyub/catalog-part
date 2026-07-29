"use client";

import { useState, useMemo } from "react";
import { useManufacturers } from "@/hooks/vehicle/use-manufacturers";
import { useModels } from "@/hooks/vehicle/use-models";
import { useEngineTypes } from "@/hooks/vehicle/use-engine-types";
import { useSyncVehicle } from "@/hooks/parts/use-sync-vehicle";
import type { ApiManufacturer, ApiModel, ApiEngineType } from "@/lib/rapidapi/types";
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
    /** Appelé dès qu'un vehicleId est sélectionné (avant sync) */
    onVehicleSelected?: (vehicleId: number) => void;
    /** Appelé quand la sync SQLite est terminée (status synced ou cached) */
    onSyncComplete?: (vehicleId: number) => void;
    /** Callback d'erreur de synchronisation pour le composant parent */
    onSyncError?: (error: Error | null) => void;
}

// ─── Icônes SVG sobres (remplaçant les émojis) ────────────────────────────────

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

export function VehicleCascade({ onVehicleSelected, onSyncComplete, onSyncError }: VehicleCascadeProps) {
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

    // Déduplication des listes avec useMemo pour éviter le re-calcul et les changements de référence
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
                    onSyncComplete?.(data.vehicleId);
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
        <div className="flex flex-col gap-6">
            {/* Sélecteurs en ligne avec min-w-0 pour éviter le dépassement flex */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                {/* Fabricant */}
                <div className="flex flex-1 flex-col gap-1.5 min-w-0">
                    <label className="text-sm font-medium">
                        Fabricant
                    </label>
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
                                    className="w-full justify-between font-normal text-left min-w-0 border-input shadow-xs"
                                    disabled={mfLoading}
                                />
                            }
                        >
                            <ComboboxValue>
                                {(m) => m ? m.manufacturerName : (mfLoading ? "Chargement…" : "Sélectionner un fabricant")}
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
                    <label className="text-sm font-medium">
                        Modèle
                    </label>
                    <Combobox
                        items={uniqueModels}
                        value={model}
                        onValueChange={(m) => {
                            setModel(m);
                            setEngineType(null);
                            resetSync();
                            onSyncError?.(null);
                        }}
                        itemToStringValue={(m) => m ? `${m.modelName} (${m.modelYearFrom.slice(0, 4)}${m.modelYearTo ? ` – ${m.modelYearTo.slice(0, 4)}` : " →"})` : ""}
                        disabled={!manufacturer || mdLoading}
                    >
                        <ComboboxTrigger
                            render={
                                <Button
                                    variant="outline"
                                    className="w-full justify-between font-normal text-left min-w-0 border-input shadow-xs"
                                    disabled={!manufacturer || mdLoading}
                                />
                            }
                        >
                            <ComboboxValue>
                                {(m) => m ? `${m.modelName} (${m.modelYearFrom.slice(0, 4)}${m.modelYearTo ? ` – ${m.modelYearTo.slice(0, 4)}` : " →"})` : (!manufacturer ? "D'abord un fabricant" : (mdLoading ? "Chargement…" : "Sélectionner un modèle"))}
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
                    <label className="text-sm font-medium">
                        Motorisation
                    </label>
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
                        itemToStringValue={(et) => et ? `${et.typeEngineName} | ${et.powerKw} kW (${et.fuelType})` : ""}
                        disabled={!model || etLoading}
                    >
                        <ComboboxTrigger
                            render={
                                <Button
                                    variant="outline"
                                    className="w-full justify-between font-normal text-left min-w-0 border-input shadow-xs"
                                    disabled={!model || etLoading}
                                />
                            }
                        >
                            <ComboboxValue>
                                {(et) => et ? `${et.typeEngineName} | ${et.powerKw} kW (${et.fuelType})` : (!model ? "D'abord un modèle" : (etLoading ? "Chargement…" : "Sélectionner une motorisation"))}
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

            {/* Bandeau de statut ou d'erreur */}
            {engineType && (
                <div className="flex flex-col gap-3">
                    {isSyncing && (
                        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
                            <SpinnerIcon />
                            <span className="text-muted-foreground">Synchronisation du catalogue en cours… (Cette opération peut prendre quelques secondes)</span>
                        </div>
                    )}

                    {isSynced && !isSyncing && (
                        <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-3 text-sm text-green-700 dark:text-green-400">
                            <CheckIcon />
                            <span className="font-medium">{vehicleLabel} prêt</span>
                        </div>
                    )}

                    {syncError && !isSyncing && (
                        <div className="flex flex-col gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-foreground">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 font-medium text-destructive">
                                    <AlertTriangleIcon />
                                    <span>Erreur lors du chargement des pièces</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setShowErrorDetails(!showErrorDetails)}
                                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                                    >
                                        {showErrorDetails ? "Masquer les détails" : "Afficher les détails"}
                                    </button>
                                    <button
                                        onClick={() => triggerSync(engineType)}
                                        className="rounded bg-destructive/10 px-2.5 py-1 text-xs font-semibold hover:bg-destructive/20 text-destructive transition-colors"
                                    >
                                        Réessayer
                                    </button>
                                </div>
                            </div>
                            {showErrorDetails && (
                                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-muted/50 border border-border/40 p-3 font-mono text-xs text-muted-foreground leading-relaxed">
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
