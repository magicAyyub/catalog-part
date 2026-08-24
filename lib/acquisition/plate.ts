import { CATEGORIES } from "@/lib/config";
import { getVehicleArticles } from "@/lib/acquisition/catalog";
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
