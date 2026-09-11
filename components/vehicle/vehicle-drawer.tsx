"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Search, ChevronRight, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useManufacturers } from "@/hooks/vehicle/use-manufacturers";
import { useModels } from "@/hooks/vehicle/use-models";
import { useEngineTypes } from "@/hooks/vehicle/use-engine-types";
import type { ApiManufacturer, ApiModel, ApiEngineType } from "@/lib/rapidapi/types";
import type { PlateSuggestionResult } from "@/hooks/vehicle/use-plate-lookup";
import { CascadeGuide } from "./cascade-guide";

interface VehicleDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    suggestion?: PlateSuggestionResult | null;
    onVehicleConfirmed?: (vehicleId: number, details?: { label: string; plate?: string }) => void;
}

export function VehicleDrawer({
    isOpen,
    onClose,
    suggestion,
    onVehicleConfirmed,
}: VehicleDrawerProps) {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [pickedManufacturer, setPickedManufacturer] = useState<ApiManufacturer | null>(null);
    const [pickedModel, setPickedModel] = useState<ApiModel | null>(null);
    const [pickedEngine, setPickedEngine] = useState<ApiEngineType | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [guideOpen, setGuideOpen] = useState(false);

    const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

    // Data hooks
    const { data: manufacturers, isLoading: mfLoading } = useManufacturers();

    const uniqueManufacturers = useMemo(() => {
        if (!manufacturers) return [];
        const list = Array.from(new Map(manufacturers.map((m) => [m.manufacturerId, m])).values());
        // ETF en tout premier s'il existe
        return list.sort((a, b) => {
            const aIsEtf = a.manufacturerName.toUpperCase().startsWith("ETF");
            const bIsEtf = b.manufacturerName.toUpperCase().startsWith("ETF");
            if (aIsEtf && !bIsEtf) return -1;
            if (!aIsEtf && bIsEtf) return 1;
            return a.manufacturerName.localeCompare(b.manufacturerName, "fr");
        });
    }, [manufacturers]);

    // Auto-sync manufacturer when suggestion is provided or drawer opens
    useEffect(() => {
        if (suggestion && isOpen && uniqueManufacturers.length > 0) {
            const matchMf = uniqueManufacturers.find((m) => m.manufacturerId === suggestion.manufacturerId);
            if (matchMf) {
                setPickedManufacturer(matchMf);
                setPickedEngine(null);
            }
        }
    }, [suggestion, isOpen, uniqueManufacturers]);

    const { data: models, isLoading: mdLoading } = useModels(pickedManufacturer?.manufacturerId ?? null);

    const uniqueModels = useMemo(() => {
        if (!models) return [];
        return Array.from(new Map(models.map((m) => [m.modelId, m])).values());
    }, [models]);

    // Auto-sync model and step once models load for suggestion
    useEffect(() => {
        if (suggestion && isOpen && pickedManufacturer && uniqueModels.length > 0) {
            if (suggestion.modelId != null) {
                const matchMd = uniqueModels.find((m) => m.modelId === suggestion.modelId);
                if (matchMd) {
                    setPickedModel(matchMd);
                    setStep(3); // Directement motorisation
                    return;
                }
            }
            setPickedModel(null);
            setStep(2); // Choix modèle
        }
    }, [suggestion, isOpen, pickedManufacturer, uniqueModels]);

    // Reset search when opening/closing
    useEffect(() => {
        if (!isOpen) {
            setSearchQuery("");
            setGuideOpen(false);
        }
    }, [isOpen]);

    const { data: engineTypes, isLoading: etLoading } = useEngineTypes(pickedModel?.modelId ?? null);

    const uniqueEngineTypes = useMemo(() => {
        if (!engineTypes) return [];
        return Array.from(new Map(engineTypes.map((et) => [et.vehicleId, et])).values());
    }, [engineTypes]);

    // Auto-match engine type from suggestion.version if available
    useEffect(() => {
        if (suggestion && isOpen && step === 3 && uniqueEngineTypes.length > 0 && !pickedEngine) {
            const versionStr = suggestion.version?.trim() || "";
            let match: ApiEngineType | undefined;
            if (versionStr) {
                const vLower = versionStr.toLowerCase();
                match = uniqueEngineTypes.find((et) => {
                    const nameLower = et.typeEngineName.toLowerCase();
                    const codeLower = (et.engineCodes || "").toLowerCase();
                    return nameLower.includes(vLower) || vLower.includes(nameLower) || (codeLower && vLower.includes(codeLower));
                });
            }
            if (!match && uniqueEngineTypes.length === 1) {
                match = uniqueEngineTypes[0];
            }
            if (match) {
                setPickedEngine(match);
                // Ouvrir le guide popover pointant sur le bouton de confirmation
                setTimeout(() => setGuideOpen(true), 150);
            }
        }
    }, [suggestion, isOpen, step, uniqueEngineTypes, pickedEngine]);

    // Filter lists by search query
    const filteredManufacturers = useMemo(() => {
        if (!searchQuery.trim()) return uniqueManufacturers;
        const q = searchQuery.toLowerCase().trim();
        return uniqueManufacturers.filter((m) => m.manufacturerName.toLowerCase().includes(q));
    }, [uniqueManufacturers, searchQuery]);

    const filteredModels = useMemo(() => {
        if (!searchQuery.trim()) return uniqueModels;
        const q = searchQuery.toLowerCase().trim();
        return uniqueModels.filter((m) => m.modelName.toLowerCase().includes(q));
    }, [uniqueModels, searchQuery]);

    const filteredEngineTypes = useMemo(() => {
        if (!searchQuery.trim()) return uniqueEngineTypes;
        const q = searchQuery.toLowerCase().trim();
        return uniqueEngineTypes.filter(
            (et) =>
                et.typeEngineName.toLowerCase().includes(q) ||
                (et.powerKw && String(et.powerKw).includes(q)) ||
                (et.fuelType && et.fuelType.toLowerCase().includes(q))
        );
    }, [uniqueEngineTypes, searchQuery]);

    function handleSelectManufacturer(m: ApiManufacturer) {
        setPickedManufacturer(m);
        setPickedModel(null);
        setPickedEngine(null);
        setSearchQuery("");
        setStep(2);
    }

    function handleSelectModel(m: ApiModel) {
        setPickedModel(m);
        setPickedEngine(null);
        setSearchQuery("");
        setStep(3);
    }

    function handleSelectEngine(et: ApiEngineType) {
        setPickedEngine(et);
        if (suggestion) {
            setGuideOpen(true);
        }
    }

    function handleConfirm() {
        if (!pickedManufacturer || !pickedModel || !pickedEngine) return;
        setGuideOpen(false);
        onVehicleConfirmed?.(pickedEngine.vehicleId, {
            label: `${pickedManufacturer.manufacturerName} ${pickedModel.modelName} | ${pickedEngine.typeEngineName}`,
        });
        onClose();
    }

    function handleBack() {
        setSearchQuery("");
        setGuideOpen(false);
        if (step === 3) setStep(2);
        else if (step === 2) setStep(1);
    }

    if (!isOpen || typeof document === "undefined") return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex justify-end animate-in fade-in duration-200">
            {/* Backdrop sombre flouté */}
            <div
                onClick={onClose}
                className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            />

            {/* Tiroir coulissant venant de la droite */}
            <div className="relative z-10 flex h-full w-full max-w-md flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-300">
                {/* En-tête du tiroir */}
                <div className="flex items-center justify-between border-b border-stroke px-5 py-4 bg-muted/20">
                    <h2 className="font-heading text-lg font-bold text-ink">
                        Recherche avec véhicule
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-txt2 hover:bg-muted hover:text-ink transition-colors cursor-pointer"
                        title="Fermer"
                    >
                        <X className="size-5" />
                    </button>
                </div>

                {/* Timeline Stepper (En-tête des étapes) */}
                <div className="border-b border-stroke bg-muted/10 px-5 pt-4 pb-3">
                    <div className="relative px-2">
                        {/* Ligne horizontale reliant les puces (centrée verticalement sur top-3.5) */}
                        <div className="absolute top-3.5 left-8 right-8 h-0.5 bg-stroke -z-0" />
                        <div
                            className="absolute top-3.5 left-8 h-0.5 bg-pine transition-all duration-300 -z-0"
                            style={{
                                width: step === 1 ? "0%" : step === 2 ? "50%" : "100%",
                            }}
                        />

                        {/* Cercles des étapes + Libellés sous les cercles */}
                        <div className="relative z-10 flex justify-between">
                            {/* Étape 1 : Marque */}
                            <button
                                type="button"
                                onClick={() => {
                                    setSearchQuery("");
                                    setStep(1);
                                }}
                                className="flex flex-col items-center group cursor-pointer"
                            >
                                <div
                                    className={`size-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                                        step === 1
                                            ? "bg-pine text-white ring-4 ring-pine/20 shadow-xs"
                                            : step > 1
                                              ? "bg-pine text-white"
                                              : "bg-white text-txt2 border-2 border-stroke"
                                    }`}
                                >
                                    1
                                </div>
                                <span
                                    className={`mt-1.5 text-xs font-semibold transition-colors ${
                                        step === 1 ? "text-pine font-bold" : "text-txt1"
                                    }`}
                                >
                                    Marque
                                </span>
                            </button>

                            {/* Étape 2 : Modèle */}
                            <button
                                type="button"
                                onClick={() => {
                                    if (pickedManufacturer) {
                                        setSearchQuery("");
                                        setStep(2);
                                    }
                                }}
                                disabled={!pickedManufacturer}
                                className="flex flex-col items-center group cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <div
                                    className={`size-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                                        step === 2
                                            ? "bg-pine text-white ring-4 ring-pine/20 shadow-xs"
                                            : step > 2
                                              ? "bg-pine text-white"
                                              : "bg-white text-txt2 border-2 border-stroke"
                                    }`}
                                >
                                    2
                                </div>
                                <span
                                    className={`mt-1.5 text-xs font-semibold transition-colors ${
                                        step === 2 ? "text-pine font-bold" : "text-txt1"
                                    }`}
                                >
                                    Modèle
                                </span>
                            </button>

                            {/* Étape 3 : Motorisation */}
                            <button
                                type="button"
                                onClick={() => {
                                    if (pickedModel) {
                                        setSearchQuery("");
                                        setStep(3);
                                    }
                                }}
                                disabled={!pickedModel}
                                className="flex flex-col items-center group cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <div
                                    className={`size-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                                        step === 3
                                            ? "bg-pine text-white ring-4 ring-pine/20 shadow-xs"
                                            : "bg-white text-txt2 border-2 border-stroke"
                                    }`}
                                >
                                    3
                                </div>
                                <span
                                    className={`mt-1.5 text-xs font-semibold transition-colors ${
                                        step === 3 ? "text-pine font-bold" : "text-txt1"
                                    }`}
                                >
                                    Motorisation
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Saisie de recherche dynamique pour l'étape active */}
                <div className="p-4 border-b border-stroke bg-white">
                    <p className="mb-2 text-xs font-medium text-txt2">
                        {step === 1 && "Sélectionnez la marque pour identifier votre véhicule"}
                        {step === 2 && `Sélectionnez le modèle (${pickedManufacturer?.manufacturerName ?? ""})`}
                        {step === 3 && `Sélectionnez la motorisation pour ${pickedModel?.modelName ?? ""}`}
                    </p>
                    <div className="relative">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={
                                step === 1
                                    ? "Rechercher une marque..."
                                    : step === 2
                                      ? "Rechercher un modèle..."
                                      : "Rechercher une motorisation..."
                            }
                            className="w-full h-11 pl-3.5 pr-10 rounded-md border border-stroke bg-surface-base text-sm text-ink placeholder:text-txt2 focus:border-pine focus:outline-none focus:ring-1 focus:ring-pine transition-all"
                        />
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-txt2 pointer-events-none" />
                    </div>
                </div>

                {/* Zone de défilement du contenu des éléments */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Encadré d'orientation si suggestion active */}
                    {suggestion && (
                        <div className="rounded-lg border border-pine/30 bg-pine/10 p-3 text-xs text-pine shadow-xs">
                            <div className="font-bold flex items-center gap-1.5">
                                <CheckCircle2 className="size-4 text-pine shrink-0" />
                                <span>Plaque {suggestion.plate} :</span>
                                <span className="underline font-extrabold">
                                    {suggestion.version || suggestion.modelName || "Motorisation requise"}
                                </span>
                            </div>
                            <p className="mt-1 text-[11px] text-pine/90">
                                {pickedEngine
                                    ? `La motorisation correspondant à "${suggestion.version || suggestion.modelName}" a été pré-sélectionnée.`
                                    : `Veuillez cliquer sur la motorisation correspondant à "${suggestion.version || suggestion.modelName}" ci-dessous.`}
                            </p>
                        </div>
                    )}

                    {/* Étape 1 : Marques */}
                    {step === 1 && (
                        <div>
                            {mfLoading ? (
                                <div className="py-8 text-center text-sm text-txt2">Chargement des marques…</div>
                            ) : filteredManufacturers.length === 0 ? (
                                <div className="py-8 text-center text-sm text-txt2">Aucune marque trouvée.</div>
                            ) : (
                                <div className="divide-y divide-stroke/60 rounded-lg border border-stroke bg-white">
                                    {filteredManufacturers.map((m) => {
                                        const isEtf = m.manufacturerName.toUpperCase().startsWith("ETF");
                                        const isSelected = pickedManufacturer?.manufacturerId === m.manufacturerId;
                                        return (
                                            <button
                                                key={m.manufacturerId}
                                                type="button"
                                                onClick={() => handleSelectManufacturer(m)}
                                                className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold transition-colors cursor-pointer ${
                                                    isSelected
                                                        ? "bg-pine/10 text-pine font-bold"
                                                        : "text-ink hover:bg-muted/40"
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 truncate">
                                                    <span className="truncate">{m.manufacturerName}</span>
                                                    {isEtf && (
                                                        <span className="rounded bg-pine px-1.5 py-0.5 font-heading text-[9px] font-bold text-white uppercase">
                                                            Marque partenaire
                                                        </span>
                                                    )}
                                                </div>
                                                <ChevronRight className="size-4 text-txt2 shrink-0" />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Étape 2 : Modèles */}
                    {step === 2 && (
                        <div>
                            {mdLoading ? (
                                <div className="py-8 text-center text-sm text-txt2">Chargement des modèles…</div>
                            ) : filteredModels.length === 0 ? (
                                <div className="py-8 text-center text-sm text-txt2">Aucun modèle trouvé.</div>
                            ) : (
                                <div className="divide-y divide-stroke/60 rounded-lg border border-stroke bg-white">
                                    {filteredModels.map((m) => {
                                        const yearLabel = `(${m.modelYearFrom.slice(0, 4)}${
                                            m.modelYearTo ? ` – ${m.modelYearTo.slice(0, 4)}` : " →"
                                        })`;
                                        const isSelected = pickedModel?.modelId === m.modelId;
                                        return (
                                            <button
                                                key={m.modelId}
                                                type="button"
                                                onClick={() => handleSelectModel(m)}
                                                className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold transition-colors cursor-pointer ${
                                                    isSelected ? "bg-pine/10 text-pine font-bold" : "text-ink hover:bg-muted/40"
                                                }`}
                                            >
                                                <div className="flex flex-col min-w-0 pr-2">
                                                    <span className="truncate">{m.modelName}</span>
                                                    <span className="text-xs font-normal text-txt2">{yearLabel}</span>
                                                </div>
                                                <ChevronRight className="size-4 text-txt2 shrink-0" />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Étape 3 : Motorisations */}
                    {step === 3 && (
                        <div>
                            {etLoading ? (
                                <div className="py-8 text-center text-sm text-txt2">Chargement des motorisations…</div>
                            ) : filteredEngineTypes.length === 0 ? (
                                <div className="py-8 text-center text-sm text-txt2">Aucune motorisation trouvée.</div>
                            ) : (
                                <div className="space-y-2">
                                    {filteredEngineTypes.map((et) => {
                                        const isSelected = pickedEngine?.vehicleId === et.vehicleId;
                                        const versionStr = suggestion?.version?.toLowerCase() || "";
                                        const isRecommended =
                                            Boolean(versionStr) &&
                                            (et.typeEngineName.toLowerCase().includes(versionStr) ||
                                                versionStr.includes(et.typeEngineName.toLowerCase()) ||
                                                (et.engineCodes && versionStr.includes(et.engineCodes.toLowerCase())));

                                        return (
                                            <button
                                                key={et.vehicleId}
                                                type="button"
                                                onClick={() => handleSelectEngine(et)}
                                                className={`flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm transition-all cursor-pointer ${
                                                    isSelected
                                                        ? "border-pine bg-pine/10 text-pine font-bold shadow-xs ring-1 ring-pine"
                                                        : isRecommended
                                                          ? "border-pine/50 bg-pine/5 text-ink hover:bg-pine/10"
                                                          : "border-stroke bg-white text-ink hover:border-pine/50 hover:bg-muted/30"
                                                }`}
                                            >
                                                <div className="flex flex-col min-w-0 pr-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-sm leading-tight">
                                                            {et.typeEngineName}
                                                        </span>
                                                        {isRecommended && (
                                                            <span className="rounded bg-pine/20 px-1.5 py-0.5 text-[10px] font-bold text-pine">
                                                                Plaque
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-txt2 mt-0.5">
                                                        {et.powerKw ? `${et.powerKw} kW` : ""} {et.fuelType ? `• ${et.fuelType}` : ""}
                                                    </span>
                                                </div>
                                                <div
                                                    className={`size-5 rounded-full border flex items-center justify-center shrink-0 ${
                                                        isSelected
                                                            ? "border-pine bg-pine text-white"
                                                            : "border-stroke bg-white"
                                                    }`}
                                                >
                                                    {isSelected && <div className="size-2 rounded-full bg-white" />}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Pied de page fixe (Sticky Footer) */}
                <div className="border-t border-stroke bg-white p-4 flex items-center gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleBack}
                        disabled={step === 1}
                        className="h-12 px-4 border-stroke font-semibold text-ink hover:bg-muted disabled:opacity-40 cursor-pointer"
                    >
                        <ArrowLeft className="size-4 mr-1.5" />
                        Retour
                    </Button>

                    <Button
                        ref={confirmBtnRef}
                        type="button"
                        onClick={handleConfirm}
                        disabled={!pickedEngine}
                        className="flex-1 h-12 bg-pine px-4 font-heading font-bold text-white hover:bg-pine-hover disabled:opacity-50 transition-colors shadow-md cursor-pointer text-sm"
                    >
                        Rechercher avec ce véhicule
                    </Button>
                </div>
            </div>

            {/* Popover de guidage pointant sur le bouton de confirmation */}
            <CascadeGuide
                open={guideOpen && Boolean(pickedEngine)}
                onOpenChange={setGuideOpen}
                anchor={confirmBtnRef}
                side="top"
                title="Finaliser la recherche"
                description="Cliquez ici pour charger les pièces."
            />
        </div>,
        document.body
    );
}
