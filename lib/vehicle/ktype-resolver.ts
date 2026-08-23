/**
 * Rebuilds the full vehicle record from the identifier a supplier returns.
 *
 * RapidAPI has no reverse endpoint, and engine data only comes from
 * `Engine_Types_by_Model` which needs a `modelId`. The local index answers
 * first, at no billed call. An unknown identifier falls back to walking the
 * chain back through labels, then confirming against the candidate model's
 * engine types. Nothing is returned as confirmed without that step.
 *
 * Confirmation happens twice, in this order:
 *
 *   the identifier is among the model's engine types  -> it is a K-Type
 *   the engine label matches exactly one of them      -> the identifier was not
 *                                                        a K-Type, and the real
 *                                                        one is taken from the
 *                                                        referential instead
 *
 * The second rule exists because the supplier's nine digit field is not always
 * a K-Type. Measured on a TOYOTA PRIUS III: Exadis answered 31134, which is in
 * no TecDoc model, while its engine label `1.8 Hybrid (ZVW3_)` names K-Type
 * 115456 exactly. Both rules read a payload already fetched, so the recovery
 * costs no billed call.
 *
 * Every response fetched on that path is banked, so the walk pays for itself:
 * one call teaches the index around twenty K-Types rather than one.
 */

import { rapidApi } from "@/lib/rapidapi/client";
import { getWithCache } from "@/lib/vehicle/api-cache";
import { findVehicleByKType, rememberEngineTypes } from "@/lib/vehicle/vehicle-index";
import { logger } from "@/lib/logger";
import type { ApiEngineType, ApiManufacturer, ApiModel } from "@/lib/rapidapi/types";

/** How the record was obtained. Absent when nothing confirmed it. */
export type VehicleMatch = "index" | "ktype" | "engine_label";

export interface ResolvedVehicle {
    /**
     * The TecDoc vehicle id, which on an `engine_label` match is NOT the
     * identifier the supplier returned. Everything downstream buys parts on
     * this value, so it must always come from the referential.
     */
    vehicleId: number;
    manufacturerId: number;
    modelId: number;
    engineType: ApiEngineType;
    /** True when the engine line was confirmed against the TecDoc referential. */
    confirmed: boolean;
    matchedBy?: VehicleMatch;
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

/** Separators dropped entirely, so `M.G.` and `MG` compare equal. */
function compactLabel(s: string): string {
    return normalizeLabel(s).replace(/ /g, "");
}

/**
 * How many brand candidates are walked. A brand splits into several TecDoc
 * entries often enough to matter, `MG`, `MG (NANJING)` and `MG (SAIC)` for one
 * supplier label, and each one tried costs a `models_<id>` call. That call is
 * cached with no expiry, so the price is paid once, but an unbounded list would
 * still let one unlucky label fan out.
 */
const MAX_BRAND_CANDIDATES = 3;

/**
 * Candidate manufacturers, most likely first.
 *
 * Order only affects cost: confirmation happens on the K-Type or the engine
 * label further down, so a bad order never yields a wrong vehicle. Returning
 * several is what a punctuated supplier label needs. Measured on a plate that
 * came back as `M.G.`: normalisation turns the dots into a space, `M G` matches
 * none of the three MG entries, and the whole lookup used to stop there.
 */
function rankManufacturerCandidates(list: ApiManufacturer[], brand: string): ApiManufacturer[] {
    const target = normalizeLabel(brand);
    if (!target) return [];

    const compact = compactLabel(brand);
    const aliases = new Set((BRAND_ALIASES[target] ?? []).map(normalizeLabel));

    const exact: ApiManufacturer[] = [];
    const aliased: ApiManufacturer[] = [];
    const compacted: ApiManufacturer[] = [];
    const prefix: ApiManufacturer[] = [];

    for (const m of list) {
        const label = normalizeLabel(m.manufacturerName);
        if (label === target) exact.push(m);
        else if (aliases.has(label)) aliased.push(m);
        else if (compactLabel(m.manufacturerName) === compact) compacted.push(m);
        // Le libellé TecDoc commence par celui du fournisseur ("MERCEDES" →
        // "MERCEDES-BENZ", "MG" → "MG (SAIC)"). Jamais l'inverse, trop permissif.
        else if (compactLabel(m.manufacturerName).startsWith(compact)) prefix.push(m);
    }

    return [...exact, ...aliased, ...compacted, ...prefix].slice(0, MAX_BRAND_CANDIDATES);
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

interface ExploredModel {
    manufacturerId: number;
    model: ApiModel;
    types: ApiEngineType[];
}

/**
 * The engine line whose TecDoc label matches the supplier's, across every model
 * already explored.
 *
 * Equality is exact once normalised. A looser rule would eventually pick a
 * neighbouring engine, and a wrong vehicle here means wrong brake parts at the
 * counter. Duplicate rows for one `vehicleId` are not an ambiguity, the
 * referential emits them; two distinct ids are, and nothing is chosen then.
 */
function matchEngineLabel(
    explored: ExploredModel[],
    engineLabel: string
): { manufacturerId: number; model: ApiModel; type: ApiEngineType } | null {
    const target = normalizeLabel(engineLabel);
    if (!target) return null;

    const hits: { manufacturerId: number; model: ApiModel; type: ApiEngineType }[] = [];
    for (const { manufacturerId, model, types } of explored) {
        for (const type of types) {
            if (normalizeLabel(type.typeEngineName) === target) {
                hits.push({ manufacturerId, model, type });
            }
        }
    }

    const distinct = new Set(hits.map((h) => h.type.vehicleId));
    if (distinct.size !== 1) return null;

    return hits[0];
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
 * Supplier identifier plus labels to a full vehicle record. Never throws: an
 * unresolved walk returns a degraded record with `confirmed: false`. That record
 * names no model and must not be used to buy parts, since nothing has
 * established that its `vehicleId` exists in TecDoc.
 */
export async function resolveVehicleFromKType(
    kType: number,
    brand: string,
    modelLabel: string,
    engineLabel = ""
): Promise<ResolvedVehicle> {
    const started = Date.now();

    try {
        const indexed = await findVehicleByKType(kType);
        if (indexed) {
            logger.info("K-Type resolved from the local index", {
                module: "ktype-resolver",
                action: "index_hit",
                kType,
                manufacturerId: indexed.manufacturerId,
                modelId: indexed.modelId,
                durationMs: Date.now() - started,
            });
            return {
                vehicleId: kType,
                manufacturerId: indexed.manufacturerId,
                modelId: indexed.modelId,
                engineType: indexed.engineType,
                confirmed: true,
                matchedBy: "index",
            };
        }

        const manufacturers = await getWithCache<ApiManufacturer[]>("manufacturers", async () => {
            const { manufacturers: list } = await rapidApi.listManufacturers();
            return [...list].sort((a, b) => a.manufacturerName.localeCompare(b.manufacturerName));
        });

        const brands = rankManufacturerCandidates(manufacturers, brand);
        if (brands.length === 0) {
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

        let modelsSeen = 0;

        for (const manufacturer of brands) {
            const models = await getWithCache<ApiModel[]>(
                `models_${manufacturer.manufacturerId}`,
                async () => (await rapidApi.listModels(manufacturer.manufacturerId)).models
            );

            const candidates = rankModelCandidates(models, modelLabel);
            modelsSeen += candidates.length;

            // Portée volontairement limitée à la marque courante : c'est ce qui
            // permet de conclure avant de payer la marque suivante.
            const explored: ExploredModel[] = [];

            for (const candidate of candidates) {
                const engineTypes = await getWithCache<ApiEngineType[]>(
                    `engine_types_${candidate.modelId}`,
                    async () => (await rapidApi.listEngineTypes(candidate.modelId)).modelTypes
                );

                // Le payload entier est mis en banque, y compris quand le K-Type
                // cherché n'y est pas : ces motorisations resserviront pour une
                // autre plaque du même modèle.
                const learned = await rememberEngineTypes(
                    engineTypes,
                    manufacturer.manufacturerId,
                    candidate.modelId
                );

                explored.push({
                    manufacturerId: manufacturer.manufacturerId,
                    model: candidate,
                    types: engineTypes,
                });

                // `Engine_Types_by_Model` renvoie parfois deux lignes identiques
                // pour un même vehicleId (constaté sur FIAT PUNTO EVO / 32251) :
                // la première suffit.
                const match = engineTypes.find((t) => t.vehicleId === kType);
                if (match) {
                    logger.info("K-Type confirmed against TecDoc referential", {
                        module: "ktype-resolver",
                        action: "confirmed",
                        kType,
                        manufacturerId: manufacturer.manufacturerId,
                        modelId: candidate.modelId,
                        typeEngineName: match.typeEngineName,
                        brandsTried: brands.indexOf(manufacturer) + 1,
                        candidatesTried: explored.length,
                        vehiclesLearned: learned,
                        durationMs: Date.now() - started,
                    });
                    return {
                        vehicleId: kType,
                        manufacturerId: manufacturer.manufacturerId,
                        modelId: candidate.modelId,
                        engineType: match,
                        confirmed: true,
                        matchedBy: "ktype",
                    };
                }
            }

            // Le libellé moteur est interrogé marque par marque, sur des payloads
            // déjà en cache, donc gratuitement. Le faire après la boucle entière
            // a coûté 3 appels sur la PRIUS : TOYOTA (FAW) et TOYOTA (GAC) ont
            // été achetés alors que la réponse était déjà dans TOYOTA.
            const byLabel = matchEngineLabel(explored, engineLabel);
            if (byLabel) {
                logger.warn("Supplier identifier is not a K-Type, vehicle recovered from its engine label", {
                    module: "ktype-resolver",
                    action: "engine_label_match",
                    supplierId: kType,
                    kType: byLabel.type.vehicleId,
                    manufacturerId: byLabel.manufacturerId,
                    modelId: byLabel.model.modelId,
                    engineLabel,
                    typeEngineName: byLabel.type.typeEngineName,
                    brandsTried: brands.indexOf(manufacturer) + 1,
                    durationMs: Date.now() - started,
                });
                return {
                    vehicleId: byLabel.type.vehicleId,
                    manufacturerId: byLabel.manufacturerId,
                    modelId: byLabel.model.modelId,
                    engineType: byLabel.type,
                    confirmed: true,
                    matchedBy: "engine_label",
                };
            }
        }

        logger.warn("Neither the K-Type nor the engine label matched, degraded vehicle record", {
            module: "ktype-resolver",
            action: "unconfirmed",
            kType,
            brand,
            modelLabel,
            engineLabel,
            manufacturerId: brands[0].manufacturerId,
            brandsTried: brands.length,
            modelsTried: modelsSeen,
            durationMs: Date.now() - started,
        });

        // `modelId` reste à zéro : la remontée vient précisément d'établir que le
        // véhicule n'est dans aucun modèle candidat, écrire le premier d'entre
        // eux fabriquerait une donnée que rien ne soutient.
        return {
            vehicleId: kType,
            manufacturerId: brands[0].manufacturerId,
            modelId: 0,
            engineType: fallbackEngineType(kType, brand, modelLabel),
            confirmed: false,
        };
    } catch (error) {
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