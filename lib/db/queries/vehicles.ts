import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { manufacturers, models, vehicles } from "@/lib/db/schema";

/**
 * Lecture de la cascade constructeur, modèle, motorisation.
 *
 * Tout se sert depuis la base. Ce qui n'y est pas encore relève de
 * l'acquisition, jamais de ces fonctions.
 */

export type Manufacturer = typeof manufacturers.$inferSelect;
export type Model = typeof models.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;

export function listManufacturers(): Promise<Manufacturer[]> {
    return db.select().from(manufacturers).orderBy(asc(manufacturers.name));
}

export function listModels(manufacturerId: number): Promise<Model[]> {
    return db
        .select()
        .from(models)
        .where(eq(models.manufacturerId, manufacturerId))
        .orderBy(asc(models.name));
}

/** Motorisations d'un modèle, le dernier niveau avant la recherche de pièces. */
export function listVehicles(modelId: number): Promise<Vehicle[]> {
    return db
        .select()
        .from(vehicles)
        .where(eq(vehicles.modelId, modelId))
        .orderBy(asc(vehicles.typeEngineName));
}

export async function findVehicle(vehicleId: number): Promise<Vehicle | null> {
    const [row] = await db.select().from(vehicles).where(eq(vehicles.vehicleId, vehicleId)).limit(1);
    return row ?? null;
}
