/**
 * Both doors in one call, for every account management route.
 *
 * A signed-in franchisee is not enough; the unlock cookie is checked on the API
 * as well as on the page, so a request forged by hand meets the same gate.
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { adminUnlocked } from "@/lib/admin/access";
import type { CurrentUser } from "@/lib/auth/session";

export async function requireAdminAccess(): Promise<CurrentUser | NextResponse> {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    if (!(await adminUnlocked())) {
        return NextResponse.json({ error: "Gestion des comptes verrouillée." }, { status: 403 });
    }

    return auth;
}
