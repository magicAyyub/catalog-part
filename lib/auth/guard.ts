/**
 * The authoritative check every data route runs.
 *
 * `proxy.ts` only proves a cookie was signed here and has not expired. That is
 * enough to redirect a browser, and not enough to serve data: a session closed
 * by a sign-out, or an account disabled since, still carries a valid signature
 * until its expiry. Only the database knows, so anything returning parts,
 * prices or vehicle data asks here.
 *
 * Returning the 401 response rather than a boolean is deliberate: the caller
 * cannot mistake the refusal for a user.
 *
 *     const auth = await requireUser();
 *     if (auth instanceof NextResponse) return auth;
 */

import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "./session";

export async function requireUser(): Promise<CurrentUser | NextResponse> {
    const user = await getCurrentUser();
    if (user) return user;

    return NextResponse.json({ error: "Session expirée. Reconnectez-vous." }, { status: 401 });
}
