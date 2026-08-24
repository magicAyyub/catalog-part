import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { withRequestContext } from "@/lib/logs/request-context";
import { findLastSelection, saveLastSelection } from "@/lib/db/queries/selection";

/**
 * Dernier véhicule consulté par l'utilisateur connecté.
 *
 * GET rend le véhicule complet ou null, PUT enregistre la sélection courante.
 * Le navigateur garde déjà la sienne : cette route sert au retour après
 * expiration du cache client ou depuis un autre poste.
 */
async function handleGet() {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    return NextResponse.json(await findLastSelection(auth.id));
}

async function handlePut(request: Request) {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => ({}));
    const vehicleId = Number((body as { vehicleId?: unknown }).vehicleId);

    if (!vehicleId) {
        return NextResponse.json({ error: "vehicleId requis" }, { status: 400 });
    }

    await saveLastSelection(auth.id, vehicleId);
    return NextResponse.json({ vehicleId });
}

export async function GET() {
    return withRequestContext("vehicle/selection", () => handleGet());
}

export async function PUT(request: Request) {
    return withRequestContext("vehicle/selection", () => handlePut(request));
}
