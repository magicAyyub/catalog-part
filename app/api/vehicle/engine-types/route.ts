import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { withRequestContext } from "@/lib/logs/request-context";
import { rapidApiFailure } from "@/lib/rapidapi/errors";
import { getVehicles } from "@/lib/acquisition/cascade";
import { toApiEngineType } from "@/lib/api/shapes";

async function handleGet(request: Request) {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const modelId = Number(new URL(request.url).searchParams.get("modelId"));
    if (!Number.isSafeInteger(modelId) || modelId <= 0) {
        return NextResponse.json({ error: "modelId invalide" }, { status: 400 });
    }

    try {
        return NextResponse.json((await getVehicles(modelId)).map(toApiEngineType));
    } catch (error) {
        return rapidApiFailure(error, { modelId });
    }
}

export async function GET(request: Request) {
    return withRequestContext("vehicle/engine-types", () => handleGet(request));
}
