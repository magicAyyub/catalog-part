import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { rapidApi } from "@/lib/rapidapi/client";
import { getWithCache } from "@/lib/vehicle/api-cache";
import { rapidApiFailure } from "@/lib/rapidapi/errors";

import { withRequestContext } from "@/lib/logs/request-context";
async function handleGet(request: Request) {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const modelId = Number(new URL(request.url).searchParams.get("modelId"));

    if (!modelId) {
        return NextResponse.json({ error: "modelId requis" }, { status: 400 });
    }

    try {
        const modelTypes = await getWithCache(`engine_types_${modelId}`, async () => {
            const res = await rapidApi.listEngineTypes(modelId);
            return res.modelTypes;
        });
        return NextResponse.json(modelTypes);
    } catch (error) {
        return rapidApiFailure(error, { modelId });
    }
}

export async function GET(request: Request) {
    return withRequestContext("vehicle/engine-types", () => handleGet(request));
}
