import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth/tokens";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout"];

export async function proxy(req: NextRequest) {
    const { pathname, search } = req.nextUrl;

    if (PUBLIC_PATHS.includes(pathname)) {
        return NextResponse.next();
    }

    const session = await verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (session) return NextResponse.next();

    if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }

    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)"],
};
