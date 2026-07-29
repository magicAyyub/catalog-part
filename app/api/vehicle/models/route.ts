import { NextResponse } from "next/server";
import { rapidApi } from "@/lib/rapidapi/client";
import { getWithCache } from "@/lib/vehicle/api-cache";

export async function GET(request: Request) {
    const manufacturerId = Number(new URL(request.url).searchParams.get("manufacturerId"));

    if (!manufacturerId) {
        return NextResponse.json({ error: "manufacturerId requis" }, { status: 400 });
    }

    try {
        const models = await getWithCache(`models_${manufacturerId}`, async () => {
            const res = await rapidApi.listModels(manufacturerId);
            return res.models;
        });
        return NextResponse.json(models);
    } catch (error: any) {
        console.error(`Erreur models API (manufacturer: ${manufacturerId}) :`, error);
        return NextResponse.json(
            { error: "Impossible de charger la liste des modèles. " + (error.message || "") },
            { status: 500 }
        );
    }
}