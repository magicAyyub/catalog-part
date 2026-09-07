import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { withRequestContext } from "@/lib/logs/request-context";
import { findVehicle } from "@/lib/db/queries/vehicles";
import { toApiEngineType } from "@/lib/api/shapes";

/**
 * GET /api/vehicle/[vehicleId]
 *
 * Renvoie la fiche d'un véhicule à partir de son K-Type.
 * Utilisé pour restituer l'intitulé complet lors d'un accès direct par URL.
 */
async function handleGet(
    _request: Request,
    { params }: { params: Promise<{ vehicleId: string }> }
) {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const { vehicleId: rawId } = await params;
    const vehicleId = Number(rawId);

    if (!Number.isSafeInteger(vehicleId) || vehicleId <= 0) {
        return NextResponse.json({ error: "vehicleId invalide" }, { status: 400 });
    }

    try {
        const vehicle = await findVehicle(vehicleId);
        if (!vehicle) {
            return NextResponse.json({ error: "Véhicule introuvable" }, { status: 404 });
        }

        return NextResponse.json({
            ...toApiEngineType(vehicle),
            label: `${vehicle.manufacturerName} ${vehicle.modelName} | ${vehicle.typeEngineName}`,
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Erreur serveur" },
            { status: 500 }
        );
    }
}

export async function GET(
    request: Request,
    context: { params: Promise<{ vehicleId: string }> }
) {
    return withRequestContext("vehicle/detail", () => handleGet(request, context));
}
