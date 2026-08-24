"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
/** Un véhicule appris par la cascade ou par les compatibilités d'un article. */
interface CompatibleCar {
    vehicleId: number;
    manufacturerName: string;
    modelName: string;
    typeEngineName: string;
    constructionIntervalStart: string | null;
    constructionIntervalEnd: string | null;
}

/** TecDoc gives `YYYY-MM`; the catalog reads dates as MM/YYYY. */
function formatDate(dateStr: string): string {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length < 2) return dateStr;
    return `${parts[1]}/${parts[0]}`;
}

function Chevron({ open, className }: { open: boolean; className?: string }) {
    return (
        <svg
            className={cn("transition-transform duration-200", open && "rotate-180", className)}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
    );
}

export function CompatibleCars({ cars }: { cars: CompatibleCar[] }) {
    const [openManufacturers, setOpenManufacturers] = useState<Set<string>>(new Set());
    const [openModels, setOpenModels] = useState<Set<string>>(new Set());

    const grouped = useMemo(() => {
        const groups: Record<string, Record<string, CompatibleCar[]>> = {};
        for (const car of cars) {
            groups[car.manufacturerName] ??= {};
            groups[car.manufacturerName][car.modelName] ??= [];
            groups[car.manufacturerName][car.modelName].push(car);
        }
        return groups;
    }, [cars]);

    function toggle(setter: typeof setOpenManufacturers, key: string) {
        setter((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }

    if (cars.length === 0) return null;

    return (
        <section id="vehicules">
            <h2 className="mb-3 flex items-baseline gap-2 font-heading text-base font-bold text-navy">
                Véhicules compatibles
                <span className="text-sm font-normal text-txt2">{cars.length} motorisations</span>
            </h2>
            {/* Deux colonnes de marques : une pile unique était plus haute que
                l'écran avant même d'ouvrir quoi que ce soit. */}
            <div className="grid gap-2 sm:grid-cols-2 sm:items-start">
                {Object.entries(grouped).map(([manuf, modelsMap]) => {
                    const isManufOpen = openManufacturers.has(manuf);
                    return (
                        <div key={manuf} className="overflow-hidden rounded-lg border border-border bg-card">
                            <button
                                onClick={() => toggle(setOpenManufacturers, manuf)}
                                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/40"
                            >
                                <span>{manuf}</span>
                                <Chevron open={isManufOpen} className="size-4 text-muted-foreground" />
                            </button>

                            {isManufOpen && (
                                <div className="divide-y divide-border/40 border-t border-border/60 bg-muted/10">
                                    {Object.entries(modelsMap).map(([model, modelCars]) => {
                                        const modelKey = `${manuf}_${model}`;
                                        const isModelOpen = openModels.has(modelKey);
                                        return (
                                            <div key={model} className="flex flex-col">
                                                <button
                                                    onClick={() => toggle(setOpenModels, modelKey)}
                                                    className="flex w-full items-center justify-between py-2.5 pl-6 pr-4 text-left text-xs font-medium transition-colors hover:bg-muted/65"
                                                >
                                                    <span className="text-foreground/90">{model}</span>
                                                    <Chevron
                                                        open={isModelOpen}
                                                        className="size-3.5 text-muted-foreground/85"
                                                    />
                                                </button>

                                                {isModelOpen && (
                                                    <div className="flex flex-col gap-2 divide-y divide-border/20 border-t border-border/30 bg-background py-2 pl-8 pr-4">
                                                        {modelCars.map((car, index) => (
                                                            <div
                                                                key={index}
                                                                className="flex items-start gap-2.5 pt-2 text-xs first:pt-0"
                                                            >
                                                                <svg
                                                                    className="mt-0.5 size-3.5 shrink-0 text-green-600"
                                                                    xmlns="http://www.w3.org/2000/svg"
                                                                    fill="none"
                                                                    viewBox="0 0 24 24"
                                                                    stroke="currentColor"
                                                                    strokeWidth="2.5"
                                                                >
                                                                    <path
                                                                        strokeLinecap="round"
                                                                        strokeLinejoin="round"
                                                                        d="M5 13l4 4L19 7"
                                                                    />
                                                                </svg>
                                                                <div className="flex min-w-0 flex-col gap-0.5">
                                                                    <span className="font-medium leading-snug text-foreground">
                                                                        {car.typeEngineName}
                                                                    </span>
                                                                    <span className="text-[10px] leading-none text-muted-foreground">
                                                                        {car.constructionIntervalStart ? formatDate(car.constructionIntervalStart) : "?"} -{" "}
                                                                        {car.constructionIntervalEnd
                                                                            ? formatDate(car.constructionIntervalEnd)
                                                                            : "aujourd'hui"}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
