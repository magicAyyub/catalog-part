/**
 * Local K-Type index.
 *
 * RapidAPI has no endpoint answering "which vehicle is this K-Type". The only
 * source is `Engine_Types_by_Model`, which returns every engine line of a model,
 * around twenty per call. The resolver used to read the single line it wanted
 * and drop the rest, so the same information was bought again for the next
 * K-Type of the same model.
 *
 * Banking the whole response turns a call already paid for into a permanent
 * answer. A K-Type found here costs no billed call at all.
 */

import { and, count, eq, inArray, isNotNull, like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { apiCache, tdVehicle } from "@/lib/db/schema";
import type { ApiEngineType } from "@/lib/rapidapi/types";

export interface IndexedVehicle {
    manufacturerId: number;
    modelId: number;
    engineType: ApiEngineType;
}

export interface HarvestResult {
    payloads: number;
    processed: number;
    learned: number;
    skipped: number;
}


/**
 * A K-Type is only answered from here when the row carries its manufacturer and
 * model. The indexer inserts placeholder rows for vehicles it meets without a
 * legacy record, and those cannot stand in for a resolution.
 */
export async function findVehicleByKType(kType: number): Promise<IndexedVehicle | null> {
    const [row] = await db.select().from(tdVehicle).where(eq(tdVehicle.vehicleId, kType)).limit(1);

    if (!row || row.manufacturerId == null || row.modelId == null) return null;

    return {
        manufacturerId: row.manufacturerId,
        modelId: row.modelId,
        engineType: toEngineType(row),
    };
}


/**
 * Rebuilds the API shape from a stored row. The fields left empty
 * (`capacityTax`, `numberOfCylinders`, `capacityLt`, `capacityTech`, `engId`)
 * are not stored because nothing in the app reads them.
 */
function toEngineType(row: typeof tdVehicle.$inferSelect): ApiEngineType {
    return {
        vehicleId: row.vehicleId,
        manufacturerName: row.manufacturerName,
        modelName: row.modelName,
        typeEngineName: row.typeEngineName,
        constructionIntervalStart: row.ctorStart ?? "",
        constructionIntervalEnd: row.ctorEnd,
        powerKw: row.powerKw != null ? String(row.powerKw) : "",
        powerPs: row.powerPs != null ? String(row.powerPs) : "",
        capacityTax: null,
        fuelType: row.fuelType ?? "Inconnu",
        bodyType: row.bodyType ?? "",
        numberOfCylinders: 0,
        capacityLt: "",
        capacityTech: "",
        engineCodes: row.engineCodes ?? "",
        engId: row.vehicleId,
    };
}

function toNumber(value: string | null | undefined): number | null {
    if (!value) return null;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Banks a whole `Engine_Types_by_Model` response. Returns how many K-Types were
 * not known before, which is what the harvest and the resolver report.
 *
 * Rows are overwritten rather than ignored on conflict: what comes from the API
 * supersedes the placeholders the indexer writes.
 */
export async function rememberEngineTypes(
    types: ApiEngineType[],
    manufacturerId: number,
    modelId: number
): Promise<number> {
    // `Engine_Types_by_Model` renvoie parfois deux lignes pour un même vehicleId.
    const unique = new Map<number, ApiEngineType>();
    for (const type of types) {
        if (type?.vehicleId) unique.set(type.vehicleId, type);
    }
    if (unique.size === 0) return 0;

    const ids = [...unique.keys()];
    const known = await db
        .select({ vehicleId: tdVehicle.vehicleId })
        .from(tdVehicle)
        .where(inArray(tdVehicle.vehicleId, ids));
    const knownIds = new Set(known.map((r) => r.vehicleId));

    for (const type of unique.values()) {
        const values = {
            vehicleId: type.vehicleId,
            manufacturerId,
            manufacturerName: type.manufacturerName,
            modelId,
            modelName: type.modelName,
            typeEngineName: type.typeEngineName,
            powerKw: toNumber(type.powerKw),
            powerPs: toNumber(type.powerPs),
            fuelType: type.fuelType ?? null,
            bodyType: type.bodyType ?? null,
            engineCodes: type.engineCodes ?? null,
            ctorStart: type.constructionIntervalStart || null,
            ctorEnd: type.constructionIntervalEnd ?? null,
        };

        await db
            .insert(tdVehicle)
            .values(values)
            .onConflictDoUpdate({ target: tdVehicle.vehicleId, set: values });
    }

    return ids.filter((id) => !knownIds.has(id)).length;
}



/**
 * Fills the index from the `engine_types_*` responses already in `api_cache`.
 * Reads the cache, never the API, so it costs nothing and can be rerun.
 *
 * `engine_types_<modelId>` does not carry its manufacturer, so the link is
 * rebuilt from the `models_<manufacturerId>` entries cached alongside.
 */
export async function harvestCachedEngineTypes(
    onPayload?: (key: string, types: number, learned: number) => void
): Promise<HarvestResult> {
    const modelToManufacturer = new Map<number, number>();

    const modelRows = await db
        .select({ key: apiCache.key, valueJson: apiCache.valueJson })
        .from(apiCache)
        .where(like(apiCache.key, "models_%"));

    for (const row of modelRows) {
        const manufacturerId = Number(row.key.slice("models_".length));
        if (!Number.isFinite(manufacturerId)) continue;
        try {
            for (const model of JSON.parse(row.valueJson) as { modelId?: number }[]) {
                if (model?.modelId) modelToManufacturer.set(model.modelId, manufacturerId);
            }
        } catch {
            // Entrée illisible : sans elle on perd un rattachement, pas la récolte.
        }
    }

    const engineRows = await db
        .select({ key: apiCache.key, valueJson: apiCache.valueJson })
        .from(apiCache)
        .where(like(apiCache.key, "engine_types_%"));

    const result: HarvestResult = { payloads: engineRows.length, processed: 0, learned: 0, skipped: 0 };

    for (const row of engineRows) {
        const modelId = Number(row.key.slice("engine_types_".length));
        const manufacturerId = modelToManufacturer.get(modelId);
        if (!Number.isFinite(modelId) || manufacturerId == null) {
            result.skipped++;
            continue;
        }

        let types: ApiEngineType[];
        try {
            types = JSON.parse(row.valueJson);
        } catch {
            result.skipped++;
            continue;
        }

        const learned = await rememberEngineTypes(types, manufacturerId, modelId);
        result.processed += types.length;
        result.learned += learned;
        onPayload?.(row.key, types.length, learned);
    }

    return result;
}

/** How many K-Types the index answers without a billed call. */
export async function countResolvableVehicles(): Promise<number> {
    const [row] = await db
        .select({ total: count() })
        .from(tdVehicle)
        .where(and(isNotNull(tdVehicle.manufacturerId), isNotNull(tdVehicle.modelId)));
    return row?.total ?? 0;
}
