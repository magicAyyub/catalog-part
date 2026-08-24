/**
 * Sert les logs structurés à la page de trace.
 *
 * Les deux portes sont vérifiées ici et pas seulement sur la page : être
 * connecté ne suffit pas, le mot de passe d'administration est exigé aussi.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAccess } from "@/lib/admin/guard";
import { readLogPage } from "@/lib/logs/reader";

export async function GET(request: NextRequest) {
    const auth = await requireAdminAccess();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = request.nextUrl;

    const page = readLogPage({
        date: searchParams.get("date") ?? undefined,
        level: searchParams.get("level") ?? undefined,
        action: searchParams.get("action") ?? undefined,
        search: searchParams.get("q") ?? undefined,
        limit: Number(searchParams.get("limit")) || undefined,
    });

    return NextResponse.json(page, {
        headers: { "Cache-Control": "no-store" },
    });
}
