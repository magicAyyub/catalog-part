/**
 * Reads the structured logs written by `lib/logger.ts` and shapes them for the
 * trace page.
 *
 * One JSON object per line, one file per day. The page exists to watch a real
 * plate search step by step, so this module does three things the raw file
 * cannot: it ties the lines of one request together, folds consecutive repeats
 * into a single line, and replaces account ids with account names.
 *
 * Grouping is strict: only a shared `requestId` puts two lines in the same
 * block. Nothing is inferred from timing or proximity, so a group always
 * reflects something the logger actually recorded. Lines written before the
 * correlation id existed, and lines written by the scripts, simply stand alone.
 *
 * Server only. Log lines carry plates, which are personal data.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

const LOG_DIR = join(process.cwd(), "logs");
const FILE_PATTERN = /^app-(\d{4}-\d{2}-\d{2})\.log$/;

/**
 * Fields that only carry a running count. Two otherwise identical lines that
 * differ solely by one of these are the same event repeated, so they fold
 * together and the last value wins.
 */
const COUNTER_KEYS = new Set(["count", "failedAttempts", "attempt"]);

export interface LogEntry {
    timestamp: string;
    level: "debug" | "info" | "warn" | "error";
    message: string;
    action?: string;
    module?: string;
    durationMs?: number;
    plate?: string;
    vehicleId?: number;
    kType?: number;
    path?: string;
    requestId?: string;
    route?: string;
    /** Account name, substituted for the raw id before the entry leaves here. */
    user?: string;
    /** Occurrences folded into this line, absent when it happened once. */
    repeats?: number;
    /** First occurrence of a folded line, the timestamp being the last one. */
    firstTimestamp?: string;
    [key: string]: unknown;
}

/** One request, or one standalone line when nothing correlates it. */
export interface LogGroup {
    requestId: string | null;
    route?: string;
    startedAt: string;
    endedAt: string;
    /** Wall clock across the group, not the sum of its steps. */
    spanMs: number;
    billedCalls: number;
    plate?: string;
    /** Worst level met in the group, which is what the eye should catch. */
    level: "debug" | "info" | "warn" | "error";
    entries: LogEntry[];
}

export interface LogSummary {
    /** RapidAPI requests, the only line that costs money. */
    billedCalls: number;
    plateLookups: number;
    /** K-Types answered by the local index, at no billed call. */
    indexHits: number;
    /** K-Types that fell back to walking the labels. */
    labelWalks: number;
    errors: number;
    warnings: number;
    entries: number;
}

/** Days that have a log file, newest first. */
export function listLogDates(): string[] {
    if (!existsSync(LOG_DIR)) return [];

    return readdirSync(LOG_DIR)
        .map((name) => FILE_PATTERN.exec(name)?.[1])
        .filter((date): date is string => Boolean(date))
        .sort()
        .reverse();
}

function readEntries(date: string): LogEntry[] {
    const file = join(LOG_DIR, `app-${date}.log`);
    if (!existsSync(file)) return [];

    const entries: LogEntry[] = [];
    for (const line of readFileSync(file, "utf-8").split("\n")) {
        if (!line.trim()) continue;
        try {
            entries.push(JSON.parse(line) as LogEntry);
        } catch {
            // Ligne tronquée par une écriture concurrente : on l'ignore.
        }
    }
    return entries;
}

function summarize(entries: LogEntry[]): LogSummary {
    const summary: LogSummary = {
        billedCalls: 0,
        plateLookups: 0,
        indexHits: 0,
        labelWalks: 0,
        errors: 0,
        warnings: 0,
        entries: entries.length,
    };

    for (const entry of entries) {
        if (entry.action === "rapidapi_call") summary.billedCalls++;
        if (entry.action === "by-plate" && entry.level === "info") summary.plateLookups++;
        if (entry.action === "index_hit") summary.indexHits++;
        if (entry.action === "confirmed" || entry.action === "unconfirmed") summary.labelWalks++;
        if (entry.level === "error") summary.errors++;
        if (entry.level === "warn") summary.warnings++;
    }

    return summary;
}

/**
 * Replaces `userId` with the account name. A trace showing five UUIDs tells the
 * reader nothing; a trace showing five times the same name tells them who.
 */
function resolveAccounts(entries: LogEntry[]): void {
    const ids = [...new Set(entries.map((e) => e.userId).filter((v): v is string => typeof v === "string"))];
    if (ids.length === 0) return;

    let names = new Map<string, string>();
    try {
        const rows = db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, ids)).all();
        names = new Map(rows.map((row) => [row.id, row.username]));
    } catch {
        // Base indisponible : on retombe sur l'identifiant abrégé, jamais sur l'UUID entier.
    }

    for (const entry of entries) {
        const id = entry.userId;
        if (typeof id !== "string") continue;
        entry.user = names.get(id) ?? `compte ${id.slice(0, 8)}`;
        delete entry.userId;
    }
}

/** Everything that makes two consecutive lines the same event. */
function signature(entry: LogEntry): string {
    const parts: string[] = [entry.level, entry.action ?? "", entry.message];
    for (const key of Object.keys(entry).sort()) {
        if (key === "timestamp" || key === "durationMs" || COUNTER_KEYS.has(key)) continue;
        if (key === "level" || key === "action" || key === "message") continue;
        parts.push(`${key}=${JSON.stringify(entry[key])}`);
    }
    return JSON.stringify(parts);
}

/** Folds runs of identical lines, keeping the last one and counting them. */
function foldRepeats(entries: LogEntry[]): LogEntry[] {
    const folded: LogEntry[] = [];
    let previousSignature: string | null = null;

    for (const entry of entries) {
        const current = signature(entry);
        const last = folded[folded.length - 1];

        if (last && current === previousSignature) {
            const repeats = (last.repeats ?? 1) + 1;
            // La dernière occurrence porte l'état le plus récent des compteurs.
            folded[folded.length - 1] = {
                ...entry,
                repeats,
                firstTimestamp: last.firstTimestamp ?? last.timestamp,
            };
            continue;
        }

        folded.push(entry);
        previousSignature = current;
    }

    return folded;
}

function worstLevel(entries: LogEntry[]): LogEntry["level"] {
    if (entries.some((e) => e.level === "error")) return "error";
    if (entries.some((e) => e.level === "warn")) return "warn";
    return entries[0]?.level ?? "info";
}

function toGroup(entries: LogEntry[]): LogGroup {
    const first = entries[0];
    const last = entries[entries.length - 1];

    return {
        requestId: first.requestId ?? null,
        route: first.route,
        startedAt: first.timestamp,
        endedAt: last.timestamp,
        spanMs: new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime(),
        // Compté sur les occurrences, pas sur les lignes : deux appels identiques
        // repliés en une ligne restent deux appels payés.
        billedCalls: entries.reduce(
            (total, e) => total + (e.action === "rapidapi_call" ? (e.repeats ?? 1) : 0),
            0
        ),
        plate: entries.find((e) => typeof e.plate === "string")?.plate,
        level: worstLevel(entries),
        entries,
    };
}

/** Consecutive lines sharing a requestId become one group; the rest stand alone. */
function group(entries: LogEntry[]): LogGroup[] {
    const groups: LogGroup[] = [];
    let run: LogEntry[] = [];

    const flush = () => {
        if (run.length > 0) groups.push(toGroup(run));
        run = [];
    };

    for (const entry of entries) {
        if (!entry.requestId) {
            flush();
            groups.push(toGroup([entry]));
            continue;
        }
        if (run.length > 0 && run[0].requestId !== entry.requestId) flush();
        run.push(entry);
    }
    flush();

    return groups;
}

export interface LogQuery {
    date?: string;
    level?: string;
    action?: string;
    /** Free text over the message, plate, action and path. */
    search?: string;
    limit?: number;
}

export interface LogPage {
    date: string;
    availableDates: string[];
    /** Actions present that day, for the filter list. */
    actions: string[];
    summary: LogSummary;
    groups: LogGroup[];
    /** Lines shown after filtering and folding, for the counter under the filters. */
    shown: number;
    truncated: boolean;
}

export function readLogPage(query: LogQuery = {}): LogPage {
    const availableDates = listLogDates();
    const date =
        query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date)
            ? query.date
            : (availableDates[0] ?? new Date().toISOString().slice(0, 10));

    const all = readEntries(date);
    // Le résumé porte sur la journée entière, pas sur le sous-ensemble filtré.
    const summary = summarize(all);
    const actions = [...new Set(all.map((e) => e.action).filter((a): a is string => Boolean(a)))].sort();

    const needle = query.search?.trim().toLowerCase();
    const filtered = all.filter((entry) => {
        if (query.level && entry.level !== query.level) return false;
        if (query.action && entry.action !== query.action) return false;
        if (!needle) return true;

        const haystack = [entry.message, entry.action, entry.plate, entry.path, entry.module]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        return haystack.includes(needle);
    });

    // La coupe se fait sur les lignes les plus récentes, avant repli et groupement,
    // pour qu'un groupe rendu soit toujours complet.
    const limit = Math.min(Math.max(query.limit ?? 300, 1), 2000);
    const truncated = filtered.length > limit;
    const window = filtered.slice(-limit);

    resolveAccounts(window);
    const folded = foldRepeats(window);
    const groups = group(folded).reverse();

    return {
        date,
        availableDates,
        actions,
        summary,
        groups,
        shown: folded.length,
        truncated,
    };
}
