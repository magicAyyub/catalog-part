/**
 * Taux de service du référentiel, lu dans les logs et dans la base.
 *
 * L'acquisition à la demande ne coûte que les véhicules réellement vus au
 * comptoir, et ce coût décroît à mesure que le parc local se remplit. Encore
 * faut-il le mesurer : c'est ce que fait ce script, à partir du trafic observé
 * plutôt que d'une étude nationale.
 *
 * Aucune écriture, aucun appel réseau.
 *
 * Usage :
 *   pnpm catalog:stats
 *   pnpm catalog:stats --weeks 12
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../lib/db/client";
import { catalogSync, vehicles } from "../lib/db/schema";
import { SYNC_TTL_MS } from "../lib/config";

interface LogEntry {
    timestamp?: string;
    action?: string;
    vehicleId?: number;
    refresh?: boolean;
    durationMs?: number;
}

interface WeekStats {
    served: number;
    acquired: number;
    refreshed: number;
    staleFallbacks: number;
    billedCalls: number;
    durations: number[];
}

function emptyWeek(): WeekStats {
    return { served: 0, acquired: 0, refreshed: 0, staleFallbacks: 0, billedCalls: 0, durations: [] };
}

/** Semaine ISO, pour que les lundis regroupent proprement. */
function isoWeek(date: Date): string {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-S${String(week).padStart(2, "0")}`;
}

function readLogEntries(logDir: string): LogEntry[] {
    let files: string[];
    try {
        files = readdirSync(logDir).filter((f) => f.startsWith("app-") && f.endsWith(".log"));
    } catch {
        return [];
    }

    const entries: LogEntry[] = [];
    for (const file of files.sort()) {
        for (const line of readFileSync(join(logDir, file), "utf-8").split("\n")) {
            if (!line.trim()) continue;
            try {
                entries.push(JSON.parse(line) as LogEntry);
            } catch {
                // Une ligne tronquée par un arrêt brutal ne doit pas tout arrêter.
            }
        }
    }
    return entries;
}

function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function pad(value: string | number, width: number, left = false): string {
    const s = String(value);
    return left ? s.padStart(width) : s.padEnd(width);
}

function main(): void {
    const flag = process.argv.indexOf("--weeks");
    const weeksKept = flag === -1 ? 8 : Number(process.argv[flag + 1]) || 8;

    const entries = readLogEntries(join(process.cwd(), "logs"));
    if (entries.length === 0) {
        console.log("Aucun log exploitable dans logs/.");
        return;
    }

    const weeks = new Map<string, WeekStats>();
    const vehicleHits = new Map<number, number>();

    for (const entry of entries) {
        if (!entry.timestamp || !entry.action) continue;
        const date = new Date(entry.timestamp);
        if (Number.isNaN(date.getTime())) continue;

        const key = isoWeek(date);
        const week = weeks.get(key) ?? emptyWeek();
        weeks.set(key, week);

        switch (entry.action) {
            case "rapidapi_call":
                week.billedCalls++;
                break;
            case "vehicle_articles_hit":
                week.served++;
                break;
            case "vehicle_articles":
                if (entry.refresh) week.refreshed++;
                else week.acquired++;
                if (typeof entry.durationMs === "number") week.durations.push(entry.durationMs);
                break;
            case "vehicle_articles_stale":
                week.staleFallbacks++;
                break;
        }

        if (entry.vehicleId && entry.action.startsWith("vehicle_articles")) {
            vehicleHits.set(entry.vehicleId, (vehicleHits.get(entry.vehicleId) ?? 0) + 1);
        }
    }

    const ordered = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-weeksKept);

    console.log("\nTaux de service du référentiel, par semaine");
    console.log("-".repeat(84));
    console.log(
        pad("semaine", 10) +
            pad("servis", 8, true) +
            pad("acquis", 8, true) +
            pad("réacq.", 8, true) +
            pad("périmés", 9, true) +
            pad("taux", 8, true) +
            pad("appels", 9, true) +
            pad("médiane", 10, true)
    );
    console.log("-".repeat(84));

    for (const [key, week] of ordered) {
        const requests = week.served + week.acquired + week.refreshed;
        const rate = requests === 0 ? "-" : `${Math.round((week.served / requests) * 100)} %`;
        const med = median(week.durations);
        console.log(
            pad(key, 10) +
                pad(week.served, 8, true) +
                pad(week.acquired, 8, true) +
                pad(week.refreshed, 8, true) +
                pad(week.staleFallbacks, 9, true) +
                pad(rate, 8, true) +
                pad(week.billedCalls, 9, true) +
                pad(med === null ? "-" : `${med} ms`, 10, true)
        );
    }

    // Etat du referentiel : ce que le trafic a fini par armer.
    const armed = db
        .select({ vehicleId: catalogSync.vehicleId, syncedAt: catalogSync.syncedAt })
        .from(catalogSync)
        .all();
    const known = db.select({ vehicleId: vehicles.vehicleId }).from(vehicles).all();
    const horizon = Date.now() - SYNC_TTL_MS;
    const stale = armed.filter((row) => row.syncedAt.getTime() <= horizon).length;

    console.log("\nÉtat du référentiel");
    console.log("-".repeat(84));
    console.log(`  véhicules connus            ${known.length}`);
    console.log(`  couples véhicule/catégorie  ${armed.length} armés, dont ${stale} périmés`);
    console.log(`  TTL                         ${Math.round(SYNC_TTL_MS / 86400000)} jours`);

    const top = [...vehicleHits.entries()].sort(([, a], [, b]) => b - a).slice(0, 15);
    if (top.length > 0) {
        const labels = new Map(
            db
                .select({
                    vehicleId: vehicles.vehicleId,
                    manufacturerName: vehicles.manufacturerName,
                    modelName: vehicles.modelName,
                    typeEngineName: vehicles.typeEngineName,
                })
                .from(vehicles)
                .all()
                .map((v) => [
                    v.vehicleId,
                    `${v.manufacturerName} ${v.modelName} ${v.typeEngineName}`.trim(),
                ])
        );

        console.log("\nVéhicules les plus consultés");
        console.log("-".repeat(84));
        for (const [vehicleId, count] of top) {
            console.log(
                `  ${pad(count, 5, true)}  ${pad(vehicleId, 8)}${labels.get(vehicleId) ?? "(hors référentiel)"}`
            );
        }
    }

    console.log();
}

main();
