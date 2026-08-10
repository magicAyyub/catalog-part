import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { rapidApi } from "@/lib/rapidapi/client";
import { getWithCache } from "@/lib/vehicle/api-cache";

export async function GET() {
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