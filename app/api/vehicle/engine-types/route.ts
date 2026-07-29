import { NextResponse } from "next/server";
import { rapidApi } from "@/lib/rapidapi/client";
import { getWithCache } from "@/lib/vehicle/api-cache";

export async function GET(request: Request) {
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
    } catch (error: any) {
        console.error(`Erreur engine-types API (model: ${modelId}) :`, error);
        return NextResponse.json(
            { error: "Impossible de charger la liste des motorisations. " + (error.message || "") },
            { status: 500 }
        );
    }
}