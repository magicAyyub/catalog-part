/**
 * The gate in front of everything. `proxy` is Next 16's name for what used to
 * be the middleware convention.
 *
 * Closed by default: a route is reachable without a session only if it is
 * listed below. That way a new page or API route added later is protected
 * because nobody remembered to protect it, rather than exposed because nobody
 * remembered to.
 *
 * This check is cheap and stateless, so it runs on every request without a
 * database round trip. It proves the cookie was issued here and has not
 * expired. It does not prove the session still exists, which is why anything
 * serving purchase prices calls `getCurrentUser` as well.
 */

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth/tokens";

/** Reachable without a session. Nothing else is. */
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout"];

export async function proxy(req: NextRequest) {
    const { pathname, search } = req.nextUrl;

    if (PUBLIC_PATHS.includes(pathname)) {
        return NextResponse.next();
    }

    const session = await verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (session) return NextResponse.next();

    // Une API répond 401 : rediriger une requête fetch vers du HTML de connexion
    // donnerait une erreur de parsing JSON au lieu d'un refus lisible.
    if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }

    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
}

export const config = {
    /**
     * Everything except Next's own build output and static files. Public assets
     * are matched by extension, so `/logos/bosch.png` stays reachable while a
     * route like `/parts/123` does not.
     */
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)"],
};
