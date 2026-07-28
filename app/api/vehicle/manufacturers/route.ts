import { NextResponse } from "next/server";
import { rapidApi } from "@/lib/rapidapi/client";

export async function GET() {
    const { manufacturers } = await rapidApi.listManufacturers();

    const sorted = [...manufacturers].sort((a, b) => a.manufacturerName.localeCompare(b.manufacturerName));

    return NextResponse.json(sorted);
}