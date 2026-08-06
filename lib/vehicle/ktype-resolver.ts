/**
 * lib/vehicle/ktype-resolver.ts
 *
 * Reconstitue, à partir d'un K-Type, la fiche véhicule complète que produisait
 * la cascade manuelle marque → modèle → motorisation.
 *
 * Pourquoi ce détour : il n'existe aucun endpoint RapidAPI inverse
 * (K-Type → marque/modèle/motorisation). Les seules données de motorisation
 * viennent de `Engine_Types_by_Model`, qui exige un `modelId`. On remonte donc
 * la chaîne par les libellés — ceux d'app-etf sont identiques à ceux de RapidAPI
 * ("307 (3A/C)", "PUNTO EVO (199_)") — puis on VÉRIFIE en cherchant le K-Type
 * dans les motorisations du modèle candidat. Aucun rapprochement par nom n'est
 * donc jamais accepté sans confirmation par l'identifiant.
 *
 * Les trois listes consultées passent par `getWithCache`, avec les mêmes clés
 * que les routes de la cascade (`manufacturers`, `models_<id>`,
 * `engine_types_<id>`) : le cache est donc partagé avec l'UI, et un véhicule
 * déjà exploré ne coûte aucun appel.
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
    /** true si la motorisation a été confirmée dans le référentiel TecDoc. */
    confirmed: boolean;
}

/** Comparaison de libellés tolérante : casse, accents, ponctuation, espaces. */
function normalizeLabel(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, " ")
        .trim();
}

/**
 * Écarts de dénomination entre le portail fournisseur et TecDoc.
 * À compléter au fil des marques rencontrées.
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
 * Modèles candidats, du plus probable au moins probable.
 *
 * L'ordre compte : « 307 (3A/C) » doit être essayé avant « 307 SW (3H) » et
 * « 307 CC (3B) », sinon on paie des appels inutiles. La confirmation par
 * K-Type garantit qu'un mauvais ordre ne donne jamais un mauvais résultat, il
 * coûte juste un appel de plus.
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

/** Fiche minimale, utilisée quand TecDoc ne confirme pas la motorisation. */
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
 * K-Type + libellés → fiche véhicule complète.
 *
 * Ne échoue jamais : si la remontée par libellés n'aboutit pas, on renvoie une
 * fiche dégradée avec `confirmed: false`. C'est volontaire — la suite du
 * pipeline (articles, critères, détails) ne consomme que `vehicleId`, et le
 * K-Type est déjà certain. Le reste n'est que de l'affichage.
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

        logger.warn("K-Type not found in any candidate model — degraded vehicle record", {
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
        logger.warn("K-Type enrichment failed — falling back to labels", {
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