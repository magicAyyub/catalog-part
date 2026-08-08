/**
 * Vehicle cache warm-up.
 *
 * Intent: the franchisees browse very largely the same fleet. Synchronizing at
 * night the vehicles already known, and those whose cache nears expiry, makes
 * daytime searches instant without a single billed call at peak hours.
 *
 * Usage:
 *   pnpm warm:vehicles                 # vehicles nearing expiry
 *   pnpm warm:vehicles 15901 32251     # explicit K-Types, must already be known
 *   WARM_REFRESH_DAYS=30 pnpm warm:vehicles
 *
 * Idempotent: on a vehicle already complete and not expired, the `syncVehicle`
 * guards return immediately and the run costs no call at all.
 */

import { existsSync } from "fs";
import { logger } from "../lib/logger";
import {
    listVehiclesNeedingRefresh,
    resyncVehicle,
    CATEGORIES,
} from "../lib/vehicle/sync-service";

if (existsSync(".env")) {
    try {
        process.loadEnvFile(".env");
    } catch {
        // Variables déjà présentes dans l'environnement : rien à faire.
    }
}

/** Window before expiry within which a vehicle gets renewed. */
const REFRESH_DAYS = Number(process.env.WARM_REFRESH_DAYS ?? "30");
/** Ceiling per run, so the monthly quota is never drained at once. */
const MAX_VEHICLES = Number(process.env.WARM_MAX_VEHICLES ?? "50");
/** Pause between vehicles: the API rate-limits requests per second. */
const DELAY_MS = Number(process.env.WARM_DELAY_MS ?? "1500");

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    const startedAt = Date.now();
    const explicit = process.argv
        .slice(2)
        .map((a) => Number.parseInt(a, 10))
        .filter((n) => Number.isFinite(n) && n > 0);

    let targets: { vehicleId: number; label: string }[];

    if (explicit.length > 0) {
        targets = explicit.map((vehicleId) => ({ vehicleId, label: `K-Type ${vehicleId}` }));
    } else {
        const due = await listVehiclesNeedingRefresh(REFRESH_DAYS * 24 * 60 * 60 * 1000);
        targets = due.slice(0, MAX_VEHICLES);
    }

    logger.info("Vehicle warm-up started", {
        module: "warm-vehicles",
        action: "start",
        targets: targets.length,
        refreshDays: REFRESH_DAYS,
        maxVehicles: MAX_VEHICLES,
        categories: CATEGORIES.map((c) => c.categoryId),
        mode: explicit.length > 0 ? "explicit" : "expiring",
    });

    if (targets.length === 0) {
        console.info("Rien à pré-chauffer : aucun véhicule proche de l'expiration.");
        return;
    }

    let ok = 0;
    let skipped = 0;
    let failed = 0;

    for (const [index, target] of targets.entries()) {
        const label = `[${index + 1}/${targets.length}] ${target.label} (${target.vehicleId})`;
        try {
            // force: on renouvelle réellement, sinon les gardes sortiraient tout
            // de suite et le cache resterait périmé.
            const found = await resyncVehicle(target.vehicleId, { force: true });
            if (found) {
                ok++;
                console.info(`${label} → synchronisé`);
            } else {
                skipped++;
                console.warn(`${label} → inconnu en base, ignoré`);
            }
        } catch (error) {
            failed++;
            const message = error instanceof Error ? error.message : String(error);
            console.error(`${label} → échec : ${message}`);
            logger.warn("Vehicle warm-up item failed", {
                module: "warm-vehicles",
                action: "item_failed",
                vehicleId: target.vehicleId,
                error,
            });

            // Quota mensuel épuisé : insister ne sert qu'à générer des erreurs.
            if (message.includes("MONTHLY quota")) {
                console.error("Quota mensuel RapidAPI atteint, arrêt du pré-chauffage.");
                break;
            }
        }

        if (index < targets.length - 1) await delay(DELAY_MS);
    }

    const durationMs = Date.now() - startedAt;
    logger.info("Vehicle warm-up finished", {
        module: "warm-vehicles",
        action: "completed",
        ok,
        skipped,
        failed,
        durationMs,
    });
    console.info(`\nTerminé : ${ok} synchronisés, ${skipped} ignorés, ${failed} en échec.`);
}

main().catch((error) => {
    logger.error("Vehicle warm-up crashed", {
        module: "warm-vehicles",
        action: "fatal",
        error,
    });
    process.exit(1);
});