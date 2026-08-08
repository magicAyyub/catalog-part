/**
 * Rebuilds the full vehicle record from a K-Type alone.
 *
 * RapidAPI has no reverse endpoint, and engine data only comes from
 * `Engine_Types_by_Model` which needs a `modelId`. So the chain is walked back
 * through labels, which app-etf reports identically to RapidAPI, then verified
 * by finding the K-Type among the candidate model's engine types. No label match
 * is accepted without that confirmation.
 *
 * The lists reuse the cascade cache keys, so an already explored vehicle costs
 * nothing.
 */

import { rapidApi } from "@/lib/rapidapi/client";
import { getWithCache } from "@/lib/vehicle/api-cache";
import { logger } from "@/lib/logger";
import type { ApiEngineType, ApiManufacturer, ApiModel } from "@/lib/rapidapi/types";

export interface ResolvedVehicle {
    vehicleId: number;
    manufacturerId: number;
    modelId: number;
    engineType: ApiEngineType;
    /** True when the engine line was confirmed against the TecDoc referential. */
    confirmed: boolean;
}

/** Lenient label comparison: case, accents, punctuation, whitespace. */
function normalizeLabel(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, " ")
        .trim();
}

/**
 * Naming gaps between the supplier portal and TecDoc.
 * Extend as brands are encountered.
 */
const BRAND_ALIASES: Record<string, string[]> = {
    VW: ["VOLKSWAGEN"],
    VOLKSWAGEN: ["VW"],
    MERCEDES: ["MERCEDES BENZ"],
    "MERCEDES BENZ": ["MERCEDES"],
    CITROEN: ["CITROEN"],
    ALFA: ["ALFA ROMEO"],
    LAND: ["LAND ROVER"],
    DS: ["DS AUTOMOBILES"],
};

function findManufacturer(list: ApiManufacturer[], brand: string): ApiManufacturer | null {
    const target = normalizeLabel(brand);
    if (!target) return null;

    const exact = list.find((m) => normalizeLabel(m.manufacturerName) === target);
    if (exact) return exact;

    for (const alias of BRAND_ALIASES[target] ?? []) {
        const hit = list.find((m) => normalizeLabel(m.manufacturerName) === normalizeLabel(alias));
        if (hit) return hit;
    }

    // Dernier recours : le libellé TecDoc commence par celui du fournisseur
    // ("MERCEDES" → "MERCEDES-BENZ"). Jamais l'inverse, trop permissif.
    return list.find((m) => normalizeLabel(m.manufacturerName).startsWith(target)) ?? null;
}

/**
 * Candidate models, most likely first. Order only affects cost: confirmation by
 * K-Type guarantees a bad order never yields a wrong result.
 */
function rankModelCandidates(models: ApiModel[], modelLabel: string): ApiModel[] {
    const target = normalizeLabel(modelLabel);
    if (!target) return [];

    const exact: ApiModel[] = [];
    const prefix: ApiModel[] = [];
    const contains: ApiModel[] = [];

    for (const m of models) {
        const label = normalizeLabel(m.modelName);
        if (label === target) exact.push(m);
        else if (label.startsWith(target) || target.startsWith(label)) prefix.push(m);
        else if (label.includes(target) || target.includes(label)) contains.push(m);
    }

    return [...exact, ...prefix, ...contains];
}

/** Minimal record, used when TecDoc does not confirm the engine line. */
function fallbackEngineType(kType: number, brand: string, model: string): ApiEngineType {
    return {
        vehicleId: kType,
        manufacturerName: brand || "Marque inconnue",
        modelName: model || "Modèle inconnu",
        typeEngineName: model || "Motorisation inconnue",
        constructionIntervalStart: "",
        constructionIntervalEnd: null,
        powerKw: "",
        powerPs: "",
        capacityTax: null,
        fuelType: "Inconnu",
        bodyType: "",
        numberOfCylinders: 0,
        capacityLt: "",
        capacityTech: "",
        engineCodes: "",
        engId: kType,
    };
}

/**
 * K-Type plus labels to a full vehicle record. Never fails: an unresolved label
 * walk returns a degraded record with `confirmed: false`, which is safe because
 * the rest of the pipeline consumes only `vehicleId`.
 */
export async function resolveVehicleFromKType(
    kType: number,
    brand: string,
    modelLabel: string
): Promise<ResolvedVehicle> {
    const started = Date.now();

    try {
        const manufacturers = await getWithCache<ApiManufacturer[]>("manufacturers", async () => {
            const { manufacturers: list } = await rapidApi.listManufacturers();
            return [...list].sort((a, b) => a.manufacturerName.localeCompare(b.manufacturerName));
        });

        const manufacturer = findManufacturer(manufacturers, brand);
        if (!manufacturer) {
            logger.warn("Manufacturer label not found in TecDoc referential", {
                module: "ktype-resolver",
                action: "manufacturer_miss",
                kType,
                brand,
            });
            return {
                vehicleId: kType,
                manufacturerId: 0,
                modelId: 0,
                engineType: fallbackEngineType(kType, brand, modelLabel),
                confirmed: false,
            };
        }

        const models = await getWithCache<ApiModel[]>(
            `models_${manufacturer.manufacturerId}`,
            async () => (await rapidApi.listModels(manufacturer.manufacturerId)).models
        );

        const candidates = rankModelCandidates(models, modelLabel);

        for (const candidate of candidates) {
            const engineTypes = await getWithCache<ApiEngineType[]>(
                `engine_types_${candidate.modelId}`,
                async () => (await rapidApi.listEngineTypes(candidate.modelId)).modelTypes
            );

            // `Engine_Types_by_Model` renvoie parfois deux lignes identiques pour
            // un même vehicleId (constaté sur FIAT PUNTO EVO / 32251) : la
            // première suffit.
            const match = engineTypes.find((t) => t.vehicleId === kType);
            if (match) {
                logger.info("K-Type confirmed against TecDoc referential", {
                    module: "ktype-resolver",
                    action: "confirmed",
                    kType,
                    manufacturerId: manufacturer.manufacturerId,
                    modelId: candidate.modelId,
                    typeEngineName: match.typeEngineName,
                    candidatesTried: candidates.indexOf(candidate) + 1,
                    durationMs: Date.now() - started,
                });
                return {
                    vehicleId: kType,
                    manufacturerId: manufacturer.manufacturerId,
                    modelId: candidate.modelId,
                    engineType: match,
                    confirmed: true,
                };
            }
        }

        logger.warn("K-Type not found in any candidate model, degraded vehicle record", {
            module: "ktype-resolver",
            action: "unconfirmed",
            kType,
            brand,
            modelLabel,
            manufacturerId: manufacturer.manufacturerId,
            candidatesTried: candidates.length,
            durationMs: Date.now() - started,
        });

        return {
            vehicleId: kType,
            manufacturerId: manufacturer.manufacturerId,
            modelId: candidates[0]?.modelId ?? 0,
            engineType: fallbackEngineType(kType, brand, modelLabel),
            confirmed: false,
        };
    } catch (error: unknown) {
        // Quota RapidAPI dépassé, réseau, etc. : le K-Type reste exploitable.
        logger.warn("K-Type enrichment failed, falling back to labels", {
            module: "ktype-resolver",
            action: "enrichment_error",
            kType,
            brand,
            modelLabel,
            error,
        });
        return {
            vehicleId: kType,
            manufacturerId: 0,
            modelId: 0,
            engineType: fallbackEngineType(kType, brand, modelLabel),
            confirmed: false,
        };
    }
}