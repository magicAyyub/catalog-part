import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { vehicleSelections, vehicles } from "@/lib/db/schema";
import type { Vehicle } from "@/lib/db/queries/vehicles";

/**
 * Dernier véhicule consulté, conservé côté serveur.
 *
 * Le navigateur garde déjà la sélection courante, mais elle disparaît avec le
 * cache client. Une ligne par utilisateur suffit : c'est le dernier véhicule
 * qui est attendu au retour, pas un historique.
 */

export async function findLastSelection(userId: string): Promise<Vehicle | null> {
    const [row] = await db
        .select({ vehicle: vehicles })
        .from(vehicleSelections)
        .innerJoin(vehicles, eq(vehicleSelections.vehicleId, vehicles.vehicleId))
        .where(eq(vehicleSelections.userId, userId))
        .limit(1);
    return row?.vehicle ?? null;
}

export async function saveLastSelection(userId: string, vehicleId: number): Promise<void> {
    await db
        .insert(vehicleSelections)
        .values({ userId, vehicleId, selectedAt: new Date() })
        .onConflictDoUpdate({
            target: vehicleSelections.userId,
            set: { vehicleId, selectedAt: new Date() },
        });
}
