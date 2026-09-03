"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function ActiveVehicleSkeleton() {
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-4 rounded-lg bg-banner-pine/10 border border-pine/20 px-5 py-4">
                <Skeleton className="h-9 w-9 rounded-full bg-pine/20" />
                <div className="flex flex-col gap-2 flex-1">
                    <Skeleton className="h-6 w-64 max-w-full bg-pine/20" />
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-4 w-28 bg-pine/15" />
                        <Skeleton className="h-4 w-36 bg-pine/15" />
                    </div>
                </div>
            </div>
        </div>
    );
}

export function FacetPanelSkeleton() {
    return (
        <div className="flex flex-col gap-6 rounded-lg border border-stroke bg-card p-5">
            <div className="flex items-center justify-between border-b border-stroke pb-4">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-16" />
            </div>
            <div className="flex flex-col gap-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-full rounded-md" />
                <Skeleton className="h-8 w-full rounded-md" />
            </div>
            <div className="flex flex-col gap-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-6 w-4/5" />
            </div>
        </div>
    );
}

export function PartCardSkeleton() {
    return (
        <div className="flex w-full flex-col sm:flex-row rounded-lg border border-stroke bg-card p-4 gap-4">
            <div className="flex w-full sm:w-28 shrink-0 flex-col items-center gap-3">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="size-20 rounded-md" />
            </div>
            <div className="flex flex-1 flex-col gap-2.5 sm:border-l sm:border-stroke sm:pl-5">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3.5 w-1/3" />
                <div className="mt-2 flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3.5 w-5/6" />
                    <Skeleton className="h-3.5 w-2/3" />
                </div>
            </div>
            <div className="flex w-full sm:w-44 shrink-0 flex-col items-end justify-center gap-3 sm:border-l sm:border-stroke sm:pl-4">
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-10 w-full rounded-md" />
            </div>
        </div>
    );
}

export function VehicleIdentificationSkeleton() {
    return (
        <div className="flex flex-col gap-8 animate-in fade-in duration-300">
            {/* Active Vehicle Card Skeleton */}
            <ActiveVehicleSkeleton />

            {/* Layout : filtres + grille */}
            <div className="flex items-start gap-6">
                {/* Panneau latéral Skeleton */}
                <div className="hidden w-64 shrink-0 md:block">
                    <FacetPanelSkeleton />
                </div>

                {/* Grille de pièces Skeletons */}
                <div className="min-w-0 flex-1 flex flex-col gap-4">
                    <PartCardSkeleton />
                    <PartCardSkeleton />
                    <PartCardSkeleton />
                </div>
            </div>
        </div>
    );
}
