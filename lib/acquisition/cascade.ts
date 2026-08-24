import { sql } from "drizzle-orm";
import { rapidApi } from "@/lib/rapidapi/client";
import { db } from "@/lib/db/client";
import { manufacturers, models, vehicles } from "@/lib/db/schema";
import {
    listManufacturers,
    listModels,
    listVehicles,
    type Manufacturer,
    type Model,
    type Vehicle,
} from "@/lib/db/queries/vehicles";
import { chunked } from "@/lib/acquisition/chunk";

/**
 * Cascade constructeur, modèle, motorisation, servie depuis la base et complétée
 * au premier passage seulement.
 *
 * Un niveau vide vaut « jamais interrogé » : aucun constructeur n'a zéro modèle
 * et aucun modèle zéro motorisation, donc le vide ne peut venir que d'une
 * absence d'acquisition.
 */

export async function getManufacturers(): Promise<Manufacturer[]> {
    const known = await listManufacturers();
    if (known.length > 0) return known;

    const { manufacturers: fetched } = await rapidApi.listManufacturers();

    db.transaction((tx) => {
        for (const rows of chunked(fetched)) {
            tx.insert(manufacturers)
                .values(
                    rows.map((m) => ({
                        manufacturerId: m.manufacturerId,
                        name: m.manufacturerName,
                    }))
                )
                .onConflictDoNothing()
                .run();
        }
    });

    return listManufacturers();
}

export async function getModels(manufacturerId: number): Promise<Model[]> {
    const known = await listModels(manufacturerId);
    if (known.length > 0) return known;

    const { models: fetched } = await rapidApi.listModels(manufacturerId);

    db.transaction((tx) => {
        for (const rows of chunked(fetched)) {
            tx.insert(models)
                .values(
                    rows.map((m) => ({
                        modelId: m.modelId,
                        manufacturerId,
                        name: m.modelName,
                        yearFrom: m.modelYearFrom,
                        yearTo: m.modelYearTo,
                    }))
                )
                .onConflictDoNothing()
                .run();
        }
    });

    return listModels(manufacturerId);
}

export async function getVehicles(modelId: number): Promise<Vehicle[]> {
    const known = await listVehicles(modelId);
    if (known.length > 0) return known;

    const { modelTypes } = await rapidApi.listEngineTypes(modelId);

    db.transaction((tx) => {
        for (const rows of chunked(modelTypes)) {
            tx.insert(vehicles)
                .values(
                    rows.map((v) => ({
                        vehicleId: v.vehicleId,
                        modelId,
                        manufacturerName: v.manufacturerName,
                        modelName: v.modelName,
                        typeEngineName: v.typeEngineName,
                        engineCodes: v.engineCodes,
                        engineId: v.engId,
                        powerKw: toNumber(v.powerKw),
                        powerPs: toNumber(v.powerPs),
                        fuelType: v.fuelType,
                        bodyType: v.bodyType,
                        numberOfCylinders: v.numberOfCylinders,
                        capacityLt: toNumber(v.capacityLt),
                        capacityTech: toNumber(v.capacityTech),
                        constructionIntervalStart: v.constructionIntervalStart,
                        constructionIntervalEnd: v.constructionIntervalEnd,
                    }))
                )
                // La cascade est la source la plus riche : elle écrase une fiche
                // apprise par les véhicules compatibles ou par une plaque, y
                // compris ses libellés, qui viennent alors d'un fournisseur.
                .onConflictDoUpdate({
                    target: vehicles.vehicleId,
                    set: {
                        modelId,
                        manufacturerName: sql`excluded.manufacturer_name`,
                        modelName: sql`excluded.model_name`,
                        typeEngineName: sql`excluded.type_engine_name`,
                        engineCodes: sql`excluded.engine_codes`,
                        engineId: sql`excluded.engine_id`,
                        powerKw: sql`excluded.power_kw`,
                        powerPs: sql`excluded.power_ps`,
                        fuelType: sql`excluded.fuel_type`,
                        bodyType: sql`excluded.body_type`,
                        numberOfCylinders: sql`excluded.number_of_cylinders`,
                        capacityLt: sql`excluded.capacity_lt`,
                        capacityTech: sql`excluded.capacity_tech`,
                    },
                })
                .run();
        }
    });

    return listVehicles(modelId);
}

/** L'API rend les valeurs numériques en chaînes, parfois vides. */
function toNumber(raw: string | null): number | null {
    if (!raw) return null;
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
}
