"use client";

import { useState, useMemo, useRef } from "react";
import { useManufacturers } from "@/hooks/vehicle/use-manufacturers";
import { useModels } from "@/hooks/vehicle/use-models";
import { useEngineTypes } from "@/hooks/vehicle/use-engine-types";
import type { ApiManufacturer, ApiModel, ApiEngineType } from "@/lib/rapidapi/types";
import { VehiclePlateSearch } from "./vehicle-plate-search";
import { CascadeGuide } from "./cascade-guide";
import type { PlateSuggestionResult } from "@/hooks/vehicle/use-plate-lookup";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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



const GUIDE_SEEN_KEY = "cascade_guide_seen";

/** Le guide revient chaque jour : une fois suffit à l'apprendre, pas à le retenir. */
function today(): string {
    return new Date().toISOString().slice(0, 10);
}

import { SearchModal } from "@/components/layout/search-modal";
import { Search, ChevronDown } from "lucide-react";

const POPULAR_MANUFACTURER_NAMES = new Set([
    "RENAULT", "PEUGEOT", "CITROËN", "DACIA", "VOLKSWAGEN",
    "TOYOTA", "FORD", "OPEL", "BMW", "MERCEDES-BENZ",
    "AUDI", "FIAT", "NISSAN", "SEAT", "SKODA", "ŠKODA", "HYUNDAI", "KIA"
]);

export function VehicleCascade({
    onVehicleSelected,
    onVehicleConfirmed,
}: VehicleCascadeProps) {
    const [modelSearchOpen, setModelSearchOpen] = useState(false);
    const [pickedManufacturer, setPickedManufacturer] = useState<ApiManufacturer | null>(null);
    const [pickedModel, setPickedModel] = useState<ApiModel | null>(null);
    const [engineType, setEngineType] = useState<ApiEngineType | null>(null);
    const [suggestion, setSuggestion] = useState<PlateSuggestionResult | null>(null);
    const [guideOpen, setGuideOpen] = useState(false);

    const modelFieldRef = useRef<HTMLDivElement | null>(null);
    const engineFieldRef = useRef<HTMLDivElement | null>(null);

    const {
        data: manufacturers,
        isLoading: mfLoading,
        isError: mfError,
        error: mfErrorObj,
        refetch: refetchManufacturers,
    } = useManufacturers();
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
        if (popular.length > 0) {
            groups.push({ value: "Constructeurs courants", items: popular });
        }
        if (others.length > 0) {
            groups.push({ value: "Autres constructeurs", items: others });
        }
        return groups;
    }, [uniqueManufacturers]);

    // Un choix manuel prime toujours. Sinon la suggestion tient, dès que la liste
    // qui la porte est arrivée : on dérive plutôt que de recopier dans un état.
    const manufacturer =
        pickedManufacturer ??
        uniqueManufacturers.find((m) => m.manufacturerId === suggestion?.manufacturerId) ??
        null;

    const { data: models, isLoading: mdLoading } = useModels(manufacturer?.manufacturerId ?? null);

    const uniqueModels = useMemo(() => {
        if (!models) return [];
        return Array.from(new Map(models.map((m) => [m.modelId, m])).values());
    }, [models]);

    // Le modèle suggéré ne vaut que sous la marque suggérée : dès que le comptoir
    // change de marque, la liste n'est plus la même.
    const onSuggestedBrand =
        suggestion !== null && manufacturer?.manufacturerId === suggestion.manufacturerId;

    const model =
        pickedModel ??
        (onSuggestedBrand && suggestion.modelId !== null
            ? uniqueModels.find((m) => m.modelId === suggestion.modelId) ?? null
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

    function handleCascadeSuggested(next: PlateSuggestionResult) {
        setPickedManufacturer(null);
        setPickedModel(null);
        setEngineType(null);
        setSuggestion(next);
        setModelSearchOpen(true);

        try {
            if (localStorage.getItem(GUIDE_SEEN_KEY) !== today()) setGuideOpen(true);
        } catch {
            setGuideOpen(true);
        }
    }

    function dismissGuide(open: boolean) {
        setGuideOpen(open);
        if (open) return;
        try {
            localStorage.setItem(GUIDE_SEEN_KEY, today());
        } catch {
            // Ignorer
        }
    }

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
                    Une erreur s&apos;est produite lors de la connexion au service de catalogue.
                </p>
                {showMfErrorDetails && (
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-muted/50 border border-border/40 p-3 font-mono text-xs text-muted-foreground leading-relaxed">
                        {mfErrorObj instanceof Error ? mfErrorObj.message : "Erreur inconnue"}
                    </pre>
                )}
            </div>
        );
    }

    const missingModel = suggestion !== null && suggestion.modelId === null;
    const named = [suggestion?.manufacturerName, suggestion?.modelName].filter(Boolean).join(" ");
    const supplierEngine = suggestion?.version
        ? ` Le fournisseur annonce « ${suggestion.version} ».`
        : "";

    const guideHint = missingModel
        ? `Ouvrez cette liste et choisissez le modèle de la ${suggestion?.manufacturerName ?? ""}.`
        : suggestion?.version
          ? `Ouvrez cette liste et cherchez « ${suggestion.version} ».`
          : `Ouvrez cette liste et choisissez la motorisation de la ${named}.`;

    const showModelSection = modelSearchOpen;

    return (
        <div className="rounded-lg bg-banner-pine p-6">
            {suggestion && (
                <p className="mb-4 rounded-md bg-white/10 p-2.5 text-xs font-medium text-white">
                    {named} reconnu depuis la plaque {suggestion.plate}.{" "}
                    {missingModel
                        ? "Choisissez le modèle, puis la motorisation."
                        : "Il ne reste que la motorisation à choisir."}
                    {supplierEngine}
                </p>
            )}

            <div className="flex flex-col gap-6 xl:flex-row xl:items-stretch xl:gap-0">
                {/* 1. Recherche par plaque d'immatriculation */}
                <div className="flex-1 min-w-0">
                    <p className="mb-3.5 font-heading text-base font-semibold text-white">
                        Recherche par plaque d&apos;immatriculation
                    </p>
                    <VehiclePlateSearch
                        onVehicleConfirmed={onVehicleConfirmed}
                        onCascadeSuggested={handleCascadeSuggested}
                    />
                </div>

                {/* Séparateur "OU" */}
                <div className="flex items-center justify-center py-2 xl:px-4 xl:py-0">
                    <div className="flex w-full items-center gap-3 xl:hidden">
                        <div className="h-px flex-1 bg-white/20" />
                        <span className="text-xs font-bold text-white/50">OU</span>
                        <div className="h-px flex-1 bg-white/20" />
                    </div>
                    <div className="hidden xl:flex xl:h-full xl:flex-col xl:items-center">
                        <div className="w-px flex-1 bg-white/20" />
                        <span className="my-3 flex size-8 shrink-0 items-center justify-center rounded-full border border-white/30 text-[11px] font-bold text-white">
                            OU
                        </span>
                        <div className="w-px flex-1 bg-white/20" />
                    </div>
                </div>

                {/* 2. Recherche par référence */}
                <div className="flex-1 min-w-0">
                    <p className="mb-3.5 font-heading text-base font-semibold text-white">
                        Recherche par référence
                    </p>
                    <SearchModal
                        trigger={
                            <div className="flex h-12 w-full items-center justify-between rounded-md border-2 border-transparent bg-white px-3.5 text-sm shadow-sm transition-colors hover:bg-white/90">
                                <div className="flex items-center gap-2.5 truncate text-ink">
                                    <Search className="size-4 shrink-0 text-pine" />
                                    <span className="truncate font-medium text-txt2">
                                        Référence, EAN, WVA ou OE…
                                    </span>
                                </div>
                                <kbd className="hidden sm:inline-flex items-center rounded border border-stroke bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold text-txt2 shadow-2xs">
                                    Ctrl K
                                </kbd>
                            </div>
                        }
                    />
                </div>
            </div>

            {/* 3. Recherche par modèle (Dépliable comme option avancée) */}
            <div className="mt-5 pt-4 border-t border-white/15 flex flex-col gap-3">
                <button
                    type="button"
                    onClick={() => setModelSearchOpen(!modelSearchOpen)}
                    className="flex items-center justify-between w-full rounded-md bg-white/10 hover:bg-white/15 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer"
                >
                    <span>Recherche par modèle (Marque, Modèle, Motorisation)</span>
                    <ChevronDown className={cn("size-4 transition-transform duration-200", showModelSection && "rotate-180")} />
                </button>

                {showModelSection && (
                    <div className="pt-2 animate-in fade-in duration-150">
                        <p className="mb-3.5 font-heading text-base font-semibold text-white">
                            Recherche par modèle
                        </p>
                        <div className="flex flex-col gap-2.5 sm:flex-row">
                            {/* Fabricant */}
                        <div className="flex flex-1 flex-col gap-1.5 min-w-0">
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
                                            className="w-full h-12 justify-between border-transparent bg-white font-normal text-left min-w-0 overflow-hidden text-ink shadow-sm hover:bg-white/90"
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
                                <ComboboxContent className="min-w-[340px] w-(--anchor-width)">
                                    <ComboboxInput showTrigger={false} placeholder="Rechercher un fabricant..." />
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

                        {/* Modèle */}
                        <div
                            ref={modelFieldRef}
                            className={cn(
                                "flex flex-1 flex-col gap-1.5 min-w-0",
                                guideOpen && missingModel && "relative z-50"
                            )}
                        >
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
                                            className="w-full h-12 justify-between border-transparent bg-white font-normal text-left min-w-0 overflow-hidden text-ink shadow-sm hover:bg-white/90"
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
                                <ComboboxContent className="min-w-[380px] w-(--anchor-width)">
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

                        {/* Motorisation */}
                        <div
                            ref={engineFieldRef}
                            className={cn(
                                "flex flex-1 flex-col gap-1.5 min-w-0",
                                guideOpen && !missingModel && "relative z-50"
                            )}
                        >
                            <Combobox
                                items={engineGroups}
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
                                            className="w-full h-12 justify-between border-transparent bg-white font-normal text-left min-w-0 overflow-hidden text-ink shadow-sm hover:bg-white/90"
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
                                <ComboboxContent className="min-w-[380px] w-(--anchor-width)">
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
                    </div>
                </div>
            )}
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
        </div>
    );
}
