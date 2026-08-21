/**
 * Plate to vehicle identity.
 *
 * Exadis is the only provider: one request, under a second, and it yields the
 * K-Type plus the brand and model labels from the same response.
 *
 * app-etf used to sit behind it as a fallback. It was removed because it read
 * its own K-Type from Exadis too, so it fell with the very source it was meant
 * to cover, and its public route degrades a missing K-Type into a portal
 * `carId`. A real second pillar has to be independent of Exadis.
 *
 * The labels are not decoration. Measured on a TOYOTA PRIUS: the identifier
 * Exadis returns is usually a K-Type but not always, and the engine label is
 * what recovers the vehicle when it is not. Unreadable labels leave the
 * identification unconfirmed, which the caller must not turn into a purchase.
 */

import { ExadisLookupError, exadisConfigured, lookupVehicleByPlate } from "@/lib/suppliers/exadis/vehicle-lookup";
import { findVehicleByKType } from "@/lib/vehicle/vehicle-index";
import { PlateLookupError } from "@/lib/plate/errors";
import { logger } from "@/lib/logger";

export interface PlateIdentity {
    kType: number;
    /** Empty when the Exadis string table could not be read with confidence. */
    brand: string;
    model: string;
    /**
     * Engine line as the supplier words it, "1.8 Hybrid (ZVW3_)". Recovers the
     * vehicle when the supplier's identifier is not a TecDoc K-Type. Optional:
     * plate entries cached before this field existed do not carry it.
     */
    version?: string;
    /** Diagnostics only. Cached entries written before may name another provider. */
    source?: string;
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

/**
 * Resolves a plate. Throws `PlateLookupError`, which the route turns into a
 * status and a French message.
 */
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
    } catch (error: unknown) {
        logger.warn("Exadis could not identify the plate", {
            module: "plate-identify",
            action: "plate_failed",
            plate,
            error,
        });
        throw asPlateLookupError(error);
    }

    const known = Boolean(await findVehicleByKType(vehicle.kType));

    // Libellés illisibles sur un K-Type que l'index ne connaît pas : la remontée
    // TecDoc ne pourra pas nommer le véhicule. Les pièces restent justes.
    if (!known && (!vehicle.brand || !vehicle.model)) {
        logger.warn("Exadis gave a K-Type but no usable labels", {
            module: "plate-identify",
            action: "plate_labels_missing",
            plate,
            kType: vehicle.kType,
        });
    }

    logger.info("Plate identified by Exadis", {
        module: "plate-identify",
        action: "plate_source",
        plate,
        kType: vehicle.kType,
        source: "exadis",
        indexed: known,
    });

    return {
        kType: vehicle.kType,
        brand: vehicle.brand,
        model: vehicle.model,
        version: vehicle.version,
        source: "exadis",
    };
}

export { PlateLookupError };
