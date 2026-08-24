/**
 * Identité véhicule d'une plaque. Exadis est le seul fournisseur.
 *
 * L'identification s'arrête ici : placer le kType dans le référentiel revient
 * à l'appelant. Les libellés sont conservés parce qu'eux seuls savent nommer
 * un véhicule que le référentiel ne porte pas.
 *
 * C'est ici que se brancherait un second fournisseur, et il ne devrait pas
 * lire son kType chez Exadis : app-etf le faisait et tombait avec la source
 * qu'il était censé couvrir.
 */

import {
    ExadisLookupError,
    exadisConfigured,
    lookupVehicleByPlate,
} from "@/lib/suppliers/exadis/vehicle-lookup";
import { PlateLookupError } from "@/lib/plate/errors";
import { logger } from "@/lib/logger";

export interface PlateIdentity {
    kType: number;
    /** Vide quand la table de chaînes n'a pas pu être lue avec certitude. */
    brand: string;
    model: string;
    /** Motorisation telle que le fournisseur la nomme, "1.6 Passion 16V". */
    version?: string;
}

const STATUS_BY_CODE: Record<ExadisLookupError["code"], number> = {
    no_credentials: 500,
    auth_failed: 502,
    not_found: 404,
    transport: 504,
};

function asPlateLookupError(error: unknown): PlateLookupError {
    if (error instanceof ExadisLookupError) {
        return new PlateLookupError(error.message, STATUS_BY_CODE[error.code], error.code);
    }
    return new PlateLookupError("Identification du véhicule en échec.", 502, "transport");
}

/** Lève `PlateLookupError`, que la route traduit en statut et en message. */
export async function identifyPlate(plate: string): Promise<PlateIdentity> {
    if (!exadisConfigured()) {
        throw new PlateLookupError(
            "EXADIS_USERNAME et EXADIS_PASSWORD absents de .env : aucune identification par plaque possible.",
            500,
            "no_credentials"
        );
    }

    let vehicle;
    try {
        vehicle = await lookupVehicleByPlate(plate);
    } catch (error) {
        logger.warn("Exadis could not identify the plate", {
            module: "plate-identify",
            action: "plate_failed",
            plate,
            error,
        });
        throw asPlateLookupError(error);
    }

    logger.info("Plate identified by Exadis", {
        module: "plate-identify",
        action: "plate_source",
        plate,
        kType: vehicle.kType,
        source: "exadis",
    });

    return {
        kType: vehicle.kType,
        brand: vehicle.brand,
        model: vehicle.model,
        version: vehicle.version,
    };
}

export { PlateLookupError };
