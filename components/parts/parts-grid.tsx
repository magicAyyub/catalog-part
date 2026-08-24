"use client";

import { PartCard } from "./part-card";
import { BusyPanel } from "@/components/ui/busy-panel";
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

function EmptyState({ categoryLabel }: { categoryLabel: string }) {
    return (
        <Empty className="py-20 bg-muted/5">
            <EmptyMedia variant="icon">
                <SearchIcon />
            </EmptyMedia>
            <EmptyHeader>
                <EmptyTitle>Aucune pièce trouvée</EmptyTitle>
                <EmptyDescription>
                    Pas de {categoryLabel.toLowerCase()} disponibles pour ce véhicule.
                </EmptyDescription>
            </EmptyHeader>
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
                    Une erreur s'est produite lors de la récupération des articles.
                </EmptyDescription>
            </EmptyHeader>
        </Empty>
    );
}

// ─── Pagination bar ───────────────────────────────────────────────────────────

const PAGE_SIZES = [5, 10, 20] as const;

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
    isError: boolean;
    categoryLabel: string;
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
    currentPage,
    pageSize,
    onPageChange,
    onPageSizeChange,
    detailHref,
}: PartsGridProps) {
    if (isLoading) {
        return (
            <BusyPanel
                title="Recherche des pièces compatibles"
                description="La première consultation d'un véhicule interroge le catalogue fournisseur, ce qui prend quelques secondes. Les suivantes sont immédiates."
            />
        );
    }
    if (isError) return <ErrorState />;
    if (!parts || parts.length === 0) return <EmptyState categoryLabel={categoryLabel} />;

    const totalItems = parts.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const start = (currentPage - 1) * pageSize;
    const pageParts = parts.slice(start, start + pageSize);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4">
                {pageParts.map((part) => (
                    <PartCard
                        key={`${part.articleId}-${part.supplierId}`}
                        part={part}
                        detailHref={detailHref(part.articleId)}
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
