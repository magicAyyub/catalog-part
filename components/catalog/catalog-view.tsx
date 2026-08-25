"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { VehicleCascade } from "@/components/vehicle/vehicle-cascade";
import { ActiveVehicleCard, type ActiveVehicleData } from "@/components/vehicle/active-vehicle-card";
import { PartsSection } from "@/components/parts/parts-section";
import { useSaveSelection } from "@/hooks/vehicle/use-selection";
import { ACTIVE_VEHICLE_KEY as STORAGE_KEY } from "@/lib/catalog/active-vehicle";

const VEHICLE_PARAM = "vehicule";

function subscribeToStorage(onChange: () => void): () => void {
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
}

/** Read as a store rather than in an effect, so the value exists on first render. */
function readStoredVehicle(): string | null {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

function parseVehicle(raw: string | null): ActiveVehicleData | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as ActiveVehicleData;
        return parsed?.vehicleId ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * The catalog, with the active vehicle carried in the URL.
 *
 * `localStorage` keeps the readable labels, which the URL cannot hold, and the
 * URL keeps the identity, which makes the screen shareable and lets a return
 * from a part detail land exactly where it left. On a link received from
 * someone else, the labels are unknown and the card degrades to the vehicle
 * number rather than inventing one.
 */
export function CatalogView() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const saveSelection = useSaveSelection();

    const storedRaw = useSyncExternalStore(subscribeToStorage, readStoredVehicle, () => null);
    const storedVehicle = useMemo(() => parseVehicle(storedRaw), [storedRaw]);

    // `undefined` tant que rien n'a été choisi dans cette session : l'écran
    // reflète alors ce que portent l'URL et le stockage.
    const [chosen, setChosen] = useState<ActiveVehicleData | null | undefined>(undefined);

    const urlVehicleId = Number(searchParams.get(VEHICLE_PARAM)) || null;

    const restored: ActiveVehicleData | null = urlVehicleId
        ? storedVehicle?.vehicleId === urlVehicleId
            ? storedVehicle
            : { vehicleId: urlVehicleId, label: `Véhicule #${urlVehicleId}` }
        : storedVehicle;

    const activeVehicleData = chosen !== undefined ? chosen : restored;

    function setVehicleParam(vehicleId: number | null) {
        const params = new URLSearchParams(searchParams.toString());
        if (vehicleId) params.set(VEHICLE_PARAM, String(vehicleId));
        else params.delete(VEHICLE_PARAM);
        router.replace(params.size > 0 ? `${pathname}?${params}` : pathname, { scroll: false });
    }

    // Un véhicule repris du stockage mais absent de l'URL l'y remet, pour que
    // l'adresse décrive toujours l'écran affiché.
    const needsUrlSync = !urlVehicleId && chosen === undefined && Boolean(storedVehicle);
    useEffect(() => {
        if (needsUrlSync && storedVehicle) setVehicleParam(storedVehicle.vehicleId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [needsUrlSync]);

    function handleVehicleSelected(vehicleId: number) {
        setChosen({ vehicleId, label: `Véhicule #${vehicleId}` });
    }

    function handleVehicleConfirmed(
        vehicleId: number,
        details?: { label: string; plate?: string }
    ) {
        const vehicleData: ActiveVehicleData = {
            vehicleId,
            label: details?.label || `Véhicule #${vehicleId}`,
            plate: details?.plate,
        };

        setChosen(vehicleData);
        setVehicleParam(vehicleId);
        saveSelection(vehicleId);

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(vehicleData));
        } catch {
            // Quota dépassé ou stockage désactivé : l'URL suffit à tenir l'écran.
        }
    }

    function handleResetVehicle() {
        setChosen(null);
        router.replace(pathname, { scroll: false });

        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // Ignorer
        }
    }

    const selectedVehicleId = activeVehicleData?.vehicleId ?? null;
    const isVehicleActive = selectedVehicleId !== null && activeVehicleData !== null;

    return (
        <main className="mx-auto max-w-[1600px] w-full px-4 py-10 sm:px-6 lg:px-8">
            <div className="mb-8">
                <h1 className="font-heading text-2xl font-bold text-ink">Catalogue de pièces auto</h1>
                <p className="mt-1 text-sm text-txt2">
                    Identifiez votre véhicule pour trouver les pièces compatibles.
                </p>
            </div>

            <section className="mb-10 max-w-6xl">
                {isVehicleActive ? (
                    <ActiveVehicleCard vehicle={activeVehicleData} onReset={handleResetVehicle} />
                ) : (
                    <VehicleCascade
                        onVehicleSelected={handleVehicleSelected}
                        onVehicleConfirmed={handleVehicleConfirmed}
                    />
                )}
            </section>

            {selectedVehicleId && (
                <>
                    <div className="mb-10 border-t border-border" />

                    <PartsSection vehicleId={selectedVehicleId} />
                </>
            )}
        </main>
    );
}
