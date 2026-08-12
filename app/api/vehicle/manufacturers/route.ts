import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { rapidApi } from "@/lib/rapidapi/client";
import { getWithCache } from "@/lib/vehicle/api-cache";

import { withRequestContext } from "@/lib/logs/request-context";
async function handleGet() {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    try {
        const sorted = await getWithCache("manufacturers", async () => {
            const { manufacturers } = await rapidApi.listManufacturers();
            return [...manufacturers].sort((a, b) =>
                a.manufacturerName.localeCompare(b.manufacturerName)
            );
        });
        return NextResponse.json(sorted);
    } catch (error: any) {
        console.error("Erreur manufacturers API :", error);
        return NextResponse.json(
            { error: "Impossible de charger la liste des constructeurs. " + (error.message || "") },
            { status: 500 }
        );
    }
}

export async function GET() {
    return withRequestContext("vehicle/manufacturers", () => handleGet());
}
