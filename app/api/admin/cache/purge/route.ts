import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/admin/guard";
import { purgeAllCache, purgeCacheForPlate, purgeCacheForReference, type PurgeResult } from "@/lib/admin/cache-purge";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
    const auth = await requireAdminAccess();
    if (auth instanceof NextResponse) return auth;

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
    }

    const type = String(body.type ?? "").toLowerCase();
    const query = typeof body.query === "string" ? body.query.trim() : "";

    let result: PurgeResult;

    if (type === "plate") {
        if (!query) {
            return NextResponse.json({ error: "La plaque d'immatriculation est requise." }, { status: 400 });
        }
        result = await purgeCacheForPlate(query);
    } else if (type === "reference") {
        if (!query) {
            return NextResponse.json({ error: "La référence d'article est requise." }, { status: 400 });
        }
        result = await purgeCacheForReference(query);
    } else if (type === "all") {
        result = await purgeAllCache();
    } else {
        return NextResponse.json(
            { error: "Type de purge invalide. Valeurs acceptées : 'plate', 'reference', 'all'." },
            { status: 400 }
        );
    }

    return NextResponse.json(result);
}
