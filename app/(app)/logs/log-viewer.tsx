"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, CircleDollarSign, Database, Pause, Play, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { actionTone, fieldLabel, messageLabel, promotedKeys, type Tone } from "@/lib/logs/vocabulary";
import type { LogEntry, LogGroup, LogPage } from "@/lib/logs/reader";

const REFRESH_MS = 3000;

/** One colour per nature of event, so a glance is enough to sort them out. */
const TONE: Record<Tone, { dot: string; chip: string }> = {
    cost: { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-900 border-amber-200" },
    free: { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-900 border-emerald-200" },
    plate: { dot: "bg-indigo-500", chip: "bg-indigo-50 text-indigo-900 border-indigo-200" },
    supplier: { dot: "bg-sky-500", chip: "bg-sky-50 text-sky-900 border-sky-200" },
    batch: { dot: "bg-violet-500", chip: "bg-violet-50 text-violet-900 border-violet-200" },
    auth: { dot: "bg-slate-400", chip: "bg-slate-50 text-slate-700 border-slate-200" },
    neutral: { dot: "bg-stroke", chip: "bg-white text-txt2 border-stroke" },
};

/** Rendered on their own, never repeated among the details. */
const RENDERED = new Set(["timestamp", "level", "message", "action", "module", "durationMs", "requestId", "route", "repeats", "firstTimestamp"]);

function clock(timestamp: string): string {
    const d = new Date(timestamp);
    return d.toLocaleTimeString("fr-FR", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

function shortClock(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString("fr-FR", { hour12: false });
}

function display(value: unknown): string {
    if (typeof value === "boolean") return value ? "oui" : "non";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function Tile({
    icon,
    label,
    value,
    tone = "default",
}: {
    icon: React.ReactNode;
    label: string;
    value: number | string;
    tone?: "default" | "cost" | "good" | "bad";
}) {
    const tones = {
        default: "text-navy",
        cost: "text-amber-700",
        good: "text-emerald-700",
        bad: "text-red-600",
    };
    return (
        <div className="flex items-center gap-3 rounded-xl border border-stroke bg-white px-4 py-3">
            <span className={tones[tone]}>{icon}</span>
            <div className="flex flex-col leading-tight">
                <span className={`font-heading text-xl font-bold tabular-nums ${tones[tone]}`}>{value}</span>
                <span className="text-[11px] uppercase tracking-wide text-txt2">{label}</span>
            </div>
        </div>
    );
}

function Field({ name, value }: { name: string; value: unknown }) {
    return (
        <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
            <span className="text-txt2">{fieldLabel(name)}</span>
            <span className="font-medium text-navy">{display(value)}</span>
        </span>
    );
}

function EntryRow({ entry }: { entry: LogEntry }) {
    const tone = TONE[actionTone(entry.action)];
    const promoted = promotedKeys(entry.action).filter(
        (key) => entry[key] !== null && entry[key] !== undefined && entry[key] !== ""
    );
    const shown = new Set([...RENDERED, ...promoted]);
    const details = Object.entries(entry).filter(
        ([key, value]) => !shown.has(key) && value !== null && value !== undefined && value !== ""
    );

    return (
        <li className="flex gap-3 px-3 py-1.5">
            <span className="w-30 shrink-0 pt-px font-mono text-[11px] tabular-nums text-txt2">
                {clock(entry.timestamp)}
            </span>

            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden />

            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span
                        className={`text-sm ${entry.level === "error" ? "font-medium text-red-600" : entry.level === "warn" ? "text-amber-700" : "text-navy"}`}
                    >
                        {messageLabel(entry.message)}
                    </span>

                    {entry.repeats != null && entry.repeats > 1 && (
                        <span
                            className="rounded-full border border-stroke bg-white px-1.5 text-[11px] font-medium tabular-nums text-txt2"
                            title={
                                entry.firstTimestamp
                                    ? `De ${clock(entry.firstTimestamp)} à ${clock(entry.timestamp)}`
                                    : undefined
                            }
                        >
                            {entry.repeats} fois
                        </span>
                    )}

                    {entry.durationMs != null && (
                        <span className="font-mono text-[11px] tabular-nums text-txt2">{entry.durationMs} ms</span>
                    )}

                    {promoted.length > 0 && (
                        <span className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px]">
                            {promoted.map((key) => (
                                <Field key={key} name={key} value={entry[key]} />
                            ))}
                        </span>
                    )}
                </div>

                {details.length > 0 && (
                    <details className="group mt-0.5">
                        <summary className="cursor-pointer list-none text-[11px] text-txt2 hover:text-navy">
                            <span className="group-open:hidden">Détails ({details.length})</span>
                            <span className="hidden group-open:inline">Masquer</span>
                        </summary>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px]">
                            {details.map(([key, value]) => (
                                <span key={key} className="break-all">
                                    <span className="text-txt2">{fieldLabel(key)}</span>{" "}
                                    <span className="text-navy">{display(value)}</span>
                                </span>
                            ))}
                        </div>
                    </details>
                )}
            </div>
        </li>
    );
}

const LEVEL_RAIL: Record<string, string> = {
    error: "border-l-red-500",
    warn: "border-l-amber-500",
    info: "border-l-stroke",
    debug: "border-l-stroke",
};

/**
 * A correlated request is drawn as a block with a header, so a plate search
 * reads as one thing. A line the logger could not correlate keeps the plain row
 * it had, rather than being dressed up as a request it was not.
 */
function GroupBlock({ group }: { group: LogGroup }) {
    const rail = LEVEL_RAIL[group.level] ?? "border-l-stroke";

    if (!group.requestId) {
        return (
            <ul className={`border-l-2 bg-white ${rail}`}>
                <EntryRow entry={group.entries[0]} />
            </ul>
        );
    }

    return (
        <div className={`border-l-2 bg-white ${rail}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-dashed border-stroke px-3 py-1.5">
                <span className="font-mono text-[11px] tabular-nums text-txt2">{shortClock(group.startedAt)}</span>
                <span className="font-heading text-sm font-bold text-navy">{group.route ?? "requête"}</span>
                {group.plate && (
                    <span className="rounded border border-indigo-200 bg-indigo-50 px-1.5 font-mono text-[11px] font-medium text-indigo-900">
                        {group.plate}
                    </span>
                )}
                <span className="font-mono text-[11px] tabular-nums text-txt2">{group.spanMs} ms</span>
                <span className="text-[11px] text-txt2">{group.entries.length} étapes</span>
                {group.billedCalls > 0 && (
                    <span className="rounded border border-amber-300 bg-amber-100 px-1.5 text-[11px] font-bold text-amber-900">
                        {group.billedCalls} appel{group.billedCalls > 1 ? "s" : ""} facturé
                        {group.billedCalls > 1 ? "s" : ""}
                    </span>
                )}
                {group.billedCalls === 0 && (
                    <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 text-[11px] font-medium text-emerald-800">
                        gratuit
                    </span>
                )}
                <span className="ml-auto font-mono text-[10px] text-txt2">{group.requestId}</span>
            </div>
            <ul className="divide-y divide-stroke/40">
                {group.entries.map((entry, i) => (
                    <EntryRow key={`${entry.timestamp}-${entry.action ?? ""}-${i}`} entry={entry} />
                ))}
            </ul>
        </div>
    );
}

export function LogViewer() {
    const [date, setDate] = useState<string>("");
    const [level, setLevel] = useState<string>("");
    const [action, setAction] = useState<string>("");
    const [search, setSearch] = useState<string>("");
    const [live, setLive] = useState(true);

    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (level) params.set("level", level);
    if (action) params.set("action", action);
    if (search) params.set("q", search);

    const { data, isLoading, isError, isFetching } = useQuery<LogPage>({
        queryKey: ["logs", date, level, action, search],
        queryFn: async () => {
            const res = await fetch(`/api/logs?${params.toString()}`);
            if (!res.ok) throw new Error("Lecture des logs impossible.");
            return res.json();
        },
        refetchInterval: live ? REFRESH_MS : false,
        placeholderData: (previous) => previous,
    });

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="font-heading text-xl font-bold text-navy">Trace du système</h1>
                    <p className="text-sm text-txt2">
                        Chaque étape d&apos;une recherche, dans l&apos;ordre. Le point orange marque un appel payé.
                    </p>
                </div>
                <Button variant={live ? "default" : "outline"} size="sm" onClick={() => setLive((v) => !v)}>
                    {live ? <Pause /> : <Play />}
                    {live ? "En direct" : "En pause"}
                    {live && isFetching ? <Spinner /> : null}
                </Button>
            </div>

            {data && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    <Tile
                        icon={<CircleDollarSign />}
                        label="appels facturés"
                        value={data.summary.billedCalls}
                        tone="cost"
                    />
                    <Tile icon={<Search />} label="recherches plaque" value={data.summary.plateLookups} />
                    <Tile
                        icon={<Database />}
                        label="résolus en local"
                        value={data.summary.indexHits}
                        tone="good"
                    />
                    <Tile icon={<AlertTriangle />} label="avertissements" value={data.summary.warnings} />
                    <Tile icon={<XCircle />} label="erreurs" value={data.summary.errors} tone="bad" />
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stroke bg-white p-3">
                <NativeSelect value={date} onChange={(e) => setDate(e.target.value)}>
                    <NativeSelectOption value="">Jour le plus récent</NativeSelectOption>
                    {data?.availableDates.map((d) => (
                        <NativeSelectOption key={d} value={d}>
                            {d}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>

                <NativeSelect value={level} onChange={(e) => setLevel(e.target.value)}>
                    <NativeSelectOption value="">Tous niveaux</NativeSelectOption>
                    <NativeSelectOption value="info">info</NativeSelectOption>
                    <NativeSelectOption value="warn">warn</NativeSelectOption>
                    <NativeSelectOption value="error">error</NativeSelectOption>
                </NativeSelect>

                <NativeSelect
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                    className="max-w-52"
                >
                    <NativeSelectOption value="">Toutes les actions</NativeSelectOption>
                    {data?.actions.map((a) => (
                        <NativeSelectOption key={a} value={a}>
                            {a}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>

                <Input
                    placeholder="Filtrer : plaque, message, chemin…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 w-56"
                />

                {(level || action || search || date) && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setLevel("");
                            setAction("");
                            setSearch("");
                            setDate("");
                        }}
                    >
                        Réinitialiser
                    </Button>
                )}

                {data && (
                    <span className="ml-auto text-xs text-txt2">
                        {data.shown} ligne(s) sur {data.summary.entries} · {data.date}
                    </span>
                )}
            </div>

            {isLoading && (
                <div className="flex items-center gap-2 p-6 text-sm text-txt2">
                    <Spinner /> Lecture des journaux…
                </div>
            )}

            {isError && (
                <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                    Impossible de lire les journaux. Le dossier `logs/` existe-t-il ?
                </p>
            )}

            {data && data.groups.length === 0 && !isLoading && (
                <p className="rounded-xl border border-stroke bg-white p-6 text-center text-sm text-txt2">
                    Aucune ligne pour ces filtres. Lance une recherche par plaque, elle apparaîtra ici.
                </p>
            )}

            {data && data.groups.length > 0 && (
                <div className="flex flex-col gap-2 overflow-hidden rounded-xl border border-stroke bg-white p-2">
                    {data.groups.map((group, i) => (
                        <GroupBlock key={`${group.requestId ?? "solo"}-${group.startedAt}-${i}`} group={group} />
                    ))}
                </div>
            )}

            {data?.truncated && (
                <p className="text-center text-xs text-txt2">
                    Affichage limité aux lignes les plus récentes. Affine les filtres pour voir le reste.
                </p>
            )}
        </div>
    );
}
