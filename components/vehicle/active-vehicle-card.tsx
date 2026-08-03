"use client";

import { Button } from "@/components/ui/button";

export interface ActiveVehicleData {
    vehicleId: number;
    label: string;
    plate?: string;
    vin?: string;
}

interface ActiveVehicleCardProps {
    vehicle: ActiveVehicleData;
    onReset: () => void;
}

function CarIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="size-5"
            aria-hidden="true"
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 17a1 1 0 100 2 1 1 0 000-2zm8 0a1 1 0 100 2 1 1 0 000-2zM3 9l2-4h14l2 4M3 9v8a1 1 0 001 1h1m16-9v8a1 1 0 01-1 1h-1M3 9h18" />
        </svg>
    );
}

function RefreshIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="size-4"
            aria-hidden="true"
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
    );
}

export function ActiveVehicleCard({ vehicle, onReset }: ActiveVehicleCardProps) {
    return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 shadow-xs">
            <div className="flex items-center gap-3.5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-600 dark:text-emerald-400">
                    <CarIcon />
                </div>

                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                            Véhicule actif
                        </span>

                        {vehicle.plate && (
                            <span className="ml-1 rounded bg-emerald-600/10 px-2 py-0.5 font-mono text-xs font-bold text-emerald-800 dark:text-emerald-200">
                                {vehicle.plate}
                            </span>
                        )}
                    </div>

                    <h3 className="text-base font-bold text-foreground">
                        {vehicle.label}
                    </h3>

                    {vehicle.vin && (
                        <span className="font-mono text-xs text-muted-foreground">
                            VIN : {vehicle.vin}
                        </span>
                    )}
                </div>
            </div>

            <Button
                type="button"
                variant="outline"
                onClick={onReset}
                className="h-10 border-emerald-600/20 text-emerald-700 hover:bg-emerald-600/10 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-100 shrink-0 gap-2"
            >
                <RefreshIcon />
                <span>Changer de véhicule</span>
            </Button>
        </div>
    );
}
