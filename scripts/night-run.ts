/**
 * Nightly preparation, one command and one crontab line.
 *
 * The point is that a franchisee's morning costs nothing: the vehicles are
 * already indexed, the K-Types already resolvable, the cache already warm.
 *
 * Everything that spends money is capped. `NIGHT_MAX_API_CALLS` is a hard
 * ceiling on billed calls for the whole run, measured at the RapidAPI client
 * rather than estimated, so a bad night can never drain the monthly quota.
 *
 * Usage:
 *   pnpm night:run --dry-run       # print the plan and the estimated cost
 *   pnpm night:run                 # do it
 *   pnpm night:run --budget 30     # tighter ceiling for one run
 *
 * Crontab:
 *   0 3 * * *  cd /chemin/catalog-part && pnpm night:run >> logs/night.log 2>&1
 */

import { existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { and, eq, isNotNull, lt, notInArray, sql } from "drizzle-orm";
import { db } from "../lib/db/client";
import { indexJob, sessions, tdVehicle } from "../lib/db/schema";
import { BRAKING_CATEGORIES, indexVehicleCategory } from "../lib/catalog/indexer";
import { billedCallCount } from "../lib/rapidapi/client";
import { countResolvableVehicles, harvestCachedEngineTypes } from "../lib/vehicle/vehicle-index";
import { listVehiclesNeedingRefresh, resyncVehicle } from "../lib/vehicle/sync-service";
import { logger } from "../lib/logger";

if (existsSync(".env")) {
    try {
        process.loadEnvFile(".env");
    } catch {
        // Variables déjà présentes dans l'environnement : rien à faire.
    }
}

const DRY_RUN = process.argv.includes("--dry-run");

function argNumber(flag: string, fallback: number): number {
    const at = process.argv.indexOf(flag);
    const value = at >= 0 ? Number(process.argv[at + 1]) : NaN;
    return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Hard ceiling on billed calls for the whole run. */
const BUDGET = argNumber("--budget", Number(process.env.NIGHT_MAX_API_CALLS ?? "60"));
/** Vehicles renewed when their cache expires within this many days. */
const REFRESH_DAYS = Number(process.env.WARM_REFRESH_DAYS ?? "30");
/** Pause between vehicles: the API rate-limits requests per second. */
const DELAY_MS = Number(process.env.INDEX_DELAY_MS ?? "1500");
/** Backups kept in `data/backups`. */
const BACKUPS_KEPT = Number(process.env.NIGHT_BACKUPS_KEPT ?? "7");

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let spent = 0;
const remaining = () => Math.max(0, BUDGET - spent);

function step(title: string) {
    console.log(`\n${title}`);
}

/**
 * Vehicles the index can name but whose parts were never bought, cheapest
 * first: a sibling of an already indexed model costs about three billed calls
 * instead of ten, because its references are already known.
 */
async function pendingVehicles(): Promise<{ vehicleId: number; label: string; sibling: boolean }[]> {
    const indexed = await db
        .selectDistinct({ vehicleId: indexJob.vehicleId })
        .from(indexJob)
        .where(eq(indexJob.status, "ok"));
    const indexedIds = indexed.map((r) => r.vehicleId);

    const rows = await db
        .select({
            vehicleId: tdVehicle.vehicleId,
            modelId: tdVehicle.modelId,
            manufacturerName: tdVehicle.manufacturerName,
            modelName: tdVehicle.modelName,
            typeEngineName: tdVehicle.typeEngineName,
        })
        .from(tdVehicle)
        .where(
            and(
                isNotNull(tdVehicle.manufacturerId),
                isNotNull(tdVehicle.modelId),
                indexedIds.length ? notInArray(tdVehicle.vehicleId, indexedIds) : undefined
            )
        );

    const indexedModels = new Set(
        (
            await db
                .select({ modelId: tdVehicle.modelId })
                .from(tdVehicle)
                .where(
                    indexedIds.length
                        ? sql`${tdVehicle.vehicleId} in ${indexedIds}`
                        : sql`1 = 0`
                )
        ).map((r) => r.modelId)
    );

    return rows
        .map((r) => ({
            vehicleId: r.vehicleId,
            label: `${r.manufacturerName} ${r.modelName} ${r.typeEngineName}`.trim(),
            sibling: indexedModels.has(r.modelId),
        }))
        .sort((a, b) => Number(b.sibling) - Number(a.sibling));
}

async function runHarvest(): Promise<void> {
    step("Récolte de l'index K-Type (aucun appel facturé)");
    const before = await countResolvableVehicles();

    if (DRY_RUN) {
        console.log(`  index actuel : ${before} K-Type(s)`);
        return;
    }

    const result = await harvestCachedEngineTypes();
    const after = await countResolvableVehicles();
    console.log(`  ${result.processed} motorisation(s) relues, index ${before} -> ${after}`);
}

async function runIndexing(): Promise<void> {
    step(`Indexation des véhicules connus mais non couverts (budget ${remaining()} appels)`);

    const pending = await pendingVehicles();
    if (pending.length === 0) {
        console.log("  rien à indexer");
        return;
    }

    const siblings = pending.filter((v) => v.sibling).length;
    console.log(
        `  ${pending.length} véhicule(s) en attente, dont ${siblings} sœur(s) d'un modèle déjà indexé`
    );

    if (DRY_RUN) {
        const estimate = pending.reduce((sum, v) => sum + (v.sibling ? 3 : 10), 0);
        console.log(`  coût estimé pour tout traiter : environ ${estimate} appels facturés`);
        for (const vehicle of pending.slice(0, 10)) {
            console.log(`    ${vehicle.vehicleId}  ${vehicle.label}  ${vehicle.sibling ? "~3" : "~10"}`);
        }
        if (pending.length > 10) console.log(`    et ${pending.length - 10} autre(s)`);
        return;
    }

    let done = 0;
    for (const vehicle of pending) {
        // Un véhicule coûte au moins trois appels : inutile d'en commencer un
        // qu'on ne pourrait pas finir.
        if (remaining() < 3) {
            console.log(`  budget épuisé, ${pending.length - done} véhicule(s) reportés à demain`);
            break;
        }

        const before = billedCallCount();
        for (const categoryId of BRAKING_CATEGORIES) {
            const result = await indexVehicleCategory(vehicle.vehicleId, categoryId);
            if (result.status === "error") {
                console.log(`    ${vehicle.vehicleId} ${vehicle.label} : ${result.error}`);
            }
        }
        const vehicleCalls = billedCallCount() - before;
        spent += vehicleCalls;

        done++;
        console.log(`  ${vehicle.vehicleId}  ${vehicle.label}  ${vehicleCalls} appel(s)`);
        if (vehicleCalls > 0) await delay(DELAY_MS);
    }
}

async function runRefresh(): Promise<void> {
    step(`Renouvellement des véhicules proches de l'expiration (budget ${remaining()} appels)`);

    const due = await listVehiclesNeedingRefresh(REFRESH_DAYS * 24 * 60 * 60 * 1000);
    if (due.length === 0) {
        console.log("  aucun véhicule à renouveler");
        return;
    }

    console.log(`  ${due.length} véhicule(s) concernés`);
    if (DRY_RUN) {
        for (const vehicle of due.slice(0, 10)) console.log(`    ${vehicle.vehicleId}  ${vehicle.label}`);
        return;
    }

    for (const vehicle of due) {
        if (remaining() < 3) {
            console.log("  budget épuisé, renouvellement reporté");
            break;
        }
        const before = billedCallCount();
        await resyncVehicle(vehicle.vehicleId, { force: true });
        const calls = billedCallCount() - before;
        spent += calls;
        console.log(`  ${vehicle.vehicleId}  ${vehicle.label}  ${calls} appel(s)`);
        await delay(DELAY_MS);
    }
}

async function runHousekeeping(): Promise<void> {
    step("Entretien");

    if (DRY_RUN) {
        const [row] = await db
            .select({ total: sql<number>`count(*)` })
            .from(sessions)
            .where(lt(sessions.expiresAt, new Date()));
        console.log(`  ${Number(row?.total ?? 0)} session(s) expirée(s) à purger`);
        console.log("  sauvegarde de la base : non effectuée en simulation");
        return;
    }

    const purged = await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    console.log(`  ${purged.changes} session(s) expirée(s) purgée(s)`);

    const dir = join("data", "backups");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const stamp = new Date().toISOString().slice(0, 10);
    const target = join(dir, `app-${stamp}.db`);
    if (existsSync(target)) unlinkSync(target);

    // VACUUM INTO produit une copie compacte et cohérente, base ouverte.
    db.run(sql.raw(`VACUUM INTO '${target.replace(/'/g, "''")}'`));
    console.log(`  sauvegarde écrite dans ${target}`);

    const backups = readdirSync(dir)
        .filter((name) => /^app-\d{4}-\d{2}-\d{2}\.db$/.test(name))
        .sort()
        .reverse();
    for (const stale of backups.slice(BACKUPS_KEPT)) {
        unlinkSync(join(dir, stale));
        console.log(`  ancienne sauvegarde supprimée : ${stale}`);
    }
}

async function main(): Promise<void> {
    const started = Date.now();
    console.log(
        `Préparation nocturne${DRY_RUN ? " (simulation, aucun appel ne partira)" : ""}, ` +
            `budget ${BUDGET} appel(s) facturé(s).`
    );

    await runHarvest();
    await runIndexing();
    await runRefresh();
    await runHousekeeping();

    const durationMs = Date.now() - started;
    console.log(
        `\nTerminé en ${Math.round(durationMs / 1000)} s, ` +
            `${spent} appel(s) facturé(s) sur ${BUDGET} autorisés.`
    );

    if (!DRY_RUN) {
        logger.info("Nightly preparation finished", {
            module: "night-run",
            action: "night_run",
            billedCalls: spent,
            budget: BUDGET,
            durationMs,
        });
    }
}

main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
