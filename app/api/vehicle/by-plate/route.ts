import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { withRequestContext } from "@/lib/logs/request-context";
import { formatDisplayPlate, normalizePlate } from "@/lib/vehicle/plate-resolver";
import { friendlyPlateError, PlateLookupError } from "@/lib/plate/errors";
import { identifyPlate } from "@/lib/plate/identify";
import { getVehicleForPlate, suggestCascadeFromPlate } from "@/lib/acquisition/plate";
import { toApiEngineType } from "@/lib/api/shapes";
import { logger } from "@/lib/logger";

/**
 * POST /api/vehicle/by-plate avec { plate }
 *
 * Traduit une immatriculation en véhicule du référentiel :
 *
 *   plaque -> Exadis -> K-Type -> `vehicles` -> vehicleId
 *
 * Un véhicule déjà connu ne coûte rien, le K-Type étant la clé primaire de
 * `vehicles`. Un véhicule inconnu déclenche l'acquisition de la première
 * catégorie, qui sert à la fois de preuve et de première page de résultats :
 * le client enchaîne ensuite sur `GET /api/parts`, qui la trouve déjà en base.
 *
 * Trois issues, dont deux sont des succès :
 *
 *   status "vehicle"     le véhicule, la cascade est court-circuitée
 *   status "suggestion"  TecDoc ignore le K-Type, mais les libellés placent
 *                        la cascade sur la bonne marque et le bon modèle
 *   404                  Exadis lui-même ne connaît pas la plaque
 */
async function handlePost(request: Request) {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const startTime = Date.now();

    const body = await request.json().catch(() => ({}));
    const { plate } = body as { plate?: unknown };

    if (typeof plate !== "string" || !normalizePlate(plate)) {
        return NextResponse.json(
            { error: "Veuillez saisir une plaque d'immatriculation." },
            { status: 400 }
        );
    }

    const clean = normalizePlate(plate);

    try {
        const identified = await identifyPlate(clean);
        const vehicle = await getVehicleForPlate(identified);

        if (vehicle) {
            logger.info("Plate lookup completed", {
                action: "by-plate",
                plate: clean,
                vehicleId: vehicle.vehicleId,
                durationMs: Date.now() - startTime,
            });
            return NextResponse.json({
                status: "vehicle",
                plate: formatDisplayPlate(clean),
                vehicle: toApiEngineType(vehicle),
            });
        }

        const suggestion = await suggestCascadeFromPlate(identified);

        if (suggestion) {
            logger.info("Plate resolved to a cascade suggestion", {
                action: "by-plate",
                plate: clean,
                kType: identified.kType,
                durationMs: Date.now() - startTime,
            });
            return NextResponse.json({
                status: "suggestion",
                plate: formatDisplayPlate(clean),
                ...suggestion,
            });
        }

        logger.warn("Plate identified but nothing could be placed", {
            action: "by-plate",
            plate: clean,
            kType: identified.kType,
            durationMs: Date.now() - startTime,
        });
        return NextResponse.json(
            {
                error: "Véhicule identifié mais introuvable au catalogue : passez par la sélection marque / modèle / motorisation.",
            },
            { status: 404 }
        );
    } catch (error) {
        const status = error instanceof PlateLookupError ? error.status : 502;
        logger.warn("Plate lookup failed", {
            action: "by-plate",
            plate: clean,
            durationMs: Date.now() - startTime,
            error,
        });
        return NextResponse.json({ error: friendlyPlateError(error) }, { status });
    }
}

export async function POST(request: Request) {
    return withRequestContext("vehicle/by-plate", () => handlePost(request));
}
