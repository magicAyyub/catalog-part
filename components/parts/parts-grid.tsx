"use client";

import { PartCard } from "./part-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import type { PartItem } from "@/hooks/parts/use-parts";

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonCard() {
    return (
        <Card className="gap-0 overflow-hidden">
            <Skeleton className="h-40 w-full rounded-none" />
            <CardHeader className="gap-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-7 w-full rounded-lg" />
            </CardContent>
        </Card>
    );
}

function SkeletonGrid({ count = 12 }: { count?: number }) {
    return (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: count }).map((_, i) => (
                <SkeletonCard key={i} />
            ))}
        </div>
    );
}

// ─── États ───────────────────────────────────────────────────────────────────

function EmptyState({ categoryLabel }: { categoryLabel: string }) {
    return (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 py-20 text-center">
            <span className="text-5xl">🔍</span>
            <p className="font-medium text-foreground">Aucune pièce trouvée</p>
            <p className="text-sm text-muted-foreground">
                Pas de {categoryLabel} disponibles pour ce véhicule.
            </p>
        </div>
    );
}

function SyncingState() {
    return (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/20 py-20 text-center">
            <span className="animate-spin text-5xl">⚙️</span>
            <p className="font-medium text-foreground">Synchronisation du catalogue…</p>
            <p className="text-sm text-muted-foreground">
                Récupération des pièces disponibles pour ce véhicule.
            </p>
        </div>
    );
}

function ErrorState() {
    return (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 py-20 text-center">
            <span className="text-5xl">⚠️</span>
            <p className="text-sm font-medium text-destructive">
                Impossible de charger les pièces.
            </p>
        </div>
    );
}

// ─── Pagination bar ───────────────────────────────────────────────────────────

const PAGE_SIZES = [12, 24, 48] as const;

interface PaginationBarProps {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    totalItems: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
}

function PaginationBar({
    currentPage,
    totalPages,
    pageSize,
    totalItems,
    onPageChange,
    onPageSizeChange,
}: PaginationBarProps) {
    if (totalPages <= 1 && totalItems <= PAGE_SIZES[0]) return null;

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
        <Pagination className="mt-6">
            <PaginationContent className="w-full justify-between">
                {/* Compteur */}
                <PaginationItem>
                    <span className="text-sm text-muted-foreground">
                        Page <span className="font-medium text-foreground">{currentPage}</span> sur{" "}
                        <span className="font-medium text-foreground">{totalPages}</span>
                        <span className="ml-2 text-xs">({totalItems} pièces)</span>
                    </span>
                </PaginationItem>

                {/* Navigation */}
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

                {/* Taille de page */}
                <PaginationItem>
                    <NativeSelect
                        value={pageSize}
                        onChange={(e) => { onPageSizeChange(Number(e.target.value)); }}
                        className="w-28"
                    >
                        {PAGE_SIZES.map((size) => (
                            <NativeSelectOption key={size} value={size}>
                                {size} / page
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
    isSyncing: boolean;
    isError: boolean;
    categoryLabel: string;
    currentPage: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    onDetail: (articleId: number) => void;
}

export function PartsGrid({
    parts,
    isLoading,
    isSyncing,
    isError,
    categoryLabel,
    currentPage,
    pageSize,
    onPageChange,
    onPageSizeChange,
    onDetail,
}: PartsGridProps) {
    if (isSyncing || isLoading) return <SkeletonGrid />;
    if (isError) return <ErrorState />;
    if (!parts || parts.length === 0) return <EmptyState categoryLabel={categoryLabel} />;

    const totalItems = parts.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const start = (currentPage - 1) * pageSize;
    const pageParts = parts.slice(start, start + pageSize);

    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {pageParts.map((part) => (
                    <PartCard
                        key={`${part.articleId}-${part.supplierId}`}
                        part={part}
                        onDetail={onDetail}
                    />
                ))}
            </div>

            <PaginationBar
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={totalItems}
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
            />
        </div>
    );
}
