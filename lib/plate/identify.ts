/**
 * Plate to vehicle identity. Exadis is the only provider: one request yields the
 * K-Type plus the brand and model labels.
 *
 * The labels are load-bearing. The identifier Exadis returns is usually a K-Type
 * but not always, and the engine label is what recovers the vehicle when it is
 * not, so unreadable labels leave the identification unconfirmed.
 *
 * A second provider must not read its K-Type from Exadis: app-etf did, and fell
 * with the source it was meant to cover.
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
    /** Engine line as the supplier words it, "1.8 Hybrid (ZVW3_)". Absent on older cached entries. */
    version?: string;
    /** Diagnostics only. Older cached entries may name another provider. */
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

/** Throws `PlateLookupError`, which the route turns into a status and a message. */
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
