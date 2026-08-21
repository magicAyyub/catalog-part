import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { formatDisplayPlate, normalizePlate } from "@/lib/vehicle/plate-resolver";
import { friendlyPlateError, PlateLookupError } from "@/lib/plate/errors";
import { identifyPlate, type PlateIdentity } from "@/lib/plate/identify";
import { resolveVehicleFromKType } from "@/lib/vehicle/ktype-resolver";
import { getWithCache } from "@/lib/vehicle/api-cache";
import { logger } from "@/lib/logger";

import { withRequestContext } from "@/lib/logs/request-context";
/**
 * POST /api/vehicle/by-plate with { plate }
 *
 * Translates a licence plate into a vehicle record the existing TecDoc pipeline
 * can consume. This route ONLY identifies:
 *
 *   plate -> Exadis -> K-Type -> local index or RapidAPI -> ApiEngineType
 *
 * It fetches no parts. The client then proceeds exactly as after the manual
 * cascade, with POST /api/vehicle/sync, which runs the usual TecDoc sync, now
 * with the correct `vehicleId`.
 *
 * An unconfirmed identification comes back without its `engineType`, so that
 * second step cannot start. The supplier's identifier is not always a K-Type,
 * and buying parts for one the referential does not carry spends billed calls
 * for nothing.
 *
 * The resolution is cached with no expiry: a plate always designates the same
 * vehicle, and the upstream call costs a supplier round trip.
 */
async function handlePost(req: Request) {
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
        const identified = await getWithCache<PlateIdentity>(`plate_${clean}`, () =>
            identifyPlate(clean)
        );

        const resolved = await resolveVehicleFromKType(
            identified.kType,
            identified.brand,
            identified.model,
            identified.version ?? ""
        );

        const { engineType } = resolved;

        logger.info("Plate lookup completed", {
            action: "by-plate",
            plate: clean,
            vehicleId: resolved.vehicleId,
            confirmed: resolved.confirmed,
            matchedBy: resolved.matchedBy ?? null,
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
                confirmed: resolved.confirmed,
                matchedBy: resolved.matchedBy ?? null,
                engineType,
            },
            /**
             * Unconfirmed does not mean unusable. The labels failed to place the
             * vehicle in the referential, but the identifier itself may still be
             * a valid `vehicleId`, and `/api/vehicle/sync` settles that on data:
             * its first article list either answers or does not. Withholding the
             * sync here was tried and it turned a naming problem into a dead end,
             * measured on a plate whose brand came back as `M.G.`.
             */
            notice: resolved.confirmed
                ? undefined
                : "Véhicule non reconnu au référentiel TecDoc. Le libellé affiché est celui du fournisseur.",
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

export async function POST(req: Request) {
    return withRequestContext("vehicle/by-plate", () => handlePost(req));
}
