"use client";

import { useMutation } from "@tanstack/react-query";

/**
 * Enregistre le véhicule courant côté serveur.
 *
 * Le navigateur garde déjà la sélection ; celle-ci sert au retour après
 * expiration du cache client ou depuis un autre poste. Un échec est sans
 * conséquence sur l'écran, il n'est donc pas remonté.
 */
export function useSaveSelection() {
    const { mutate } = useMutation({
        mutationFn: async (vehicleId: number) => {
            await fetch("/api/vehicle/selection", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ vehicleId }),
            });
        },
    });
    return mutate;
}
