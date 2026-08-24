"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type PlateLookupResult, formatPlateInput } from "@/lib/vehicle/plate-resolver";

export function VehiclePlateSearch() {
    const [rawInput, setRawInput] = useState("");
    const isLoadingPlate = false;
    const [plateError, setPlateError] = useState<string | null>(null);
    const [foundVehicle, setFoundVehicle] = useState<PlateLookupResult | null>(null);

    // La recherche par plaque est mise de côté : sa route et sa résolution sont
    // dans parked/plate, en attente d'être rebâties sur le nouveau schéma. Le
    // formulaire reste affiché, il n'appelle simplement plus le serveur.
    const isSyncing = false;

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

    function handleSearch(e?: React.FormEvent) {
        e?.preventDefault();

        if (!rawInput.trim()) {
            setPlateError("Veuillez entrer un numéro d'immatriculation.");
            return;
        }

        console.log("Recherche par plaque désactivée pour le moment :", rawInput);
        setFoundVehicle(null);
        setPlateError("La recherche par plaque est temporairement indisponible.");
    }

    return (
        <div className="flex flex-col gap-3">
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-stretch gap-2.5">
                {/* Plaque d'immatriculation */}
                <div className="relative flex flex-1 items-center rounded-md bg-white p-1 shadow-sm">
                    <div className="flex h-10 w-9 flex-col items-center justify-between rounded-l bg-plate-blue py-1 text-[9px] font-bold text-white select-none">
                        <div className="flex gap-0.5 text-[7px] text-plate-star">★</div>
                        <span className="font-sans tracking-tight">F</span>
                    </div>

                    <input
                        type="text"
                        value={rawInput}
                        onChange={handleInputChange}
                        onPaste={handlePaste}
                        placeholder="AA-123-BB"
                        maxLength={9}
                        className="w-full bg-transparent px-3 text-center font-mono text-lg font-bold tracking-widest text-ink placeholder:text-ink/30 focus:outline-none uppercase"
                        disabled={isLoadingPlate || isSyncing}
                    />
                </div>

                <Button
                    type="submit"
                    disabled={isLoadingPlate || isSyncing || !rawInput.trim()}
                    className="h-12 shrink-0 bg-pine px-6 font-heading font-bold text-white hover:bg-pine-hover"
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
