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

const LANG_ID = process.env.LANG_ID;
const COUNTRY_FILTER_ID = process.env.COUNTRY_FILTER_ID;
const TYPE_ID = process.env.TYPE_ID;

const RAPIDAPI_BASE_URL = process.env.BASE_URL ?? "https://auto-parts-catalog.p.rapidapi.com";

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
    const apiKey = process.env.RAPIDAPI_KEY;
    if (!apiKey) {
        throw new Error("RAPIDAPI_KEY manquante dans les variables d'environnement.");
    }

    billedCalls++;
    logger.info("RapidAPI HTTP call executed", { action: "rapidapi_call", path });

    for (let attempt = 1; attempt <= retries; attempt++) {
        const res = await fetch(`${RAPIDAPI_BASE_URL}${path}`, {
            method: "GET",
            headers: {
                "x-rapidapi-key": apiKey,
                "x-rapidapi-host": "auto-parts-catalog.p.rapidapi.com",
                "Content-Type": "application/json",
            },
            cache: "no-store",
        });

        if (res.status === 429) {
            const body = await res.text().catch(() => "");
            const lowerBody = body.toLowerCase();

            if (lowerBody.includes("monthly") || lowerBody.includes("quota")) {
                throw new Error(`RapidAPI ${path} -> 429 Too Many Requests : ${body}`);
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
        }

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`RapidAPI ${path} -> ${res.status} ${res.statusText} : ${body}`);
        }

        return res.json() as Promise<T>;
    }

    throw new Error(`RapidAPI ${path} -> Rate limit dépassé de façon persistante après ${retries} tentatives.`);
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