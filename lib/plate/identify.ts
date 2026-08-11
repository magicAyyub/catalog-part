/**
 * Plate to vehicle identity, through whichever provider answers first.
 *
 * Exadis is asked first because it costs one request and answers in under a
 * second. It returns the K-Type alone, which is enough whenever the local index
 * already knows that vehicle.
 *
 * app-etf is the fallback. It answers the same question but runs a full product
 * scrape first, so it is only worth its 8 to 18 seconds when we also need the
 * brand and model labels, which is exactly the case of a K-Type the index has
 * never seen.
 *
 * Adding a third provider means adding a branch here, nothing else.
 */

import { fetchVehicleByPlate, PlateLookupError } from "@/lib/etf/plate-client";
import { exadisConfigured, lookupVehicleByPlate } from "@/lib/suppliers/exadis/vehicle-lookup";
import { findVehicleByKType } from "@/lib/vehicle/vehicle-index";
import { logger } from "@/lib/logger";

export interface PlateIdentity {
    kType: number;
    /** Empty when the K-Type came from Exadis and the index already knew it. */
    brand: string;
    model: string;
    /** Kept for diagnostics only, never sent to TecDoc. */
    carId?: string | null;
    source?: "exadis" | "app-etf";
}

/**
 * Resolves a plate. Throws `PlateLookupError` when no provider could answer, so
 * the route keeps its existing error handling.
 */
export async function identifyPlate(plate: string): Promise<PlateIdentity> {
    if (exadisConfigured()) {
        try {
            const vehicle = await lookupVehicleByPlate(plate);

            // Index connu : les libellés ne servent à rien, on s'arrête là.
            // Libellés lisibles : ils suffisent à remonter la chaîne TecDoc.
            const known = Boolean(await findVehicleByKType(vehicle.kType));
            if (known || (vehicle.brand && vehicle.model)) {
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
                    source: "exadis",
                };
            }

            // K-Type inconnu et libellés illisibles : seul app-etf peut fournir
            // de quoi remonter la chaîne chez TecDoc.
            logger.warn("Exadis gave a K-Type but no usable labels, falling back", {
                module: "plate-identify",
                action: "plate_fallback",
                plate,
                kType: vehicle.kType,
            });
        } catch (error: unknown) {
            logger.warn("Exadis could not identify the plate, falling back to app-etf", {
                module: "plate-identify",
                action: "plate_fallback",
                plate,
                error,
            });
        }
    }

    const vehicle = await fetchVehicleByPlate(plate);
    logger.info("Plate identified by app-etf", {
        module: "plate-identify",
        action: "plate_source",
        plate,
        kType: vehicle.kType,
        source: "app-etf",
    });

    return {
        kType: vehicle.kType,
        brand: vehicle.brand,
        model: vehicle.model,
        carId: vehicle.carId,
        source: "app-etf",
    };
}

export { PlateLookupError };
