import { NextResponse } from "next/server";
import { rapidApi } from "@/lib/rapidapi/client";

export async function GET(request: Request) {
    const manufacturerId = Number(new URL(request.url).searchParams.get("manufacturerId"));

    if (!manufacturerId) {
        return NextResponse.json({ error: "manufacturerId requis" }, { status: 400 });
    }

    const { models } = await rapidApi.listModels(manufacturerId);
    return NextResponse.json(models);
}