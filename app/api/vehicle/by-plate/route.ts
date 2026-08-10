import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { formatDisplayPlate, normalizePlate } from "@/lib/vehicle/plate-resolver";
import { fetchVehicleByPlate, friendlyPlateError, PlateLookupError } from "@/lib/etf/plate-client";
import { resolveVehicleFromKType } from "@/lib/vehicle/ktype-resolver";
import { getWithCache } from "@/lib/vehicle/api-cache";
import { logger } from "@/lib/logger";
import type { PlateVehicle } from "@/lib/etf/plate-client";

/**
 * POST /api/vehicle/by-plate with { plate }
 *
 * Translates a licence plate into a vehicle record the existing TecDoc pipeline
 * can consume. This route ONLY identifies:
 *
 *   plate -> app-etf -> K-Type -> RapidAPI referential -> ApiEngineType
 *
 * It fetches no parts. The client then proceeds exactly as after the manual
 * cascade, with POST /api/vehicle/sync, which runs the usual TecDoc sync, now
 * with the correct `vehicleId`.
 *
 * The resolution is cached with no expiry: a plate always designates the same
 * vehicle, and the upstream call costs 8 to 18 seconds.
 */
export async function POST(req: Request) {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

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
                 * False means the K-Type is certain but its engine line was not
                 * found in the TecDoc referential, so the displayed labels are
                 * the supplier's. The parts themselves remain correct.
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