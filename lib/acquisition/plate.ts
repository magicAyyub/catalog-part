import { CATEGORIES } from "@/lib/config";
import { getVehicleArticles } from "@/lib/acquisition/catalog";
import { getManufacturers, getModels } from "@/lib/acquisition/cascade";
import { matchManufacturer, matchModel } from "@/lib/vehicle/label-match";
import { findVehicle, type Vehicle } from "@/lib/db/queries/vehicles";
import type { PlateIdentity } from "@/lib/plate/identify";
import { logger } from "@/lib/logger";

/**
 * Véhicule d'une plaque, acquis au besoin.
 *
 * Le K-Type rendu par Exadis est le `vehicleId` TecDoc : les pièces se
 * demandent directement, sans rejouer la cascade. C'est la fiche véhicule qui
 * manque, aucun endpoint ne la rendant à partir du seul `vehicleId`, et elle
 * est donc composée avec les libellés du fournisseur.
 *
 * Cette fiche n'est écrite que si la première catégorie ramène des articles.
 * L'identifiant d'un fournisseur n'est pas toujours un K-Type, et une fiche
 * inventée resterait dans le référentiel sans jamais porter de pièce.
 */
export async function getVehicleForPlate(identity: PlateIdentity): Promise<Vehicle | null> {
    const known = await findVehicle(identity.kType);
    if (known) return known;

    // Sans libellés lisibles, la fiche n'aurait pas de nom affichable et la
    // cascade ne la corrigerait qu'en passant par ce modèle, ce que la plaque
    // cherche précisément à éviter.
    if (!identity.brand || !identity.model) {
        logger.warn("Plate vehicle unknown and labels unusable", {
            module: "acquisition",
            action: "plate_vehicle_skipped",
            kType: identity.kType,
        });
        return null;
    }

    await getVehicleArticles(identity.kType, CATEGORIES[0].categoryId, {
        vehicleId: identity.kType,
        manufacturerName: identity.brand,
        modelName: identity.model,
        typeEngineName: identity.version ?? "",
    });

    const acquired = await findVehicle(identity.kType);
    logger.info("Plate vehicle acquisition attempted", {
        module: "acquisition",
        action: "plate_vehicle_learned",
        kType: identity.kType,
        acquired: acquired !== null,
    });

    return acquired;
}

/** De quoi ouvrir la cascade sur le bon rayon quand le K-Type n'a rien donné. */
export interface CascadeSuggestion {
    manufacturerId: number;
    manufacturerName: string;
    modelId: number | null;
    modelName: string | null;
    /** Motorisation telle qu'Exadis la nomme. Affichée, jamais choisie. */
    version: string | null;
}

/**
 * Cascade préremplie à partir des libellés du fournisseur.
 *
 * Recours quand le K-Type n'est pas au catalogue. Rien n'est deviné : le
 * rapprochement n'aboutit que sur un candidat unique, et le comptoir voit et
 * corrige ce qui est proposé.
 *
 * Le modèle peut échouer là où la marque réussit, auquel cas il reste une liste
 * à dérouler au lieu de deux. Les appels dépensés ici sont ceux que la cascade
 * aurait payés de toute façon en se déroulant à la main.
 */
export async function suggestCascadeFromPlate(
    identity: PlateIdentity
): Promise<CascadeSuggestion | null> {
    if (!identity.brand) return null;

    const manufacturer = matchManufacturer(await getManufacturers(), identity.brand);
    if (!manufacturer) {
        logger.warn("Supplier brand matched no manufacturer", {
            module: "acquisition",
            action: "plate_brand_miss",
            kType: identity.kType,
            brand: identity.brand,
        });
        return null;
    }

    const model = identity.model
        ? matchModel(await getModels(manufacturer.manufacturerId), identity.model)
        : null;

    logger.info("Cascade suggested from plate labels", {
        module: "acquisition",
        action: "plate_cascade_suggested",
        kType: identity.kType,
        manufacturerId: manufacturer.manufacturerId,
        modelId: model?.modelId ?? null,
    });

    return {
        manufacturerId: manufacturer.manufacturerId,
        manufacturerName: manufacturer.name,
        modelId: model?.modelId ?? null,
        modelName: model?.name ?? null,
        version: identity.version ?? null,
    };
}
