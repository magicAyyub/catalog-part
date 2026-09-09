import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { withRequestContext } from "@/lib/logs/request-context";
import { rapidApiFailure } from "@/lib/rapidapi/errors";
import { getModels } from "@/lib/acquisition/cascade";
import { toApiModel } from "@/lib/api/shapes";

async function handleGet(request: Request) {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const manufacturerId = Number(new URL(request.url).searchParams.get("manufacturerId"));
    if (!Number.isSafeInteger(manufacturerId) || manufacturerId <= 0) {
        return NextResponse.json({ error: "manufacturerId requis" }, { status: 400 });
    }

    try {
        const models = (await getModels(manufacturerId)).map(toApiModel);
        return NextResponse.json(models, {
            headers: {
                "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
            },
        });
    } catch (error) {
        return rapidApiFailure(error, { manufacturerId });
    }
}

export async function GET(request: Request) {
    return withRequestContext("vehicle/models", () => handleGet(request));
}
