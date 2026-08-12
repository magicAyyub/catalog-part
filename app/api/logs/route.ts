/**
 * Serves the structured logs to the trace page.
 *
 * Two doors, and both are checked here rather than on the page alone: a signed
 * in franchisee is not enough, the trace password is required as well.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { logsUnlocked } from "@/lib/logs/access";
import { readLogPage } from "@/lib/logs/reader";

export async function GET(request: NextRequest) {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    if (!(await logsUnlocked())) {
        return NextResponse.json({ error: "Trace verrouillée." }, { status: 403 });
    }

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
