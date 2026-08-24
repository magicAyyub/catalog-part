"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatPlateInput } from "@/lib/vehicle/plate-resolver";
import { usePlateLookup } from "@/hooks/vehicle/use-plate-lookup";

interface VehiclePlateSearchProps {
    /** Même contrat que la cascade : la plaque retenue devient le véhicule actif. */
    onVehicleConfirmed?: (vehicleId: number, details?: { label: string; plate?: string }) => void;
}

export function VehiclePlateSearch({ onVehicleConfirmed }: VehiclePlateSearchProps) {
    const [rawInput, setRawInput] = useState("");
    const [plateError, setPlateError] = useState<string | null>(null);
    const { mutate: lookupPlate, isPending } = usePlateLookup();

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

        setPlateError(null);
        lookupPlate(rawInput, {
            // Le véhicule est retenu tout de suite : la carte véhicule remplace
            // ce formulaire et affiche la plaque, il n'y a rien à confirmer.
            onSuccess: (vehicle) => {
                onVehicleConfirmed?.(vehicle.vehicleId, {
                    label: `${vehicle.manufacturerName} ${vehicle.modelName} | ${vehicle.typeEngineName}`,
                    plate: vehicle.plate,
                });
            },
            onError: (error) => setPlateError(error.message),
        });
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
                        disabled={isPending}
                    />
                </div>

                <Button
                    type="submit"
                    disabled={isPending || !rawInput.trim()}
                    className="h-12 shrink-0 bg-pine px-6 font-heading font-bold text-white hover:bg-pine-hover"
                >
                    {isPending ? "Identification…" : "Rechercher"}
                </Button>
            </form>

            {/* Erreur */}
            {plateError && (
                <div className="rounded-md bg-white/10 p-2.5 text-xs font-medium text-white">
                    {plateError}
                </div>
            )}
        </div>
    );
}
