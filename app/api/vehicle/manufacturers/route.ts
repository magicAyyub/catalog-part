import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { rapidApi } from "@/lib/rapidapi/client";
import { getWithCache } from "@/lib/vehicle/api-cache";
import { rapidApiFailure } from "@/lib/rapidapi/errors";

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
    } catch (error) {
        return rapidApiFailure(error);
    }
}

export async function GET() {
    return withRequestContext("vehicle/manufacturers", () => handleGet());
}
