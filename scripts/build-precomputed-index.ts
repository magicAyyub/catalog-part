import { db } from "../lib/db/client";
import { etfLookupIndex, vehicles } from "../lib/db/schema";
import { searchByPlate } from "../lib/suppliers/preference";
import { logger } from "../lib/logger";
import { eq, and, asc } from "drizzle-orm";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";

if (existsSync(".env")) {
    try { (process as any).loadEnvFile(".env"); } catch {}
}
if (existsSync(".env.local")) {
    try { (process as any).loadEnvFile(".env.local"); } catch {}
}

const MAX_EXECUTION_MINUTES = parseFloat(process.env.ETL_MAX_EXECUTION_MINUTES || "180");
const CONCURRENCY = parseInt(process.env.ETL_CONCURRENCY || "5", 10);
const LOCK_FILE = join(process.cwd(), ".cache", "etl-indexer.lock");

function acquireLock(): boolean {
    const dir = join(process.cwd(), ".cache");
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    if (existsSync(LOCK_FILE)) {
        logger.warn("ETL process lockfile exists. Aborting concurrent execution.", {
            module: "etl-indexer",
            action: "lock_failed",
            lockFile: LOCK_FILE,
        });
        return false;
    }
    writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), "utf-8");
    return true;
}

function releaseLock() {
    if (existsSync(LOCK_FILE)) {
        try { unlinkSync(LOCK_FILE); } catch {}
    }
}

async function indexVehicleCategory(vehicleId: number, cat: { categoryId: number; name: "plaquette" | "disque" }): Promise<boolean> {
    const itemStart = Date.now();
    try {
        const res = await searchByPlate(String(vehicleId), cat.name);
        if (!res || !res.vehicle) return false;

        const resolvedVehicleId = Number(res.vehicle.carId || res.vehicle.kType || vehicleId);
        const vehicleJson = JSON.stringify(res.vehicle);
        const productsJson = JSON.stringify(res.parts);

        const existing = await db
            .select({ id: etfLookupIndex.id })
            .from(etfLookupIndex)
            .where(
                and(
                    eq(etfLookupIndex.vehicleId, resolvedVehicleId),
                    eq(etfLookupIndex.categoryId, cat.categoryId)
                )
            );

        if (existing.length > 0) {
            await db
                .update(etfLookupIndex)
                .set({
                    vehicleJson,
                    productsJson,
                    updatedAt: new Date(),
                })
                .where(eq(etfLookupIndex.id, existing[0].id));
        } else {
            await db.insert(etfLookupIndex).values({
                vehicleId: resolvedVehicleId,
                categoryId: cat.categoryId,
                vehicleJson,
                productsJson,
                updatedAt: new Date(),
            });
        }

        logger.info("Vehicle category indexed successfully", {
            module: "etl-indexer",
            action: "index_vehicle_success",
            vehicleId: resolvedVehicleId,
            category: cat.name,
            categoryId: cat.categoryId,
            partsFound: res.parts.length,
            durationMs: Date.now() - itemStart,
        });
        return true;
    } catch (err) {
        logger.warn("Skipped vehicle category indexing due to error", {
            module: "etl-indexer",
            action: "index_vehicle_skipped",
            vehicleId,
            category: cat.name,
            error: err,
            durationMs: Date.now() - itemStart,
        });
        return false;
    }
}

async function main() {
    const startTime = Date.now();
    logger.info("Nocturne ETL indexer process initiated", {
        module: "etl-indexer",
        action: "start",
        maxExecutionMinutes: MAX_EXECUTION_MINUTES,
        concurrency: CONCURRENCY,
    });

    const maxDurationMs = MAX_EXECUTION_MINUTES * 60 * 1000;

    if (!acquireLock()) {
        process.exit(0);
    }

    try {
        const dbVehicleRows = await db.select({ vehicleId: vehicles.vehicleId }).from(vehicles);
        const vehicleIdSet = new Set<number>(dbVehicleRows.map((v) => v.vehicleId));

        const jsonPath = join(process.cwd(), "data", "active_ktypes.json");
        if (existsSync(jsonPath)) {
            try {
                const raw = readFileSync(jsonPath, "utf-8");
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    for (const item of parsed) {
                        if (item.vehicleId) vehicleIdSet.add(Number(item.vehicleId));
                    }
                }
            } catch {}
        }

        if (vehicleIdSet.size === 0) {
            vehicleIdSet.add(199512);
            vehicleIdSet.add(101412);
            vehicleIdSet.add(100466);
            vehicleIdSet.add(100860);
        }

        const indexedEntries = await db
            .select({ vehicleId: etfLookupIndex.vehicleId, updatedAt: etfLookupIndex.updatedAt })
            .from(etfLookupIndex)
            .orderBy(asc(etfLookupIndex.updatedAt));

        const lastIndexedMap = new Map<number, number>();
        for (const e of indexedEntries) {
            lastIndexedMap.set(e.vehicleId, e.updatedAt ? new Date(e.updatedAt).getTime() : 0);
        }

        const sortedVehicles = Array.from(vehicleIdSet).sort((a, b) => {
            const timeA = lastIndexedMap.get(a) ?? 0;
            const timeB = lastIndexedMap.get(b) ?? 0;
            return timeA - timeB;
        });

        logger.info("Target vehicles loaded for indexing", {
            module: "etl-indexer",
            action: "vehicles_loaded",
            totalVehicles: sortedVehicles.length,
        });

        const targetCategories: { categoryId: number; name: "plaquette" | "disque" }[] = [
            { categoryId: 100030, name: "plaquette" },
            { categoryId: 100032, name: "disque" },
        ];

        let indexedCount = 0;
        let timedOut = false;

        for (let i = 0; i < sortedVehicles.length; i += CONCURRENCY) {
            if (Date.now() - startTime >= maxDurationMs) {
                logger.warn("ETL time window limit reached. Stopping gracefully.", {
                    module: "etl-indexer",
                    action: "time_window_exceeded",
                    elapsedMinutes: Math.round((Date.now() - startTime) / 60000),
                    maxExecutionMinutes: MAX_EXECUTION_MINUTES,
                });
                timedOut = true;
                break;
            }

            const batch = sortedVehicles.slice(i, i + CONCURRENCY);
            const tasks: Promise<boolean>[] = [];

            for (const vehicleId of batch) {
                for (const cat of targetCategories) {
                    tasks.push(indexVehicleCategory(vehicleId, cat));
                }
            }

            const results = await Promise.all(tasks);
            indexedCount += results.filter(Boolean).length;
        }

        const durationMs = Date.now() - startTime;
        logger.info("Nocturne ETL indexer process finished", {
            module: "etl-indexer",
            action: "completed",
            indexedCount,
            timedOut,
            durationMs,
        });
    } finally {
        releaseLock();
    }
}

main().catch((err) => {
    logger.error("Nocturne ETL indexer process failed catastrophically", {
        module: "etl-indexer",
        action: "fatal_error",
        error: err,
    });
    releaseLock();
    process.exit(1);
});
