/**
 * Licence plate to TecDoc K-Type translation, through the deployed app-etf
 * service. That is its only role here: returning the `vehicleId` the RapidAPI
 * pipeline expects.
 *
 * app-etf gets the K-Type from Exadis (RPC #4). Preference only exposes a portal
 * internal `carId`, and confusing the two is why TecDoc calls used to return
 * nothing usable. Server only: the token must never reach the browser bundle.
 */

import { ETF_API_BASE_URL, ETF_API_TOKEN, ETF_API_TIMEOUT_MS } from "@/lib/config";
import { logger } from "@/lib/logger";

export class PlateLookupError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly code?: string
    ) {
        super(message);
        this.name = "PlateLookupError";
    }
}

/** What we keep from the app-etf response: vehicle identity, nothing else. */
export interface PlateVehicle {
    /** TecDoc K-Type, i.e. the `vehicleId` of the RapidAPI endpoints. */
    kType: number;
    /** Manufacturer label, aligned with RapidAPI's ("PEUGEOT"). */
    brand: string;
    /** Model label, aligned with RapidAPI's ("307 (3A/C)"). */
    model: string;
    /** Engine line when the service provides it; absent on the deployed build. */
    version: string | null;
    /** Preference internal id, kept for diagnostics only. */
    carId: string | null;
}

interface ByPlateResponse {
    vehicle?: {
        carId?: string;
        kType?: string | null;
        brand?: string;
        model?: string;
        version?: string;
    } | null;
    products?: unknown[];
    error?: { code?: string; message?: string } | string;
}

function errorInfo(body: ByPlateResponse): { code?: string; message: string } {
    const err = body?.error;
    if (typeof err === "string") return { message: err };
    return { code: err?.code, message: err?.message ?? "Erreur inconnue du service app-etf." };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `vehicle_not_found` is retryable: app-etf returns it both for an unknown plate
 * and for a transient scraper failure, and its 404 branch hides the error
 * details. Observed on 2026-08-06, GD928ZR answered 404 then 200 within a minute.
 */
const RETRYABLE = new Set(["vehicle_not_found", "internal"]);

/**
 * Resolves a plate into a vehicle identity. app-etf runs a full product scrape
 * (8 to 18 s) although only the vehicle header is kept, so callers are expected
 * to cache: a plate always designates the same vehicle.
 */
export async function fetchVehicleByPlate(plate: string, attempts = 2): Promise<PlateVehicle> {
    if (typeof window !== "undefined") {
        throw new Error(
            "lib/etf/plate-client ne doit jamais être importé côté client : le token fuiterait dans le bundle."
        );
    }
    if (!ETF_API_TOKEN) {
        throw new PlateLookupError(
            "ETF_API_TOKEN manquant dans .env : impossible de traduire une plaque en K-Type.",
            500
        );
    }

    const url = `${ETF_API_BASE_URL}?plate=${encodeURIComponent(plate)}`;
    let last: PlateLookupError | null = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        const started = Date.now();
        let res: Response;

        try {
            res = await fetch(url, {
                headers: { Authorization: `Bearer ${ETF_API_TOKEN}` },
                cache: "no-store",
                signal: AbortSignal.timeout(ETF_API_TIMEOUT_MS),
            });
        } catch (error: unknown) {
            const isTimeout = error instanceof Error && error.name === "TimeoutError";
            last = new PlateLookupError(
                isTimeout
                    ? "Le service d'identification n'a pas répondu dans le délai imparti."
                    : "Service d'identification injoignable.",
                504
            );
            logger.warn("app-etf plate lookup transport error", {
                module: "plate-client",
                action: "fetch_error",
                plate,
                attempt,
                durationMs: Date.now() - started,
                error,
            });
            if (attempt < attempts) {
                await delay(500 * attempt);
                continue;
            }
            throw last;
        }

        const durationMs = Date.now() - started;

        if (res.ok) {
            const data = (await res.json()) as ByPlateResponse;
            const v = data.vehicle;

            // Pas de repli sur `carId` : ce serait réintroduire le bug d'origine
            // (un identifiant Préférence envoyé aux endpoints TecDoc).
            const kType = Number.parseInt(v?.kType ?? "", 10);
            if (!v || !Number.isFinite(kType) || kType <= 0) {
                logger.warn("Vehicle resolved without a usable K-Type", {
                    module: "plate-client",
                    action: "missing_ktype",
                    plate,
                    carId: v?.carId ?? null,
                    durationMs,
                });
                throw new PlateLookupError(
                    "Véhicule identifié, mais son K-Type TecDoc n'a pas pu être déterminé. Utilisez la sélection manuelle marque / modèle / motorisation.",
                    502,
                    "no_ktype"
                );
            }

            logger.info("Plate translated to K-Type", {
                module: "plate-client",
                action: "ktype_resolved",
                plate,
                kType,
                carId: v.carId ?? null,
                brand: v.brand,
                model: v.model,
                attempt,
                durationMs,
            });

            return {
                kType,
                brand: v.brand ?? "",
                model: v.model ?? "",
                version: v.version ?? null,
                carId: v.carId ?? null,
            };
        }

        const body = (await res.json().catch(() => ({}))) as ByPlateResponse;
        const { code, message } = errorInfo(body);
        last = new PlateLookupError(message, res.status, code);

        const retryable = RETRYABLE.has(code ?? "") || res.status >= 500;
        logger.warn("app-etf plate lookup failed", {
            module: "plate-client",
            action: "lookup_error",
            plate,
            attempt,
            statusCode: res.status,
            code,
            retryable,
            durationMs,
        });

        if (!retryable || attempt >= attempts) break;
        await delay(800 * attempt);
    }

    throw last ?? new PlateLookupError("Échec inconnu du service d'identification.", 500);
}

/** French end-user message for a plate resolution failure. */
export function friendlyPlateError(error: unknown): string {
    if (!(error instanceof PlateLookupError)) {
        return "Une erreur est survenue lors de l'identification du véhicule.";
    }
    switch (error.code) {
        case "vehicle_not_found":
            return "Aucun véhicule trouvé pour cette immatriculation.";
        case "vehicle_no_fitments":
            return "Véhicule identifié, mais aucune pièce de freinage n'y est rattachée.";
        case "bad_plate":
            return "Format d'immatriculation invalide.";
        case "no_ktype":
            return error.message;
        default:
            break;
    }
    if (error.status === 401 || error.status === 403) {
        return "Accès au service d'identification refusé : token invalide ou révoqué.";
    }
    if (error.status === 504) {
        return "Le service d'identification met trop de temps à répondre. Réessayez dans un instant.";
    }
    return "Le service d'identification est momentanément indisponible.";
}