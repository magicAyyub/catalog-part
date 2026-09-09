import { NextResponse } from "next/server";

export async function POST() {
    return NextResponse.json(
        { error: "Cet endpoint est obsolète. L'accès administrateur est désormais géré par rôle utilisateur (RBAC)." },
        { status: 410 }
    );
}
