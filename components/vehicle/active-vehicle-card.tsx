"use client";

import { Trash2Icon } from "lucide-react";
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
        <svg viewBox="0 0 46 30" fill="#fff" className="h-6.5 w-10 flex-none">
            <path d="M3 20c0-4 4-9 9-10l6-5c2-1 5-2 9-2h7c4 0 7 2 9 5l2 6c1 1 1 4 0 6H3z" />
            <circle cx="13" cy="23" r="4" fill="var(--color-banner-pine)" stroke="#fff" strokeWidth="2" />
            <circle cx="35" cy="23" r="4" fill="var(--color-banner-pine)" stroke="#fff" strokeWidth="2" />
        </svg>
    );
}

/**
 * Le vehicule actif, et l'action qui le retire.
 *
 * L'action est hors du bandeau : posee dedans, elle portait le meme blanc sur
 * vert que le contenu et se lisait comme une etiquette plutot que comme une
 * commande. Dehors, elle reprend l'apparence de bouton du reste de
 * l'application, que le comptoir connait deja.
 */
export function ActiveVehicleCard({ vehicle, onReset }: ActiveVehicleCardProps) {
    return (
        <div className="flex flex-col gap-3">
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
            </div>

            <div className="flex justify-end">
                <Button type="button" variant="destructive" size="lg" onClick={onReset}>
                    <Trash2Icon />
                    Effacer le véhicule
                </Button>
            </div>
        </div>
    );
}
