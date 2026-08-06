import { NextResponse } from "next/server";
import { formatDisplayPlate, normalizePlate } from "@/lib/vehicle/plate-resolver";
import { fetchVehicleByPlate, friendlyPlateError, PlateLookupError } from "@/lib/etf/plate-client";
import { resolveVehicleFromKType } from "@/lib/vehicle/ktype-resolver";
import { getWithCache } from "@/lib/vehicle/api-cache";
import { logger } from "@/lib/logger";
import type { PlateVehicle } from "@/lib/etf/plate-client";

/**
 * POST /api/vehicle/by-plate  { plate }
 *
 * Traduit une immatriculation en fiche véhicule exploitable par le pipeline
 * TecDoc existant. Cette route ne fait QUE de l'identification :
 *
 *   plaque ──► app-etf ──► K-Type ──► référentiel RapidAPI ──► ApiEngineType
 *
 * Elle ne récupère aucune pièce. Le client enchaîne comme après la cascade
 * manuelle, avec POST /api/vehicle/sync, qui déclenche la synchronisation
 * TecDoc habituelle — désormais avec le bon `vehicleId`.
 *
 * La résolution est mise en cache définitivement : une plaque désigne toujours
 * le même véhicule, et l'appel amont coûte 8 à 18 s.
 */
export async function POST(req: Request) {
    const startTime = Date.now();

    const body = await req.json().catch(() => ({}));
    const { plate } = body as { plate?: unknown };

    if (!plate || typeof plate !== "string") {
        return NextResponse.json({ error: "Le paramètre 'plate' est requis." }, { status: 400 });
    }

    const clean = normalizePlate(plate);
    if (!clean) {
        return NextResponse.json(
            { error: "Veuillez saisir une plaque d'immatriculation." },
            { status: 400 }
        );
    }

    try {
        const identified = await getWithCache<PlateVehicle>(`plate_${clean}`, () =>
            fetchVehicleByPlate(clean)
        );

        const resolved = await resolveVehicleFromKType(
            identified.kType,
            identified.brand,
            identified.model
        );

        const { engineType } = resolved;

        logger.info("Plate lookup completed", {
            action: "by-plate",
            plate: clean,
            vehicleId: resolved.vehicleId,
            carId: identified.carId,
            confirmed: resolved.confirmed,
            durationMs: Date.now() - startTime,
        });

        return NextResponse.json({
            success: true,
            vehicle: {
                plate: formatDisplayPlate(clean),
                vehicleId: resolved.vehicleId,
                manufacturerId: resolved.manufacturerId,
                modelId: resolved.modelId,
                manufacturerName: engineType.manufacturerName,
                modelName: engineType.modelName,
                typeEngineName: engineType.typeEngineName,
                powerKw: engineType.powerKw,
                fuelType: engineType.fuelType,
                /**
                 * false = le K-Type est certain mais sa motorisation n'a pas été
                 * retrouvée dans le référentiel TecDoc, donc les libellés
                 * affichés sont ceux du fournisseur. Les pièces restent justes.
                 */
                confirmed: resolved.confirmed,
                engineType,
            },
        });
    } catch (error: unknown) {
        const status = error instanceof PlateLookupError && error.status === 404 ? 404 : 400;
        logger.warn("Plate lookup failed", {
            action: "by-plate",
            plate: clean,
            durationMs: Date.now() - startTime,
            error,
        });
        return NextResponse.json({ error: friendlyPlateError(error) }, { status });
    }
}