import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { withRequestContext } from "@/lib/logs/request-context";
import { clearLastSelection, findLastSelection, saveLastSelection } from "@/lib/db/queries/selection";

/**
 * Dernier véhicule consulté par l'utilisateur connecté.
 *
 * GET rend le véhicule complet ou null, PUT enregistre la sélection courante,
 * DELETE efface la sélection stockée.
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

    if (!Number.isSafeInteger(vehicleId) || vehicleId <= 0) {
        return NextResponse.json({ error: "vehicleId invalide" }, { status: 400 });
    }

    await saveLastSelection(auth.id, vehicleId);
    return NextResponse.json({ vehicleId });
}

async function handleDelete() {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    await clearLastSelection(auth.id);
    return NextResponse.json({ success: true });
}

export async function GET() {
    return withRequestContext("vehicle/selection", () => handleGet());
}

export async function PUT(request: Request) {
    return withRequestContext("vehicle/selection", () => handlePut(request));
}

export async function DELETE() {
    return withRequestContext("vehicle/selection", () => handleDelete());
}
