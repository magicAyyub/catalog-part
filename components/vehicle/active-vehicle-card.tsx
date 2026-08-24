"use client";

import { ArrowRightIcon } from "lucide-react";

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
        <svg viewBox="0 0 46 30" fill="#fff" className="h-6.5 w-10 flex-none">
            <path d="M3 20c0-4 4-9 9-10l6-5c2-1 5-2 9-2h7c4 0 7 2 9 5l2 6c1 1 1 4 0 6H3z" />
            <circle cx="13" cy="23" r="4" fill="var(--color-banner-pine)" stroke="#fff" strokeWidth="2" />
            <circle cx="35" cy="23" r="4" fill="var(--color-banner-pine)" stroke="#fff" strokeWidth="2" />
        </svg>
    );
}

export function ActiveVehicleCard({ vehicle, onReset }: ActiveVehicleCardProps) {
    return (
        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-banner-pine px-5 py-4">
            <CarIcon />

            <div className="flex flex-col gap-0.5">
                <h3 className="font-heading text-lg font-bold leading-tight text-white">
                    {vehicle.label}
                </h3>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-white/70">
                    {vehicle.plate && (
                        <span>
                            Plaque : <span className="font-mono font-semibold text-white">{vehicle.plate}</span>
                        </span>
                    )}
                    {vehicle.vin && <span className="font-mono">VIN : {vehicle.vin}</span>}
                </div>
            </div>

            <button
                type="button"
                onClick={onReset}
                className="ml-auto flex h-11 shrink-0 items-center gap-2 rounded-md bg-white px-4 font-heading text-sm font-bold text-ink transition-colors hover:bg-white/90"
            >
                Changer de véhicule
                <ArrowRightIcon className="size-4" />
            </button>
        </div>
    );
}
