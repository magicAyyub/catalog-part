"use client";

import { useMutation } from "@tanstack/react-query";
import type { PlateLookupResult } from "@/lib/vehicle/plate-resolver";

/**
 * Identifie un véhicule à partir de sa plaque.
 *
 * Une mutation plutôt qu'une requête : l'appel part sur action de l'utilisateur
 * et sollicite le portail fournisseur, il ne doit jamais se rejouer tout seul.
 * Le message d'erreur vient de la route, qui sait distinguer une plaque
 * inconnue d'un portail injoignable.
 */
async function lookupPlate(plate: string): Promise<PlateLookupResult> {
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
    return payload as PlateLookupResult;
}

export function usePlateLookup() {
    return useMutation({ mutationFn: lookupPlate });
}
