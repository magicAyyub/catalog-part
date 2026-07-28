import { NextResponse } from "next/server";
import { rapidApi } from "@/lib/rapidapi/client";

export async function GET(request: Request) {
    const modelId = Number(new URL(request.url).searchParams.get("modelId"));

    if (!modelId) {
        return NextResponse.json({ error: "modelId requis" }, { status: 400 });
    }

    const { modelTypes } = await rapidApi.listEngineTypes(modelId);
    return NextResponse.json(modelTypes);
}