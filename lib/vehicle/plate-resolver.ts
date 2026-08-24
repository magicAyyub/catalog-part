/**
 * French plate formatting and normalisation (SIV and FNI).
 *
 * Resolution itself lives in `lib/plate/identify.ts`, which asks Exadis for the
 * K-Type. This file only shapes what the user types, and names what the
 * `by-plate` route sends back.
 */

export interface PlateLookupResult {
    /** Plaque formatée pour l'affichage, telle que la route la renvoie. */
    plate: string;
    vehicleId: number;
    manufacturerName: string;
    modelName: string;
    typeEngineName: string;
}

/**
 * Nettoie et normalise la plaque (supprime espaces, tirets, majuscules).
 */
export function normalizePlate(raw: string): string {
    return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Formate une plaque SIV propre pour l'affichage (ex: AA123BB -> AA-123-BB).
 */
export function formatDisplayPlate(raw: string): string {
    const clean = normalizePlate(raw);
    if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(clean)) {
        return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5, 7)}`;
    }
    return raw.trim().toUpperCase();
}

/**
 * Formate en temps réel la plaque au fil de la saisie manuelle ou du copier-coller (ex: AA123BB -> AA-123-BB).
 * Limite la saisie aux 7 caractères alphanumériques réels (soit 9 caractères formatés avec tirets).
 */
export function formatPlateInput(input: string): string {
    const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, "");

    if (/^\d/.test(clean)) {
        const truncated = clean.slice(0, 9);
        const match = truncated.match(/^(\d{1,4})([A-Z]{0,3})(\d{0,3})$/);
        if (match) {
            const parts = [match[1], match[2], match[3]].filter(Boolean);
            return parts.join("-");
        }
        return truncated;
    }

    const truncated = clean.slice(0, 7);
    if (truncated.length <= 2) {
        return truncated;
    }
    if (truncated.length <= 5) {
        return `${truncated.slice(0, 2)}-${truncated.slice(2)}`;
    }
    return `${truncated.slice(0, 2)}-${truncated.slice(2, 5)}-${truncated.slice(5)}`;
}
