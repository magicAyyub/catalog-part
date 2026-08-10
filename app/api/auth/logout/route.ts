/**
 * Sign-out. Deletes the session row, so the cookie is dead server-side even if
 * a copy of it survives in a browser or a proxy.
 */

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, destroySession } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
    await destroySession(req.cookies.get(SESSION_COOKIE)?.value);

    const res = NextResponse.json({ ok: true });
    res.cookies.set({
        name: SESSION_COOKIE,
        value: "",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
    });
    return res;
}
