"use client";

import { PartCard } from "./part-card";
import { PartCardSkeleton } from "@/components/vehicle/vehicle-identification-skeleton";
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import {
    NativeSelect,
    NativeSelectOption,
} from "@/components/ui/native-select";
import {
    Empty,
    EmptyHeader,
    EmptyTitle,
    EmptyDescription,
    EmptyMedia,
} from "@/components/ui/empty";
import type { PartItem } from "@/hooks/parts/use-parts";

// ─── États ───────────────────────────────────────────────────────────────────

function SearchIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="size-5"
            aria-hidden="true"
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
    );
}

function AlertTriangleIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="size-5"
            aria-hidden="true"
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
    );
}

import { Button } from "@/components/ui/button";

function EmptyState({
    categoryLabel,
    emptyReason,
    onClearBrandFilter,
    onResetAllFilters,
}: {
    categoryLabel: string;
    emptyReason?: "no_vehicle_parts" | "no_category_parts" | "no_filter_matches";
    onClearBrandFilter?: () => void;
    onResetAllFilters?: () => void;
}) {
    if (emptyReason === "no_vehicle_parts") {
        return (
            <Empty className="py-20 bg-muted/5">
                <EmptyMedia variant="icon">
                    <SearchIcon />
                </EmptyMedia>
                <EmptyHeader>
                    <EmptyTitle>Aucune pièce référencée</EmptyTitle>
                    <EmptyDescription>
                        Aucune pièce n&apos;est référencée pour ce véhicule.
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    }

    if (emptyReason === "no_category_parts") {
        return (
            <Empty className="py-20 bg-muted/5">
                <EmptyMedia variant="icon">
                    <SearchIcon />
                </EmptyMedia>
                <EmptyHeader>
                    <EmptyTitle>Aucune pièce dans cette catégorie</EmptyTitle>
                    <EmptyDescription>
                        Aucun {categoryLabel.toLowerCase()} n&apos;est référencé pour ce véhicule.
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    }

    return (
        <Empty className="py-20 bg-muted/5">
            <EmptyMedia variant="icon">
                <SearchIcon />
            </EmptyMedia>
            <EmptyHeader>
                <EmptyTitle>Aucun résultat pour ces filtres</EmptyTitle>
                <EmptyDescription>
                    Aucune pièce ne correspond aux filtres sélectionnés.
                </EmptyDescription>
            </EmptyHeader>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                {onClearBrandFilter && (
                    <Button type="button" variant="outline" size="sm" onClick={onClearBrandFilter}>
                        Retirer le filtre marque
                    </Button>
                )}
                {onResetAllFilters && (
                    <Button type="button" variant="default" size="sm" className="bg-pine hover:bg-pine-hover text-white" onClick={onResetAllFilters}>
                        Réinitialiser tous les filtres
                    </Button>
                )}
            </div>
        </Empty>
    );
}


function ErrorState() {
    return (
        <Empty className="py-20 border-destructive/15 bg-destructive/5 text-destructive-foreground">
            <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
                <AlertTriangleIcon />
            </EmptyMedia>
            <EmptyHeader>
                <EmptyTitle className="text-destructive font-semibold">Impossible de charger les pièces</EmptyTitle>
                <EmptyDescription>
                    Une erreur s&apos;est produite lors de la récupération des articles.
                </EmptyDescription>
            </EmptyHeader>
        </Empty>
    );
}

// ─── Pagination bar ───────────────────────────────────────────────────────────

const PAGE_SIZES = [20, 50, 100, 9999] as const;

interface PaginationBarProps {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    totalItems: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    position?: "top" | "bottom";
}

function PaginationBar({
    currentPage,
    totalPages,
    pageSize,
    totalItems,
    onPageChange,
    onPageSizeChange,
    position = "bottom",
}: PaginationBarProps) {
    if (totalItems === 0) return null;

    // Génère les numéros de pages à afficher (avec ellipsis)
    function getPageNumbers(): (number | "ellipsis")[] {
        if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
        const pages: (number | "ellipsis")[] = [1];
        if (currentPage > 3) pages.push("ellipsis");
        for (let p = Math.max(2, currentPage - 1); p <= Math.min(totalPages - 1, currentPage + 1); p++) {
            pages.push(p);
        }
        if (currentPage < totalPages - 2) pages.push("ellipsis");
        pages.push(totalPages);
        return pages;
    }

    return (
        <Pagination className={position === "top" ? "mb-4" : "mt-6"}>
            <PaginationContent className="w-full justify-between gap-2 flex-wrap sm:flex-nowrap">
                {/* Compteur */}
                <PaginationItem>
                    <span className="text-sm text-muted-foreground">
                        Page <span className="font-medium text-foreground">{currentPage}</span> sur{" "}
                        <span className="font-medium text-foreground">{totalPages}</span>
                        <span className="ml-2 text-xs">({totalItems} pièce{totalItems > 1 ? "s" : ""})</span>
                    </span>
                </PaginationItem>

                {/* Navigation (masquée si Tout afficher) */}
                {pageSize !== 9999 && totalPages > 1 && (
                    <PaginationItem className="flex items-center gap-1">
                        <PaginationPrevious
                            href="#"
                            text="Préc."
                            onClick={(e) => { e.preventDefault(); if (currentPage > 1) onPageChange(currentPage - 1); }}
                            aria-disabled={currentPage === 1}
                            className={currentPage === 1 ? "pointer-events-none opacity-40" : ""}
                        />
                        {getPageNumbers().map((p, i) =>
                            p === "ellipsis" ? (
                                <PaginationEllipsis key={`ellipsis-${i}`} />
                            ) : (
                                <PaginationLink
                                    key={p}
                                    href="#"
                                    isActive={p === currentPage}
                                    onClick={(e) => { e.preventDefault(); onPageChange(p); }}
                                >
                                    {p}
                                </PaginationLink>
                            )
                        )}
                        <PaginationNext
                            href="#"
                            text="Suiv."
                            onClick={(e) => { e.preventDefault(); if (currentPage < totalPages) onPageChange(currentPage + 1); }}
                            aria-disabled={currentPage === totalPages}
                            className={currentPage === totalPages ? "pointer-events-none opacity-40" : ""}
                        />
                    </PaginationItem>
                )}

                {/* Taille de page */}
                <PaginationItem>
                    <NativeSelect
                        value={pageSize}
                        onChange={(e) => { onPageSizeChange(Number(e.target.value)); }}
                        className="w-36"
                    >
                        {PAGE_SIZES.map((size) => (
                            <NativeSelectOption key={size} value={size}>
                                {size === 9999 ? "Tout afficher" : `${size} / page`}
                            </NativeSelectOption>
                        ))}
                    </NativeSelect>
                </PaginationItem>
            </PaginationContent>
        </Pagination>
    );
}

// ─── Grille principale ────────────────────────────────────────────────────────

interface PartsGridProps {
    parts: PartItem[] | undefined;
    isLoading: boolean;
    isError: boolean;
    categoryLabel: string;
    emptyReason?: "no_vehicle_parts" | "no_category_parts" | "no_filter_matches";
    onClearBrandFilter?: () => void;
    onResetAllFilters?: () => void;
    currentPage: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    detailHref: (articleId: number) => string;
}

export function PartsGrid({
    parts,
    isLoading,
    isError,
    categoryLabel,
    emptyReason,
    onClearBrandFilter,
    onResetAllFilters,
    currentPage,
    pageSize,
    onPageChange,
    onPageSizeChange,
    detailHref,
}: PartsGridProps) {
    if (isLoading) {
        return (
            <div className="flex flex-col gap-4 animate-in fade-in duration-300">
                <PartCardSkeleton />
                <PartCardSkeleton />
                <PartCardSkeleton />
                <PartCardSkeleton />
            </div>
        );
    }
    if (isError) return <ErrorState />;
    if (!parts || parts.length === 0) {
        return (
            <EmptyState
                categoryLabel={categoryLabel}
                emptyReason={emptyReason}
                onClearBrandFilter={onClearBrandFilter}
                onResetAllFilters={onResetAllFilters}
            />
        );
    }

    const totalItems = parts.length;
    const effectivePageSize = pageSize === 9999 ? totalItems : pageSize;
    const totalPages = Math.max(Math.ceil(totalItems / effectivePageSize), 1);
    const start = (currentPage - 1) * effectivePageSize;
    const pageParts = parts.slice(start, start + effectivePageSize);

    return (
        <div className="flex flex-col gap-4">
            {/* Pagination en HAUT */}
            <PaginationBar
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={totalItems}
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
                position="top"
            />

            <div className="flex flex-col gap-4">
                {pageParts.map((part) => (
                    <PartCard
                        key={`${part.articleId}-${part.supplierId}`}
                        part={part}
                        detailHref={detailHref(part.articleId)}
                    />
                ))}
            </div>

            {/* Pagination en BAS */}
            <PaginationBar
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={totalItems}
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
                position="bottom"
            />
        </div>
    );
}
