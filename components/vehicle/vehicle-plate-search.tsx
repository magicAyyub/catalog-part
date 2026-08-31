"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatPlateInput } from "@/lib/vehicle/plate-resolver";
import { usePlateLookup, type PlateSuggestionResult } from "@/hooks/vehicle/use-plate-lookup";

interface VehiclePlateSearchProps {
    /** Même contrat que la cascade : la plaque retenue devient le véhicule actif. */
    onVehicleConfirmed?: (vehicleId: number, details?: { label: string; plate?: string }) => void;
    /** Le véhicule n'est pas au catalogue, mais la cascade peut être placée. */
    onCascadeSuggested?: (suggestion: PlateSuggestionResult) => void;
}

/**
 * Position du curseur dans la valeur formatée, exprimée en caractères
 * significatifs.
 *
 * Le formatage pose les tirets lui-même, donc leur nombre change entre la frappe
 * et l'affichage. Compter les lettres et les chiffres plutôt que les positions
 * est ce qui permet de corriger un caractère au milieu de la plaque sans que le
 * curseur saute à la fin, et de taper soi-même les tirets sans décalage.
 */
function caretForAlnum(formatted: string, alnumBefore: number): number {
    if (alnumBefore === 0) return 0;

    let seen = 0;
    for (let i = 0; i < formatted.length; i++) {
        if (formatted[i] !== "-") seen++;
        if (seen === alnumBefore) return i + 1;
    }
    return formatted.length;
}

function countAlnum(value: string): number {
    return value.replace(/[^A-Za-z0-9]/g, "").length;
}

export function VehiclePlateSearch({
    onVehicleConfirmed,
    onCascadeSuggested,
}: VehiclePlateSearchProps) {
    const [rawInput, setRawInput] = useState("");
    const [plateError, setPlateError] = useState<string | null>(null);
    const { mutate: lookupPlate, isPending } = usePlateLookup();

    const inputRef = useRef<HTMLInputElement>(null);
    const caretRef = useRef<number | null>(null);

    // Repositionné après le rendu : React place le curseur en fin de champ dès
    // que la valeur contrôlée change de longueur.
    useLayoutEffect(() => {
        if (caretRef.current === null || !inputRef.current) return;
        inputRef.current.setSelectionRange(caretRef.current, caretRef.current);
        caretRef.current = null;
    });

    function applyInput(value: string, caret: number) {
        const alnumBefore = countAlnum(value.slice(0, caret));
        const formatted = formatPlateInput(value);
        setRawInput(formatted);
        setPlateError(null);
        caretRef.current = caretForAlnum(formatted, alnumBefore);
    }

    function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        applyInput(e.target.value, e.target.selectionStart ?? e.target.value.length);
    }

    function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
        e.preventDefault();
        const pasted = e.clipboardData.getData("text");
        applyInput(pasted, pasted.length);
    }

    function handleSearch(e?: React.FormEvent) {
        e?.preventDefault();

        if (!rawInput.trim()) {
            setPlateError("Veuillez entrer un numéro d'immatriculation.");
            return;
        }

        setPlateError(null);
        lookupPlate(rawInput, {
            onSuccess: (result) => {
                if (result.status === "suggestion") {
                    onCascadeSuggested?.(result);
                    return;
                }

                // Le véhicule est retenu tout de suite : la carte véhicule
                // remplace ce formulaire et affiche la plaque, rien à confirmer.
                const { vehicle } = result;
                onVehicleConfirmed?.(vehicle.vehicleId, {
                    label: `${vehicle.manufacturerName} ${vehicle.modelName} | ${vehicle.typeEngineName}`,
                    plate: result.plate,
                });
            },
            onError: (error) => setPlateError(error.message),
        });
    }

    return (
        <div className="flex flex-col gap-3">
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-stretch gap-2.5">
                {/* Un label plutôt qu'un div : toute la plaque devient cliquable,
                    et la bordure pine signale le focus que l'input a supprimé. */}
                <label className="relative flex flex-1 cursor-text items-center rounded-md border-2 border-transparent bg-white p-1 shadow-sm transition-colors focus-within:border-pine">
                    <span className="flex h-10 w-9 flex-col items-center justify-between rounded-l bg-plate-blue py-1 text-[9px] font-bold text-white select-none">
                        <span className="flex gap-0.5 text-[7px] text-plate-star">★</span>
                        <span className="font-sans tracking-tight">F</span>
                    </span>

                    <input
                        ref={inputRef}
                        type="text"
                        value={rawInput}
                        onChange={handleInputChange}
                        onPaste={handlePaste}
                        placeholder="AA-123-BB"
                        maxLength={12}
                        aria-label="Numéro d'immatriculation"
                        className="w-full bg-transparent px-3 text-center font-mono text-lg font-bold tracking-widest text-ink caret-pine placeholder:text-ink/30 focus:outline-none uppercase"
                        disabled={isPending}
                    />
                </label>

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
