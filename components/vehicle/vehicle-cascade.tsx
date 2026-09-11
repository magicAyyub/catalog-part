"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { VehiclePlateSearch } from "./vehicle-plate-search";
import { VehicleReferenceSearch } from "./vehicle-reference-search";
import { VehicleDrawer } from "./vehicle-drawer";
import type { PlateSuggestionResult } from "@/hooks/vehicle/use-plate-lookup";

interface VehicleCascadeProps {
    /** Appelé dès qu'un vehicleId est sélectionné. */
    onVehicleSelected?: (vehicleId: number) => void;
    /** Le véhicule est retenu : la section pièces peut charger. */
    onVehicleConfirmed?: (vehicleId: number, details?: { label: string; plate?: string }) => void;
}

export function VehicleCascade({
    onVehicleSelected: _onVehicleSelected,
    onVehicleConfirmed,
}: VehicleCascadeProps) {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [suggestion, setSuggestion] = useState<PlateSuggestionResult | null>(null);

    function handleCascadeSuggested(next: PlateSuggestionResult) {
        setSuggestion(next);
        setIsDrawerOpen(true);
    }

    return (
        <div className="rounded-lg bg-banner-pine p-4 sm:p-6">
            {suggestion && (
                <p className="mb-3 rounded-md bg-white/15 px-3 py-2 text-xs font-semibold text-white flex items-center justify-between border border-white/20 shadow-xs">
                    <span>
                        cliquez pour afficher les pièces.
                    </span>
                    <button
                        type="button"
                        onClick={() => setIsDrawerOpen(true)}
                        className="ml-2 font-bold underline hover:text-white/90 cursor-pointer shrink-0"
                    >
                        Valider la recherche &rarr;
                    </button>
                </p>
            )}

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-0">
                {/* 1. Recherche avec référence */}
                <div className="lg:flex-[2.2] min-w-0">
                    <p className="mb-2 sm:mb-3 font-heading text-sm sm:text-base font-semibold text-white">
                        Recherche avec référence
                    </p>
                    <VehicleReferenceSearch />
                </div>

                {/* Séparateur "OU" 1 */}
                <div className="flex items-center justify-center py-1 lg:px-3 lg:py-0">
                    <div className="flex w-full items-center gap-2 lg:hidden">
                        <div className="h-px flex-1 bg-white/25" />
                        <span className="flex size-6 items-center justify-center rounded-full border border-white/30 text-[9px] font-bold text-white bg-banner-pine">
                            OU
                        </span>
                        <div className="h-px flex-1 bg-white/25" />
                    </div>
                    <div className="hidden lg:flex lg:h-full lg:flex-col lg:items-center">
                        <div className="w-px h-6 bg-white/25" />
                        <span className="my-1.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-white/30 text-[10px] font-bold text-white bg-banner-pine">
                            OU
                        </span>
                        <div className="w-px h-6 bg-white/25" />
                    </div>
                </div>

                {/* 2. Recherche avec IMMAT */}
                <div className="lg:flex-[2.2] min-w-0">
                    <p className="mb-2 sm:mb-3 font-heading text-sm sm:text-base font-semibold text-white">
                        Recherche avec IMMAT
                    </p>
                    <VehiclePlateSearch
                        onVehicleConfirmed={onVehicleConfirmed}
                        onCascadeSuggested={handleCascadeSuggested}
                    />
                </div>

                {/* Séparateur "OU" 2 */}
                <div className="flex items-center justify-center py-1 lg:px-3 lg:py-0">
                    <div className="flex w-full items-center gap-2 lg:hidden">
                        <div className="h-px flex-1 bg-white/25" />
                        <span className="flex size-6 items-center justify-center rounded-full border border-white/30 text-[9px] font-bold text-white bg-banner-pine">
                            OU
                        </span>
                        <div className="h-px flex-1 bg-white/25" />
                    </div>
                    <div className="hidden lg:flex lg:h-full lg:flex-col lg:items-center">
                        <div className="w-px h-6 bg-white/25" />
                        <span className="my-1.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-white/30 text-[10px] font-bold text-white bg-banner-pine">
                            OU
                        </span>
                        <div className="w-px h-6 bg-white/25" />
                    </div>
                </div>

                {/* 3. Recherche avec véhicule */}
                <div className="lg:flex-[1.4] min-w-0">
                    <p className="mb-2 sm:mb-3 font-heading text-sm sm:text-base font-semibold text-white">
                        Recherche avec véhicule
                    </p>
                    <button
                        type="button"
                        onClick={() => setIsDrawerOpen(true)}
                        className="flex h-12 w-full items-center justify-between rounded-md border-2 border-transparent bg-white px-3.5 text-sm font-semibold text-ink shadow-sm transition-all hover:bg-white/95 focus:outline-none focus:ring-2 focus:ring-pine/30 cursor-pointer"
                    >
                        <span className="truncate">Marque véhicule</span>
                        <ChevronRight className="size-4 shrink-0 text-txt2 ml-2" />
                    </button>
                </div>
            </div>

            {/* Tiroir coulissant depuis la droite */}
            <VehicleDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                suggestion={suggestion}
                onVehicleConfirmed={onVehicleConfirmed}
            />
        </div>
    );
}
