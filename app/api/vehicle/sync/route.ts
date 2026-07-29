import { NextResponse } from "next/server";
import { needsSync, syncVehicle } from "@/lib/vehicle/sync-service";
import type { ApiEngineType } from "@/lib/rapidapi/types";

export interface SyncRequestBody {
    vehicleId: number;
    manufacturerId: number;
    modelId: number;
    engineType: ApiEngineType;
}

export async function POST(request: Request) {
    let body: SyncRequestBody;

    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
    }

    const { vehicleId, manufacturerId, modelId, engineType } = body;

    if (!vehicleId || !engineType) {
        return NextResponse.json(
            { error: "vehicleId et engineType sont requis" },
            { status: 400 }
        );
    }

    const required = await needsSync(vehicleId);

    if (!required) {
        return NextResponse.json({ status: "cached", vehicleId });
    }

    await syncVehicle(engineType, manufacturerId, modelId);

    return NextResponse.json({ status: "synced", vehicleId });
}
