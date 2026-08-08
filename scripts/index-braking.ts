/**
 * Braking catalog acquisition.
 *
 * Usage:
 *   pnpm index:braking                    # known vehicles not indexed yet
 *   pnpm index:braking 15901 32251        # explicit K-Types
 *   pnpm index:braking --file seeds.txt   # one K-Type per line
 *   pnpm index:braking --force 15901      # reindex even if already paid for
 *   pnpm index:braking --details 200      # OEM pass, one call per article
 *   pnpm index:braking --dry-run          # print the plan and estimated cost
 *
 * Resumable: a lock prevents concurrent runs and each pair is committed on its
 * own in `index_job`, so an interruption only loses the pair in flight.
 *
 * Auditable: each pair records its billed calls, so the real cost of the catalog
 * is a SQL query rather than an estimate.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { db } from "../lib/db/client";
import { indexJob, tdArticle, tdVehicle, vehicles as legacyVehicles } from "../lib/db/schema";
import {
    BRAKING_CATEGORIES,
    alreadyIndexed,
    articlesMissingDetails,
    indexArticleDetails,
    indexVehicleCategory,
} from "../lib/catalog/indexer";
import { logger } from "../lib/logger";

if (existsSync(".env")) {
    try {
        process.loadEnvFile(".env");
    } catch {
        // Variables déjà dans l'environnement.
    }
}

const LOCK_FILE = join(process.cwd(), ".cache", "indexer.lock");
/** Beyond this age, a lock is treated as abandoned by a dead process. */
const LOCK_STALE_MS = 6 * 60 * 60 * 1000;
/** Pause between calls: the API rate-limits requests per second. */
const DELAY_MS = Number(process.env.INDEX_DELAY_MS ?? "300");

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function acquireLock(): boolean {
    const dir = join(process.cwd(), ".cache");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    if (existsSync(LOCK_FILE)) {
        try {
            const held = JSON.parse(readFileSync(LOCK_FILE, "utf-8")) as {
                pid: number;
                startedAt: string;
            };
            const age = Date.now() - new Date(held.startedAt).getTime();
            if (age < LOCK_STALE_MS) {
                console.error(
                    `Une indexation tourne déjà (pid ${held.pid}, depuis ${Math.round(age / 60000)} min).`
                );
                console.error(`Si c'est faux, supprimez ${LOCK_FILE}.`);
                return false;
            }
            console.warn("Verrou abandonné détecté, reprise.");
        } catch {
            console.warn("Verrou illisible, reprise.");
        }
    }

    writeFileSync(
        LOCK_FILE,
        JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
        "utf-8"
    );
    return true;
}

function releaseLock(): void {
    try {
        if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE);
    } catch {
        // Rien à faire : le prochain lancement détectera l'abandon.
    }
}

interface Args {
    kTypes: number[];
    force: boolean;
    dryRun: boolean;
    detailsLimit: number;
    file?: string;
}

function parseArgs(argv: string[]): Args {
    const out: Args = { kTypes: [], force: false, dryRun: false, detailsLimit: 0 };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--force") out.force = true;
        else if (a === "--dry-run") out.dryRun = true;
        else if (a === "--details") out.detailsLimit = Number(argv[++i] ?? "0");
        else if (a === "--file") out.file = argv[++i];
        else {
            const n = Number.parseInt(a, 10);
            if (Number.isFinite(n) && n > 0) out.kTypes.push(n);
        }
    }
    return out;
}

/**
 * Default targets: every vehicle already known, legacy table included. That
 * table traces the searches franchisees actually ran, so it is the best starting
 * sample: the fleet consulted, not a theoretical one.
 */
async function defaultTargets(): Promise<number[]> {
    const fromNew = await db.select({ id: tdVehicle.vehicleId }).from(tdVehicle);
    const fromLegacy = await db.select({ id: legacyVehicles.vehicleId }).from(legacyVehicles);
    return [...new Set([...fromNew, ...fromLegacy].map((r) => r.id))].sort((a, b) => a - b);
}

async function runFitmentPass(kTypes: number[], force: boolean, dryRun: boolean) {
    const plan: { vehicleId: number; categoryId: number }[] = [];
    for (const vehicleId of kTypes) {
        for (const categoryId of BRAKING_CATEGORIES) {
            if (!force && (await alreadyIndexed(vehicleId, categoryId))) continue;
            plan.push({ vehicleId, categoryId });
        }
    }

    console.info(
        `\nPasse 1, applicabilité et critères\n` +
            `  ${kTypes.length} véhicules, ${plan.length} couples à indexer` +
            ` (${kTypes.length * BRAKING_CATEGORIES.length - plan.length} déjà payés)\n` +
            `  coût estimé : ~${plan.length * 5} appels facturés\n`
    );

    if (dryRun || plan.length === 0) return;

    const totals = { ok: 0, empty: 0, error: 0, calls: 0, articles: 0, criteria: 0 };

    for (const [i, target] of plan.entries()) {
        const r = await indexVehicleCategory(target.vehicleId, target.categoryId, { force });
        totals.calls += r.apiCalls;
        totals.articles += r.articlesKept;
        totals.criteria += r.criteriaRows;
        if (r.status === "ok") totals.ok++;
        else if (r.status === "empty") totals.empty++;
        else if (r.status === "error") totals.error++;

        const tag = { ok: "✓", empty: "∅", error: "✗", skipped: "–" }[r.status];
        console.info(
            `  [${String(i + 1).padStart(3)}/${plan.length}] ${tag} ` +
                `${r.vehicleId}/${r.categoryId}  ` +
                `${String(r.articlesKept).padStart(3)}/${String(r.articlesFound).padStart(4)} art  ` +
                `${String(r.criteriaRows).padStart(4)} crit  ` +
                `${r.apiCalls} appels  ${r.durationMs} ms` +
                (r.error ? `  → ${r.error.slice(0, 60)}` : "")
        );

        // Le quota mensuel épuisé rend toute suite inutile : on s'arrête pour
        // garder l'état cohérent plutôt que d'accumuler des lignes en erreur.
        if (r.error?.includes("MONTHLY quota")) {
            console.error("\nQuota mensuel RapidAPI atteint, arrêt propre.");
            break;
        }
        if (i < plan.length - 1) await delay(DELAY_MS);
    }

    console.info(
        `\n  ${totals.ok} ok · ${totals.empty} vides · ${totals.error} erreurs\n` +
            `  ${totals.articles} articles retenus · ${totals.criteria} lignes de critères\n` +
            `  ${totals.calls} appels facturés consommés`
    );
    logger.info("Braking fitment pass finished", {
        module: "index-braking",
        action: "fitment_done",
        ...totals,
    });
}

async function runDetailsPass(limit: number, dryRun: boolean) {
    const ids = await articlesMissingDetails(limit);
    console.info(
        `\nPasse 2, références OEM\n` +
            `  ${ids.length} articles sans fiche complète\n` +
            `  coût estimé : ~${ids.length} appels facturés (1 par article)\n`
    );
    if (dryRun || ids.length === 0) return;

    let oemRows = 0;
    let calls = 0;
    for (const [i, articleId] of ids.entries()) {
        try {
            const r = await indexArticleDetails(articleId);
            oemRows += r.oemRows;
            calls += r.apiCalls;
            if ((i + 1) % 25 === 0 || i === ids.length - 1) {
                console.info(`  ${i + 1}/${ids.length}, ${oemRows} réfs OEM, ${calls} appels`);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`  article ${articleId} → ${msg.slice(0, 70)}`);
            if (msg.includes("MONTHLY quota")) {
                console.error("Quota mensuel atteint, arrêt propre.");
                break;
            }
        }
        await delay(DELAY_MS);
    }
    console.info(`\n  ${oemRows} références OEM enregistrées · ${calls} appels facturés`);
}

async function summary() {
    const [articles] = await db.select({ n: tdArticle.articleId }).from(tdArticle).limit(1);
    const jobs = await db.select().from(indexJob);
    const totalCalls = jobs.reduce((s, j) => s + j.apiCalls, 0);
    console.info(
        `\nÉtat du catalogue\n` +
            `  ${jobs.filter((j) => j.status === "ok").length} couples indexés · ` +
            `${totalCalls} appels facturés au total` +
            (articles ? "" : "  (catalogue vide)")
    );
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    let kTypes = args.kTypes;
    if (args.file) {
        const raw = readFileSync(args.file, "utf-8");
        kTypes = raw
            .split(/\r?\n/)
            .map((l) => Number.parseInt(l.trim(), 10))
            .filter((n) => Number.isFinite(n) && n > 0);
    }
    if (kTypes.length === 0 && args.detailsLimit === 0) {
        kTypes = await defaultTargets();
    }

    if (!args.dryRun && !acquireLock()) process.exit(1);

    try {
        if (kTypes.length > 0) {
            await runFitmentPass(kTypes, args.force, args.dryRun);
        }
        if (args.detailsLimit > 0) {
            await runDetailsPass(args.detailsLimit, args.dryRun);
        }
        await summary();
    } finally {
        if (!args.dryRun) releaseLock();
    }
}

main().catch((error) => {
    logger.error("Braking indexer crashed", {
        module: "index-braking",
        action: "fatal",
        error,
    });
    releaseLock();
    process.exit(1);
});