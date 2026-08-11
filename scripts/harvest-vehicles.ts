/**
 * Harvests the local K-Type index from responses already paid for.
 *
 * Every `engine_types_<modelId>` entry in `api_cache` holds the full engine
 * line-up of a model, around twenty vehicles, of which the resolver only ever
 * read one. Flattening them into `td_vehicle` makes those K-Types resolve
 * without a billed call from now on.
 *
 * Costs nothing: it reads the cache, never the API. Safe to run repeatedly.
 *
 * Usage:
 *   pnpm vehicles:harvest
 *   pnpm vehicles:harvest --dry-run
 */

import { existsSync } from "fs";
import { countResolvableVehicles, harvestCachedEngineTypes } from "../lib/vehicle/vehicle-index";

if (existsSync(".env")) {
    try {
        process.loadEnvFile(".env");
    } catch {
        // Variables déjà présentes dans l'environnement : rien à faire.
    }
}

async function main(): Promise<void> {
    const before = await countResolvableVehicles();

    if (process.argv.includes("--dry-run")) {
        console.log(`Index actuel : ${before} K-Type(s) résolus sans appel facturé.`);
        console.log("Simulation : relancez sans --dry-run pour enregistrer.");
        return;
    }

    const result = await harvestCachedEngineTypes((key, types, learned) => {
        console.log(`  ${key} : ${types} motorisation(s), ${learned} nouvelle(s)`);
    });

    const after = await countResolvableVehicles();

    console.log(
        `\n${result.payloads} réponse(s) en cache, ${result.processed} motorisation(s) traitées, ` +
            `${result.learned} K-Type(s) nouveaux` +
            (result.skipped ? `, ${result.skipped} ignorée(s)` : "") +
            "."
    );
    console.log(`Index local : ${before} -> ${after} K-Type(s) résolus sans appel facturé.`);
}

main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
