/**
 * Les deux portes en un appel, pour toute route d'administration.
 *
 * Être connecté ne suffit pas : le cookie d'ouverture est vérifié sur l'API
 * comme sur la page, pour qu'une requête forgée à la main rencontre la même
 * porte.
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { adminUnlocked } from "@/lib/admin/access";
import type { CurrentUser } from "@/lib/auth/session";

export async function requireAdminAccess(): Promise<CurrentUser | NextResponse> {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    if (!(await adminUnlocked())) {
        return NextResponse.json({ error: "Administration verrouillée." }, { status: 403 });
    }

    return auth;
}
