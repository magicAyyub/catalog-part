/**
 * Contrôle d'accès serveur pour toutes les routes d'administration.
 * Exige une session active avec le rôle 'admin'.
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import type { CurrentUser } from "@/lib/auth/session";

export async function requireAdminAccess(): Promise<CurrentUser | NextResponse> {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    if (auth.role !== "admin") {
        return NextResponse.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
    }

    return auth;
}
