"use client";

import { useState, useMemo } from "react";
import { useManufacturers } from "@/hooks/vehicle/use-manufacturers";
import { useModels } from "@/hooks/vehicle/use-models";
import { useEngineTypes } from "@/hooks/vehicle/use-engine-types";
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
    /** Appelé dès qu'un vehicleId est sélectionné. */
    onVehicleSelected?: (vehicleId: number) => void;
    /** Le véhicule est retenu : la section pièces peut charger. */
    onVehicleConfirmed?: (vehicleId: number, details?: { label: string; plate?: string }) => void;
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



export function VehicleCascade({
    onVehicleSelected,
    onVehicleConfirmed,
}: VehicleCascadeProps) {
    const [manufacturer, setManufacturer] = useState<ApiManufacturer | null>(null);
    const [model, setModel] = useState<ApiModel | null>(null);
    const [engineType, setEngineType] = useState<ApiEngineType | null>(null);

    const {
        data: manufacturers,
        isLoading: mfLoading,
        isError: mfError,
        error: mfErrorObj,
        refetch: refetchManufacturers,
    } = useManufacturers();
    const { data: models, isLoading: mdLoading } = useModels(manufacturer?.manufacturerId ?? null);
    const { data: engineTypes, isLoading: etLoading } = useEngineTypes(model?.modelId ?? null);

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

    function confirmVehicle(selectedEngine: ApiEngineType) {
        if (!manufacturer || !model) return;
        onVehicleSelected?.(selectedEngine.vehicleId);
        onVehicleConfirmed?.(selectedEngine.vehicleId, {
            label: `${manufacturer.manufacturerName} ${model.modelName} | ${selectedEngine.typeEngineName}`,
        });
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

    return (
        <div className="rounded-lg bg-banner-pine p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-0">
                {/* 1. Recherche par plaque d'immatriculation */}
                <div className="flex-1">
                    <p className="mb-3.5 font-heading text-base font-semibold text-white">
                        Recherche par plaque d&apos;immatriculation
                    </p>
                    <VehiclePlateSearch onVehicleConfirmed={onVehicleConfirmed} />
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
                                }}
                                itemToStringValue={(m) => m?.manufacturerName ?? ""}
                                disabled={mfLoading}
                            >
                                <ComboboxTrigger
                                    render={
                                        <Button
                                            variant="outline"
                                            className="w-full justify-between border-transparent bg-white font-normal text-left min-w-0 overflow-hidden text-ink shadow-sm hover:bg-white/90"
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
                                            className="w-full justify-between border-transparent bg-white font-normal text-left min-w-0 overflow-hidden text-ink shadow-sm hover:bg-white/90"
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
                                    if (et && manufacturer && model) confirmVehicle(et);
                                }}
                                itemToStringValue={(et) => (et ? `${et.typeEngineName} | ${et.powerKw} kW (${et.fuelType})` : "")}
                                disabled={!model || etLoading}
                            >
                                <ComboboxTrigger
                                    render={
                                        <Button
                                            variant="outline"
                                            className="w-full justify-between border-transparent bg-white font-normal text-left min-w-0 overflow-hidden text-ink shadow-sm hover:bg-white/90"
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

        </div>
    );
}
