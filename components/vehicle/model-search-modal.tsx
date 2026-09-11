"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useManufacturers } from "@/hooks/vehicle/use-manufacturers";
import { useModels } from "@/hooks/vehicle/use-models";
import { useEngineTypes } from "@/hooks/vehicle/use-engine-types";
import type { ApiManufacturer, ApiModel, ApiEngineType } from "@/lib/rapidapi/types";
import type { PlateSuggestionResult } from "@/hooks/vehicle/use-plate-lookup";
import { CascadeGuide } from "./cascade-guide";
import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxCollection,
    ComboboxGroup,
    ComboboxItem,
    ComboboxLabel,
    ComboboxList,
    ComboboxTrigger,
    ComboboxValue,
} from "@/components/ui/combobox";

interface ModelSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    suggestion?: PlateSuggestionResult | null;
    onVehicleConfirmed?: (vehicleId: number, details?: { label: string; plate?: string }) => void;
}

const POPULAR_MANUFACTURER_NAMES = new Set([
    "RENAULT", "PEUGEOT", "CITROËN", "DACIA", "VOLKSWAGEN",
    "TOYOTA", "FORD", "OPEL", "BMW", "MERCEDES-BENZ",
    "AUDI", "FIAT", "NISSAN", "SEAT", "SKODA", "ŠKODA", "HYUNDAI", "KIA"
]);

const GUIDE_SEEN_KEY = "cascade_guide_seen";
function today(): string {
    return new Date().toISOString().slice(0, 10);
}

export function ModelSearchModal({
    isOpen,
    onClose,
    suggestion,
    onVehicleConfirmed,
}: ModelSearchModalProps) {
    const [pickedManufacturer, setPickedManufacturer] = useState<ApiManufacturer | null>(null);
    const [pickedModel, setPickedModel] = useState<ApiModel | null>(null);
    const [engineType, setEngineType] = useState<ApiEngineType | null>(null);
    const [guideOpen, setGuideOpen] = useState(false);

    const modelFieldRef = useRef<HTMLDivElement | null>(null);
    const engineFieldRef = useRef<HTMLDivElement | null>(null);

    const { data: manufacturers, isLoading: mfLoading } = useManufacturers();
    const uniqueManufacturers = useMemo(() => {
        if (!manufacturers) return [];
        return Array.from(new Map(manufacturers.map((m) => [m.manufacturerId, m])).values());
    }, [manufacturers]);

    const manufacturerGroups = useMemo(() => {
        if (!uniqueManufacturers.length) return [];
        const popular: ApiManufacturer[] = [];
        const others: ApiManufacturer[] = [];

        for (const m of uniqueManufacturers) {
            const nameUpper = m.manufacturerName.toUpperCase();
            if (POPULAR_MANUFACTURER_NAMES.has(nameUpper)) {
                popular.push(m);
            } else {
                others.push(m);
            }
        }

        const groups = [];
        if (popular.length > 0) groups.push({ value: "Constructeurs courants", items: popular });
        if (others.length > 0) groups.push({ value: "Autres constructeurs", items: others });
        return groups;
    }, [uniqueManufacturers]);

    const manufacturer =
        pickedManufacturer ??
        uniqueManufacturers.find((m) => m.manufacturerId === suggestion?.manufacturerId) ??
        null;

    const { data: models, isLoading: mdLoading } = useModels(manufacturer?.manufacturerId ?? null);
    const uniqueModels = useMemo(() => {
        if (!models) return [];
        return Array.from(new Map(models.map((m) => [m.modelId, m])).values());
    }, [models]);

    const onSuggestedBrand =
        suggestion !== null && manufacturer?.manufacturerId === suggestion?.manufacturerId;

    const model =
        pickedModel ??
        (onSuggestedBrand && suggestion?.modelId != null
            ? uniqueModels.find((m) => m.modelId === suggestion?.modelId) ?? null
            : null);

    const { data: engineTypes, isLoading: etLoading } = useEngineTypes(model?.modelId ?? null);
    const uniqueEngineTypes = useMemo(() => {
        if (!engineTypes) return [];
        return Array.from(new Map(engineTypes.map((et) => [et.vehicleId, et])).values());
    }, [engineTypes]);

    const UNKNOWN_FUEL = "Carburant non précisé";
    const engineGroups = useMemo(() => {
        const groups = new Map<string, ApiEngineType[]>();
        for (const engine of uniqueEngineTypes) {
            const fuel = engine.fuelType?.trim() || UNKNOWN_FUEL;
            const bucket = groups.get(fuel);
            if (bucket) bucket.push(engine);
            else groups.set(fuel, [engine]);
        }

        return [...groups.entries()]
            .map(([value, items]) => ({ value, items }))
            .sort((a, b) => {
                if (a.value === UNKNOWN_FUEL) return 1;
                if (b.value === UNKNOWN_FUEL) return -1;
                return a.value.localeCompare(b.value, "fr");
            });
    }, [uniqueEngineTypes]);

    useEffect(() => {
        if (suggestion && isOpen) {
            const timer = setTimeout(() => {
                try {
                    if (localStorage.getItem(GUIDE_SEEN_KEY) !== today()) setGuideOpen(true);
                } catch {
                    setGuideOpen(true);
                }
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [suggestion, isOpen]);

    function dismissGuide(open: boolean) {
        setGuideOpen(open);
        if (open) return;
        try {
            localStorage.setItem(GUIDE_SEEN_KEY, today());
        } catch {
            // Ignorer
        }
    }

    function handleConfirm() {
        if (!manufacturer || !model || !engineType) return;
        onVehicleConfirmed?.(engineType.vehicleId, {
            label: `${manufacturer.manufacturerName} ${model.modelName} | ${engineType.typeEngineName}`,
        });
        onClose();
    }

    if (!isOpen || typeof document === "undefined") return null;

    const missingModel = suggestion !== null && suggestion?.modelId === null;
    const named = [suggestion?.manufacturerName, suggestion?.modelName].filter(Boolean).join(" ");
    const guideHint = missingModel
        ? `Ouvrez cette liste et choisissez le modèle de la ${suggestion?.manufacturerName ?? ""}.`
        : suggestion?.version
          ? `Ouvrez cette liste et cherchez « ${suggestion.version} ».`
          : `Ouvrez cette liste et choisissez la motorisation de la ${named}.`;

    return createPortal(
        <div
            onClick={onClose}
            className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-150 overflow-y-auto"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="relative flex w-full max-w-lg flex-col rounded-xl border border-stroke bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 my-auto"
            >
                {/* En-tête de la modale */}
                <div className="flex items-center justify-between border-b border-stroke px-5 py-4 bg-muted/30">
                    <h3 className="font-heading text-base sm:text-lg font-bold text-ink pr-6">
                        Identifiez votre véhicule pour trouver les pièces compatibles
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md p-1.5 text-txt2 hover:bg-muted hover:text-ink transition-colors cursor-pointer"
                        title="Fermer"
                    >
                        <X className="size-5" />
                    </button>
                </div>

                {/* Saisie par Modèle (3 étapes) */}
                <div className="p-5 flex flex-col gap-4">
                    {suggestion && (
                        <p className="rounded-md bg-pine/10 p-3 text-xs font-medium text-pine border border-pine/20">
                            {named} reconnu depuis la plaque {suggestion.plate}.{" "}
                            {missingModel
                                ? "Choisissez le modèle, puis la motorisation."
                                : "Il ne reste que la motorisation à choisir."}
                        </p>
                    )}

                    <div className="text-xs font-bold uppercase tracking-wider text-txt2 mb-1">
                        PAR MODÈLE
                    </div>

                    {/* Étape 1 : Marque */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-ink">1. Marque</label>
                        <Combobox
                            items={manufacturerGroups}
                            value={manufacturer}
                            onValueChange={(m) => {
                                setPickedManufacturer(m);
                                setPickedModel(null);
                                setEngineType(null);
                            }}
                            itemToStringValue={(m) => m?.manufacturerName ?? ""}
                            disabled={mfLoading}
                        >
                            <ComboboxTrigger
                                render={
                                    <Button
                                        variant="outline"
                                        className="w-full h-12 justify-between border-stroke bg-white font-semibold text-left text-ink shadow-xs hover:border-pine"
                                        disabled={mfLoading}
                                    />
                                }
                            >
                                <ComboboxValue>
                                    {(m) => (
                                        <span className="truncate">
                                            {m ? m.manufacturerName : mfLoading ? "Chargement…" : "Sélectionner une marque"}
                                        </span>
                                    )}
                                </ComboboxValue>
                            </ComboboxTrigger>
                            <ComboboxContent className="min-w-[300px] w-(--anchor-width) z-[120]">
                                <ComboboxInput showTrigger={false} placeholder="Rechercher une marque..." />
                                <ComboboxEmpty>Aucun fabricant trouvé.</ComboboxEmpty>
                                <ComboboxList>
                                    {(group: { value: string; items: ApiManufacturer[] }) => (
                                        <ComboboxGroup key={group.value} items={group.items}>
                                            <ComboboxLabel>{group.value}</ComboboxLabel>
                                            <ComboboxCollection>
                                                {(m: ApiManufacturer) => (
                                                    <ComboboxItem key={m.manufacturerId} value={m} title={m.manufacturerName}>
                                                        <span className="truncate">{m.manufacturerName}</span>
                                                    </ComboboxItem>
                                                )}
                                            </ComboboxCollection>
                                        </ComboboxGroup>
                                    )}
                                </ComboboxList>
                            </ComboboxContent>
                        </Combobox>
                    </div>

                    {/* Étape 2 : Modèle */}
                    <div
                        ref={modelFieldRef}
                        className="flex flex-col gap-1.5"
                    >
                        <label className="text-xs font-semibold text-ink">2. Modèle</label>
                        <Combobox
                            items={uniqueModels}
                            value={model}
                            onValueChange={(m) => {
                                setPickedModel(m);
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
                                        className="w-full h-12 justify-between border-stroke bg-white font-semibold text-left text-ink shadow-xs hover:border-pine disabled:opacity-50"
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
                                                ? "Sélectionnez d'abord une marque"
                                                : mdLoading
                                                ? "Chargement modèles…"
                                                : "Sélectionner un modèle"}
                                        </span>
                                    )}
                                </ComboboxValue>
                            </ComboboxTrigger>
                            <ComboboxContent className="min-w-[320px] w-(--anchor-width) z-[120]">
                                <ComboboxInput showTrigger={false} placeholder="Rechercher un modèle..." />
                                <ComboboxEmpty>Aucun modèle trouvé.</ComboboxEmpty>
                                <ComboboxList>
                                    {(m) => {
                                        const label = `${m.modelName} (${m.modelYearFrom.slice(0, 4)}${m.modelYearTo ? ` – ${m.modelYearTo.slice(0, 4)}` : " →"})`;
                                        return (
                                            <ComboboxItem key={m.modelId} value={m} title={label}>
                                                <span className="line-clamp-2">{label}</span>
                                            </ComboboxItem>
                                        );
                                    }}
                                </ComboboxList>
                            </ComboboxContent>
                        </Combobox>
                    </div>

                    {/* Étape 3 : Motorisation */}
                    <div
                        ref={engineFieldRef}
                        className="flex flex-col gap-1.5"
                    >
                        <label className="text-xs font-semibold text-ink">3. Véhicule / Motorisation</label>
                        <Combobox
                            items={engineGroups}
                            value={engineType}
                            onValueChange={(et) => setEngineType(et)}
                            itemToStringValue={(et) => (et ? `${et.typeEngineName} | ${et.powerKw} kW (${et.fuelType})` : "")}
                            disabled={!model || etLoading}
                        >
                            <ComboboxTrigger
                                render={
                                    <Button
                                        variant="outline"
                                        className="w-full h-12 justify-between border-stroke bg-white font-semibold text-left text-ink shadow-xs hover:border-pine disabled:opacity-50"
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
                                                ? "Sélectionnez d'abord un modèle"
                                                : etLoading
                                                ? "Chargement motorisations…"
                                                : "Sélectionner la motorisation"}
                                        </span>
                                    )}
                                </ComboboxValue>
                            </ComboboxTrigger>
                            <ComboboxContent className="min-w-[320px] w-(--anchor-width) z-[120]">
                                <ComboboxInput showTrigger={false} placeholder="Rechercher une motorisation..." />
                                <ComboboxEmpty>Aucune motorisation trouvée.</ComboboxEmpty>
                                <ComboboxList>
                                    {(group: { value: string; items: ApiEngineType[] }) => (
                                        <ComboboxGroup key={group.value} items={group.items}>
                                            <ComboboxLabel>{group.value}</ComboboxLabel>
                                            <ComboboxCollection>
                                                {(et: ApiEngineType) => {
                                                    const label = `${et.typeEngineName} | ${et.powerKw} kW`;
                                                    return (
                                                        <ComboboxItem key={et.vehicleId} value={et} title={label}>
                                                            <span className="line-clamp-2">{label}</span>
                                                        </ComboboxItem>
                                                    );
                                                }}
                                            </ComboboxCollection>
                                        </ComboboxGroup>
                                    )}
                                </ComboboxList>
                            </ComboboxContent>
                        </Combobox>
                    </div>

                    {/* Bouton GO de confirmation */}
                    <div className="mt-2 flex justify-end">
                        <Button
                            type="button"
                            onClick={handleConfirm}
                            disabled={!manufacturer || !model || !engineType}
                            className="h-12 w-full bg-pine px-8 font-heading font-bold text-white hover:bg-pine-hover transition-colors text-base shadow-md cursor-pointer"
                        >
                            GO
                        </Button>
                    </div>
                </div>
            </div>

            {suggestion && (
                <CascadeGuide
                    open={guideOpen}
                    onOpenChange={dismissGuide}
                    anchor={missingModel ? modelFieldRef : engineFieldRef}
                    title={missingModel ? "Choisissez le modèle" : "Choisissez la motorisation"}
                    description={guideHint}
                />
            )}
        </div>,
        document.body
    );
}
