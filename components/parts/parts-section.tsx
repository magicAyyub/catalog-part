"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BRAKE_CATEGORIES, CATEGORY_IDS } from "@/lib/parts/facets";
import { FacetPanel } from "./facet-panel";
import { PartsGrid } from "./parts-grid";
import { useParts } from "@/hooks/parts/use-parts";
import { useReferenceParts } from "@/hooks/parts/use-reference-parts";
import { canonicalCriteriaValue } from "@/lib/parts/facets";

import { Button } from "@/components/ui/button";
import { SlidersHorizontal, X } from "lucide-react";
import {
    Empty,
    EmptyHeader,
    EmptyTitle,
    EmptyDescription,
    EmptyMedia,
} from "@/components/ui/empty";

import { isEtfSupplier } from "@/lib/parts/suppliers";
import { SortSelect, type SortOption } from "./sort-select";

const DEFAULT_PAGE_SIZE = 20;
const STORAGE_PAGE_SIZE_KEY = "catalog_page_size";

function getInitialPageSize(): number {
    try {
        if (typeof window !== "undefined") {
            const stored = localStorage.getItem(STORAGE_PAGE_SIZE_KEY);
            if (stored) {
                const parsed = Number(stored);
                if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
            }
        }
    } catch {
        // Ignorer
    }
    return DEFAULT_PAGE_SIZE;
}

/**
 * Query keys the catalog reads its own state from. Filters live in the URL so
 * leaving for a part detail and coming back lands on the same screen, and so a
 * filtered catalog can be sent to someone as a link.
 */
const PARAM = {
    category: "cat",
    supplier: "f",
    criteria: "c",
    sort: "tri",
    page: "page",
    pageSize: "taille",
} as const;

/** `name:value`, split on the first colon since a value may contain one. */
function parseCriteria(values: string[]): Record<string, Set<string>> {
    const criteria: Record<string, Set<string>> = {};
    for (const raw of values) {
        const at = raw.indexOf(":");
        if (at <= 0) continue;
        const name = raw.slice(0, at);
        (criteria[name] ??= new Set()).add(raw.slice(at + 1));
    }
    return criteria;
}

interface PartsSectionProps {
    vehicleId?: number | null;
    vehicleLabel?: string;
    referenceQuery?: string | null;
}

export function PartsSection({ vehicleId, vehicleLabel, referenceQuery }: PartsSectionProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    /** Aucune catégorie dans l'URL : les deux, ce que quelqu'un au comptoir veut voir. */
    const activeCategories = useMemo(() => {
        const asked = searchParams
            .getAll(PARAM.category)
            .map(Number)
            .filter((id) => BRAKE_CATEGORIES.some((c) => c.categoryId === id));
        return new Set(asked);
    }, [searchParams]);

    const activeSuppliers = useMemo(
        () => new Set(searchParams.getAll(PARAM.supplier)),
        [searchParams]
    );
    const activeCriteria = useMemo(
        () => parseCriteria(searchParams.getAll(PARAM.criteria)),
        [searchParams]
    );
    const activeSort = (searchParams.get(PARAM.sort) as SortOption) || "pertinence";
    const currentPage = Math.max(Number(searchParams.get(PARAM.page)) || 1, 1);
    const pageSize = Number(searchParams.get(PARAM.pageSize)) || getInitialPageSize();

    const vehicleQueryResult = useParts(vehicleId ?? null, CATEGORY_IDS);
    const referenceQueryResult = useReferenceParts(referenceQuery ?? null);

    const isReferenceSearch = Boolean(referenceQuery && referenceQuery.trim().length >= 3);
    const activeQuery = isReferenceSearch ? referenceQueryResult : vehicleQueryResult;

    const parts = activeQuery.data;
    const isLoading = activeQuery.isLoading;
    const isError = activeQuery.isError;
    const error = activeQuery.error;

    /**
     * Replaces rather than pushes: a history entry per filter click would bury
     * the way out of the catalog. Leaving for a part detail is a push, so coming
     * back still restores the filters that were active at that moment.
     */
    function commit(mutate: (params: URLSearchParams) => void) {
        const params = new URLSearchParams(searchParams.toString());
        mutate(params);
        router.replace(params.size > 0 ? `${pathname}?${params}` : pathname, { scroll: false });
    }

    // Filtrage & Tri client
    const filteredParts = useMemo(() => {
        if (!parts) return undefined;
        let result = parts;

        if (activeSuppliers.size > 0) {
            result = result.filter((p) => p.supplierName && activeSuppliers.has(p.supplierName));
        }

        if (activeCategories.size > 0) {
            result = result.filter((p) => activeCategories.has(p.categoryId));
        }

        for (const [criteriaName, values] of Object.entries(activeCriteria)) {
            if (values.size === 0) continue;
            result = result.filter((p) =>
                p.specs.some(
                    (s) =>
                        s.criteriaName === criteriaName &&
                        values.has(canonicalCriteriaValue(criteriaName, s.criteriaValue))
                )
            );
        }

        // Application du tri
        const sorted = [...result];
        if (activeSort === "pertinence") {
            // Épinglage ETF en tête de résultats
            sorted.sort((a, b) => {
                const aEtf = isEtfSupplier(a.supplierId, a.supplierName);
                const bEtf = isEtfSupplier(b.supplierId, b.supplierName);
                if (aEtf && !bEtf) return -1;
                if (!aEtf && bEtf) return 1;
                return 0;
            });
        } else if (activeSort === "brand_asc") {
            sorted.sort((a, b) => (a.supplierName ?? "").localeCompare(b.supplierName ?? ""));
        } else if (activeSort === "name_asc") {
            sorted.sort((a, b) => a.articleProductName.localeCompare(b.articleProductName));
        } else if (activeSort === "position") {
            sorted.sort((a, b) => {
                const aFront = a.specs.some((s) => s.criteriaValue.toLowerCase().includes("avant"));
                const bFront = b.specs.some((s) => s.criteriaValue.toLowerCase().includes("avant"));
                if (aFront && !bFront) return -1;
                if (!aFront && bFront) return 1;
                return 0;
            });
        }

        return sorted;
    }, [parts, activeCategories, activeSuppliers, activeCriteria, activeSort]);

    // Raison de l'état vide
    const emptyReason = useMemo((): "no_vehicle_parts" | "no_category_parts" | "no_filter_matches" => {
        if (!parts || parts.length === 0) return "no_vehicle_parts";
        if (activeCategories.size > 0) {
            const catParts = parts.filter((p) => activeCategories.has(p.categoryId));
            if (catParts.length === 0) return "no_category_parts";
        }
        return "no_filter_matches";
    }, [parts, activeCategories]);

    /** Ce que la grille annonce quand elle est vide, au plus près de la sélection. */
    const selectionLabel =
        activeCategories.size === 1
            ? (BRAKE_CATEGORIES.find((c) => activeCategories.has(c.categoryId))?.label ?? "pièces")
            : "pièces";

    // ── Handlers ──────────────────────────────────────────────────────────────

    function handleSortChange(sort: SortOption) {
        commit((params) => {
            if (sort === "pertinence") params.delete(PARAM.sort);
            else params.set(PARAM.sort, sort);
            params.delete(PARAM.page);
        });
    }

    function clearBrandFilter() {
        commit((params) => {
            params.delete(PARAM.supplier);
            params.delete(PARAM.page);
        });
    }

    function toggleSupplier(name: string) {
        commit((params) => {
            const next = new Set(params.getAll(PARAM.supplier));
            if (next.has(name)) next.delete(name);
            else next.add(name);
            params.delete(PARAM.supplier);
            for (const value of next) params.append(PARAM.supplier, value);
            params.delete(PARAM.page);
        });
    }

    function toggleCriteria(criteriaName: string, value: string) {
        commit((params) => {
            const entry = `${criteriaName}:${value}`;
            const next = params.getAll(PARAM.criteria).filter((v) => v !== entry);
            if (next.length === params.getAll(PARAM.criteria).length) next.push(entry);
            params.delete(PARAM.criteria);
            for (const v of next) params.append(PARAM.criteria, v);
            params.delete(PARAM.page);
        });
    }

    function toggleCategory(categoryId: number) {
        commit((params) => {
            const next = new Set(params.getAll(PARAM.category));
            const entry = String(categoryId);
            if (next.has(entry)) next.delete(entry);
            else next.add(entry);
            params.delete(PARAM.category);
            for (const value of next) params.append(PARAM.category, value);
            params.delete(PARAM.page);
        });
    }

    function resetFilters() {
        commit((params) => {
            params.delete(PARAM.category);
            params.delete(PARAM.supplier);
            params.delete(PARAM.criteria);
            params.delete(PARAM.page);
        });
    }

    function handlePageChange(page: number) {
        commit((params) => {
            if (page <= 1) params.delete(PARAM.page);
            else params.set(PARAM.page, String(page));
        });
    }

    function handlePageSizeChange(size: number) {
        try {
            localStorage.setItem(STORAGE_PAGE_SIZE_KEY, String(size));
        } catch {
            // Ignorer
        }
        commit((params) => {
            params.set(PARAM.pageSize, String(size));
            params.delete(PARAM.page);
        });
    }

    /** The detail page carries the way back, for a link opened from elsewhere. */
    function detailHref(articleId: number): string {
        const back = searchParams.toString();
        return back ? `/piece/${articleId}?retour=${encodeURIComponent(back)}` : `/piece/${articleId}`;
    }

    const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

    const activeFilterCount =
        activeSuppliers.size +
        activeCategories.size +
        Object.values(activeCriteria).reduce((acc, s) => acc + s.size, 0);

    const [showErrorDetails, setShowErrorDetails] = useState(false);

    if (error) {
        return (
            <Empty className="my-6 border-destructive/15 bg-destructive/5 text-destructive-foreground p-10">
                <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
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
                </EmptyMedia>
                <EmptyHeader>
                    <EmptyTitle className="text-destructive font-semibold">Impossible de charger le catalogue</EmptyTitle>
                    <EmptyDescription>
                        Une erreur s&apos;est produite lors de la communication avec le service de pièces.
                    </EmptyDescription>
                </EmptyHeader>
                <div className="mt-2 flex flex-col items-center gap-3">
                    <button
                        onClick={() => setShowErrorDetails(!showErrorDetails)}
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                    >
                        {showErrorDetails ? "Masquer les détails techniques" : "Afficher les détails techniques"}
                    </button>
                    {showErrorDetails && (
                        <pre className="mt-4 max-w-xl w-full overflow-x-auto text-left whitespace-pre-wrap rounded bg-muted/60 border border-border/40 p-3 font-mono text-xs text-muted-foreground leading-relaxed">
                            {error.message}
                        </pre>
                    )}
                </div>
            </Empty>
        );
    }

    return (
        <section className="flex flex-col gap-6">
            {/* En-tête + Sort + Bouton filtres mobile */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h2 className="font-heading text-lg font-bold text-ink">
                        {isReferenceSearch ? "Pièces équivalentes autorisées" : "Pièces compatibles"}
                    </h2>
                    {vehicleLabel && !isReferenceSearch && (
                        <p className="text-sm text-muted-foreground">
                            Résultats pour :{" "}
                            <span className="font-medium text-foreground">{vehicleLabel}</span>
                        </p>
                    )}
                    {isReferenceSearch && (
                        <p className="text-sm text-muted-foreground">
                            Résultats pour la référence :{" "}
                            <span className="font-medium text-foreground">{referenceQuery}</span>
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <SortSelect value={activeSort} onChange={handleSortChange} />

                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsMobileFiltersOpen(true)}
                        className="flex md:hidden items-center gap-2 border-stroke bg-card shadow-xs"
                    >
                        <SlidersHorizontal className="size-4 text-txt2" />
                        <span className="text-xs font-semibold text-ink">Filtres</span>
                        {activeFilterCount > 0 && (
                            <span className="rounded-full bg-pine px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                                {activeFilterCount}
                            </span>
                        )}
                    </Button>
                </div>
            </div>

            {/* Layout : filtres + grille */}
            <div className="flex items-start gap-6">
                {/* Panneau latéral desktop */}
                <div className="hidden w-64 shrink-0 md:block sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto pr-2">
                    <FacetPanel
                        parts={parts}
                        activeCategories={activeCategories}
                        activeSuppliers={activeSuppliers}
                        activeCriteria={activeCriteria}
                        onToggleCategory={toggleCategory}
                        onToggleSupplier={toggleSupplier}
                        onToggleCriteria={toggleCriteria}
                        onReset={resetFilters}
                    />
                </div>

                {/* Grille */}
                <div className="min-w-0 flex-1">
                    <PartsGrid
                        parts={filteredParts}
                        isLoading={isLoading}
                        isError={isError}
                        categoryLabel={selectionLabel}
                        emptyReason={emptyReason}
                        onClearBrandFilter={activeSuppliers.size > 0 ? clearBrandFilter : undefined}
                        onResetAllFilters={resetFilters}
                        currentPage={currentPage}
                        pageSize={pageSize}
                        onPageChange={handlePageChange}
                        onPageSizeChange={handlePageSizeChange}
                        detailHref={detailHref}
                    />
                </div>
            </div>

            {/* Drawer / Overlay de filtres mobile */}
            {isMobileFiltersOpen && (
                <div className="fixed inset-0 z-50 flex md:hidden bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative ml-auto flex h-full w-full max-w-xs flex-col bg-card p-6 shadow-2xl overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-stroke pb-4 mb-4">
                            <h3 className="font-heading text-base font-bold text-ink">Filtres de recherche</h3>
                            <button
                                type="button"
                                onClick={() => setIsMobileFiltersOpen(false)}
                                className="rounded-md p-1.5 text-txt2 hover:bg-muted hover:text-ink transition-colors"
                                aria-label="Fermer les filtres"
                            >
                                <X className="size-5" />
                            </button>
                        </div>

                        <FacetPanel
                            parts={parts}
                            activeCategories={activeCategories}
                            activeSuppliers={activeSuppliers}
                            activeCriteria={activeCriteria}
                            onToggleCategory={toggleCategory}
                            onToggleSupplier={toggleSupplier}
                            onToggleCriteria={toggleCriteria}
                            onReset={resetFilters}
                        />

                        <div className="mt-6 pt-4 border-t border-stroke sticky bottom-0 bg-card">
                            <Button
                                type="button"
                                className="w-full bg-pine hover:bg-pine-hover text-white font-medium"
                                onClick={() => setIsMobileFiltersOpen(false)}
                            >
                                Afficher les résultats ({filteredParts?.length ?? 0})
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
