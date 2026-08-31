"use client";

import { useMutation } from "@tanstack/react-query";
import type { PlateLookupResult } from "@/lib/vehicle/plate-resolver";

/** Le K-Type est au catalogue : le véhicule est prêt, la cascade est sautée. */
export interface PlateVehicleResult {
    status: "vehicle";
    plate: string;
    vehicle: PlateLookupResult;
}

/** TecDoc ignore le K-Type, mais les libellés placent la cascade. */
export interface PlateSuggestionResult {
    status: "suggestion";
    plate: string;
    manufacturerId: number;
    manufacturerName: string;
    modelId: number | null;
    modelName: string | null;
    version: string | null;
}

export type PlateLookupResponse = PlateVehicleResult | PlateSuggestionResult;

/**
 * Identifie un véhicule à partir de sa plaque.
 *
 * Une mutation plutôt qu'une requête : l'appel part sur action de l'utilisateur
 * et sollicite le portail fournisseur, il ne doit jamais se rejouer tout seul.
 * Le message d'erreur vient de la route, qui sait distinguer une plaque
 * inconnue d'un portail injoignable.
 */
async function lookupPlate(plate: string): Promise<PlateLookupResponse> {
    const res = await fetch("/api/vehicle/by-plate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate }),
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok) {
        const message = (payload as { error?: string } | null)?.error;
        throw new Error(message || "Identification du véhicule en échec.");
    }
    return payload as PlateLookupResponse;
}

/** Clé partagée : le catalogue s'en sert pour afficher l'attente là où les pièces apparaîtront. */
export const PLATE_LOOKUP_KEY = ["plate-lookup"] as const;

export function usePlateLookup() {
    return useMutation({ mutationKey: PLATE_LOOKUP_KEY, mutationFn: lookupPlate });
}
