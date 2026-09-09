import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { withRequestContext } from "@/lib/logs/request-context";
import { rapidApiFailure } from "@/lib/rapidapi/errors";
import { getManufacturers } from "@/lib/acquisition/cascade";
import { toApiManufacturer } from "@/lib/api/shapes";

async function handleGet() {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    try {
        const manufacturers = (await getManufacturers()).map(toApiManufacturer);
        return NextResponse.json(manufacturers, {
            headers: {
                "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
            },
        });
    } catch (error) {
        return rapidApiFailure(error);
    }
}

export async function GET() {
    return withRequestContext("vehicle/manufacturers", () => handleGet());
}
