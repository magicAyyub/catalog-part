/**
 * Plate lookup failures, and the French sentence the counter reads.
 *
 * Kept outside the provider modules so a route catches one type whatever
 * answered, and so adding a provider does not move the error handling again.
 */

export type PlateErrorCode =
    | "bad_plate"
    | "no_credentials"
    | "auth_failed"
    | "not_found"
    | "transport";

export class PlateLookupError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly code?: PlateErrorCode
    ) {
        super(message);
        this.name = "PlateLookupError";
    }
}

/** French end-user message for a plate resolution failure. */
export function friendlyPlateError(error: unknown): string {
    if (!(error instanceof PlateLookupError)) {
        return "Une erreur est survenue lors de l'identification du véhicule.";
    }
    switch (error.code) {
        case "not_found":
            return "Aucun véhicule trouvé pour cette immatriculation.";
        case "bad_plate":
            return "Format d'immatriculation invalide.";
        case "auth_failed":
            return "Accès au portail d'identification refusé : les identifiants doivent être renouvelés.";
        case "no_credentials":
            return "L'identification par plaque n'est pas configurée sur ce serveur.";
        case "transport":
            return "Le portail d'identification est momentanément injoignable. Réessayez, ou passez par la sélection marque / modèle / motorisation.";
        default:
            return "Le service d'identification est momentanément indisponible.";
    }
}
