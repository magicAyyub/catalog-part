import type {
    ApiManufacturersResponse,
    ApiModelsResponse,
    ApiEngineTypesResponse,
    ApiCategoriesResponse,
    ApiArticleListResponse,
    ApiArticleDetails,
    ApiSparePartCriteriaResponse,
    ApiSupplier,
    ApiMediaItem,
} from "./types";
import { logger } from "@/lib/logger";
import { RapidApiError } from "./errors";
import {
    COUNTRY_FILTER_ID,
    LANG_ID,
    RAPIDAPI_BASE_URL,
    RAPIDAPI_KEY,
    TYPE_ID,
} from "@/lib/config";

function assertServerSide() {
    if (typeof window !== "undefined") {
        throw new Error(
            "rapidapi/client ne doit jamais être importé côté client : la clé API fuiterait dans le bundle navigateur."
        );
    }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Every billed request goes through `callRealApi`, so counting here is the only
 * place that cannot drift. Retries do not count: the quota is charged once per
 * call, and this mirrors the `rapidapi_call` log line.
 */
let billedCalls = 0;

/** Monotonic since process start. Callers measure deltas around an operation. */
export function billedCallCount(): number {
    return billedCalls;
}

async function callRealApi<T>(path: string, retries = 5, backoff = 500): Promise<T> {
    if (!RAPIDAPI_KEY) {
        throw new RapidApiError(
            "RAPIDAPI_KEY manquante dans les variables d'environnement.",
            "no_credentials"
        );
    }

    billedCalls++;
    logger.info("RapidAPI HTTP call executed", { action: "rapidapi_call", path });

    for (let attempt = 1; attempt <= retries; attempt++) {
        let res: Response;
        try {
            res = await fetch(`${RAPIDAPI_BASE_URL}${path}`, {
                method: "GET",
                headers: {
                    "x-rapidapi-key": RAPIDAPI_KEY,
                    "x-rapidapi-host": "auto-parts-catalog.p.rapidapi.com",
                    "Content-Type": "application/json",
                },
                cache: "no-store",
            });
        } catch (cause) {
            // DNS, TLS, socket : aucune réponse n'est revenue.
            throw new RapidApiError(
                `RapidAPI ${path} -> injoignable : ${cause instanceof Error ? cause.message : String(cause)}`,
                "transport"
            );
        }

        if (res.status === 429) {
            const body = await res.text().catch(() => "");
            const lowerBody = body.toLowerCase();

            // Le quota mensuel ne se recharge pas sur un backoff, contrairement
            // à la limite par seconde : inutile de réessayer.
            if (lowerBody.includes("monthly") || lowerBody.includes("quota")) {
                throw new RapidApiError(
                    `RapidAPI ${path} -> 429 Too Many Requests`,
                    "quota_exceeded",
                    429
                );
            }

            if (attempt < retries) {
                const sleepTime = backoff * Math.pow(2, attempt) + Math.random() * 100;
                logger.warn("RapidAPI 429 rate limit hit, retrying", {
                    action: "rapidapi_retry",
                    path,
                    attempt,
                    sleepMs: Math.round(sleepTime),
                });
                await delay(sleepTime);
                continue;
            }

            throw new RapidApiError(
                `RapidAPI ${path} -> 429 Too Many Requests après ${retries} tentatives`,
                "rate_limited",
                429
            );
        }

        if (!res.ok) {
            throw new RapidApiError(
                `RapidAPI ${path} -> ${res.status} ${res.statusText}`,
                res.status === 401 || res.status === 403 ? "unauthorized" : "upstream",
                res.status
            );
        }

        return res.json() as Promise<T>;
    }

    // Inatteignable : la dernière tentative renvoie ou lève. Présent pour le typage.
    throw new RapidApiError(
        `RapidAPI ${path} -> Rate limit dépassé de façon persistante après ${retries} tentatives.`,
        "rate_limited",
        429
    );
}

async function callApi<T>(path: string): Promise<T> {
    assertServerSide();
    return callRealApi<T>(path);
}

export const rapidApi = {
    listManufacturers: () =>
        callApi<ApiManufacturersResponse>(`/manufacturers/list/type-id/${TYPE_ID}`),

    listModels: (manufacturerId: number) =>
        callApi<ApiModelsResponse>(
            `/models/list/type-id/${TYPE_ID}/manufacturer-id/${manufacturerId}/lang-id/${LANG_ID}/country-filter-id/${COUNTRY_FILTER_ID}`
        ),

    listEngineTypes: (modelId: number) =>
        callApi<ApiEngineTypesResponse>(
            `/types/type-id/${TYPE_ID}/list-vehicles-types/${modelId}/lang-id/${LANG_ID}/country-filter-id/${COUNTRY_FILTER_ID}`
        ),

    listCategoriesForVehicle: (vehicleId: number) =>
        callApi<ApiCategoriesResponse>(
            `/category/type-id/${TYPE_ID}/products-groups-variant-3/${vehicleId}/lang-id/${LANG_ID}`
        ),

    listArticles: (vehicleId: number, categoryId: number) =>
        callApi<ApiArticleListResponse>(
            `/articles/list/type-id/${TYPE_ID}/vehicle-id/${vehicleId}/category-id/${categoryId}/lang-id/${LANG_ID}`
        ),

    getArticleDetails: (articleId: number) =>
        callApi<ApiArticleDetails>(
            `/articles/article-complete-details/type-id/${TYPE_ID}?langId=${LANG_ID}&countryFilterId=${COUNTRY_FILTER_ID}&articleId=${articleId}`
        ),

    getArticleMedia: (articleId: number) =>
        callApi<ApiMediaItem[]>(`/articles/article-all-media-info?articleId=${articleId}&langId=${LANG_ID}`),

    getSparePartCriteria: (productId: number, vehicleId: number, supplierId: number) =>
        callApi<ApiSparePartCriteriaResponse>(
            `/articles/selection-of-the-criteria-for-articles-and-vehicle/type-id/${TYPE_ID}/product-id/${productId}/vehicle-id/${vehicleId}/supplier-id/${supplierId}/lang-id/${LANG_ID}/country-filter-id/${COUNTRY_FILTER_ID}`
        ),

    listAllSuppliers: () => callApi<ApiSupplier[]>(`/suppliers/list`),
};