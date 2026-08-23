import { NextResponse } from "next/server";
import { logger, type LogContext } from "@/lib/logger";

/**
 * RapidAPI failures, and the French sentence the counter reads.
 * Same shape as `lib/plate/errors.ts`: one type to catch, one place to map it.
 */

export type RapidApiErrorCode =
    | "no_credentials"
    | "quota_exceeded"
    | "rate_limited"
    | "unauthorized"
    | "upstream"
    | "transport";

export class RapidApiError extends Error {
    constructor(
        message: string,
        readonly code: RapidApiErrorCode,
        /** Upstream HTTP status, absent when the call never got an answer. */
        readonly status?: number
    ) {
        super(message);
        this.name = "RapidApiError";
    }
}

/** French end-user message for a RapidAPI failure. */
export function friendlyRapidApiError(error: unknown): string {
    if (!(error instanceof RapidApiError)) {
        return "Une erreur est survenue lors de la récupération des données auprès de l'API.";
    }
    switch (error.code) {
        case "no_credentials":
            return "Clé RapidAPI absente de la configuration du serveur : renseignez RAPIDAPI_KEY dans le fichier .env.";
        case "quota_exceeded":
            return "Votre quota mensuel d'appels RapidAPI a été dépassé. Les véhicules déjà en base restent consultables ; la mise à niveau du plan se fait sur RapidAPI.";
        case "rate_limited":
            return "Trop de requêtes envoyées à l'API en même temps. Veuillez réessayer dans quelques secondes.";
        case "unauthorized":
            return "Clé RapidAPI incorrecte ou non autorisée. Veuillez vérifier la variable RAPIDAPI_KEY dans votre fichier .env.";
        case "transport":
            return "L'API est momentanément injoignable. Veuillez réessayer dans un instant.";
        default:
            return "Le service de catalogue est momentanément indisponible.";
    }
}

function statusFor(error: unknown): number {
    if (!(error instanceof RapidApiError)) return 500;
    switch (error.code) {
        // Un throttle est relayé tel quel pour que le client patiente.
        case "quota_exceeded":
        case "rate_limited":
            return 429;
        // Clé absente : c'est notre configuration, pas la requête.
        case "no_credentials":
            return 500;
        default:
            return 502;
    }
}

/**
 * Logs the failure and builds the response. `withRequestContext` already puts the
 * route on every log line, so `context` only carries what identifies the lookup.
 */
export function rapidApiFailure(error: unknown, context?: LogContext): NextResponse {
    logger.error("RapidAPI request failed", { ...context, error });
    return NextResponse.json({ error: friendlyRapidApiError(error) }, { status: statusFor(error) });
}
