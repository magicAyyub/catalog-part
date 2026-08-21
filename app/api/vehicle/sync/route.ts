import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { needsSync, syncVehicle } from "@/lib/vehicle/sync-service";
import type { ApiEngineType } from "@/lib/rapidapi/types";

import { withRequestContext } from "@/lib/logs/request-context";
export interface SyncRequestBody {
    vehicleId: number;
    manufacturerId: number;
    modelId: number;
    engineType: ApiEngineType;
}

async function handlePost(request: Request) {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

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

    let result;
    try {
        result = await syncVehicle(engineType, manufacturerId, modelId);
    } catch (error: any) {
        console.error("Erreur de synchronisation :", error);

        let friendlyMessage = "Une erreur est survenue lors de la récupération des pièces auprès de l'API.";
        const msg = error.message || "";

        if (msg.includes("exceeded the MONTHLY quota")) {
            friendlyMessage = "Votre quota mensuel d'appels RapidAPI a été dépassé. Les véhicules déjà en base restent consultables ; la mise à niveau du plan se fait sur RapidAPI.";
        } else if (msg.includes("exceeded the rate limit per second")) {
            friendlyMessage = "Limite de requêtes par seconde atteinte. Veuillez patienter un instant et réessayer.";
        } else if (msg.includes("429") || msg.includes("Too Many Requests")) {
            friendlyMessage = "Trop de requêtes envoyées en même temps à l'API. Veuillez réessayer dans quelques secondes.";
        } else if (msg.includes("403") || msg.includes("Forbidden") || msg.includes("RAPIDAPI_KEY")) {
            friendlyMessage = "Clé RapidAPI incorrecte ou non autorisée. Veuillez vérifier la variable RAPIDAPI_KEY dans votre fichier .env.";
        }

        return NextResponse.json(
            { error: friendlyMessage, details: msg },
            { status: 500 }
        );
    }

    // Le référentiel n'a rien renvoyé : l'identifiant n'est probablement pas un
    // vehicleId TecDoc. Rien n'a été enregistré, la prochaine tentative repartira
    // de zéro plutôt que de servir un catalogue vide pendant tout le TTL.
    if (!result.known) {
        return NextResponse.json(
            {
                status: "empty",
                vehicleId,
                error: "Aucune pièce de freinage au référentiel pour ce véhicule. Essayez la recherche manuelle marque, modèle, motorisation.",
            },
            { status: 404 }
        );
    }

    return NextResponse.json({ status: "synced", vehicleId, articles: result.articles });
}

export async function POST(request: Request) {
    return withRequestContext("vehicle/sync", () => handlePost(request));
}
