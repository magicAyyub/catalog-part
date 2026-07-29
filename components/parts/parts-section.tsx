"use client";

import { useState, useMemo } from "react";
import { CategoryTabs, BRAKE_CATEGORIES } from "./category-tabs";
import { FacetPanel } from "./facet-panel";
import { PartsGrid } from "./parts-grid";
import { ArticleDetailDrawer } from "./article-detail-drawer";
import { useParts } from "@/hooks/parts/use-parts";

const DEFAULT_PAGE_SIZE = 24;

interface PartsSectionProps {
    vehicleId: number;
    isSyncing: boolean;
    isSynced: boolean;
    vehicleLabel?: string;
}

export function PartsSection({ vehicleId, isSyncing, isSynced, vehicleLabel }: PartsSectionProps) {
    // Onglet actif
    const [activeCategoryId, setActiveCategoryId] = useState<number>(BRAKE_CATEGORIES[0].categoryId);

    // Filtres fournisseur
    const [activeSuppliers, setActiveSuppliers] = useState<Set<string>>(new Set());

    // Filtres critères : criteriaName → Set<value>
    const [activeCriteria, setActiveCriteria] = useState<Record<string, Set<string>>>({});

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

    // Drawer détail
    const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null);

    const { data: parts, isLoading, isError } = useParts(vehicleId, activeCategoryId, isSynced);

    // Filtrage client
    const filteredParts = useMemo(() => {
        if (!parts) return undefined;
        let result = parts;

        // Filtre fournisseur
        if (activeSuppliers.size > 0) {
            result = result.filter((p) => p.supplierName && activeSuppliers.has(p.supplierName));
        }

        // Filtres critères (ET logique entre groupes, OU entre valeurs d'un même groupe)
        for (const [criteriaName, values] of Object.entries(activeCriteria)) {
            if (values.size === 0) continue;
            result = result.filter((p) =>
                p.specs.some((s) => s.criteriaName === criteriaName && values.has(s.criteriaValue))
            );
        }

        return result;
    }, [parts, activeSuppliers, activeCriteria]);

    const counts: Record<number, number> = {
        [activeCategoryId]: filteredParts?.length ?? 0,
    };

    const activeCategoryLabel =
        BRAKE_CATEGORIES.find((c) => c.categoryId === activeCategoryId)?.label ?? "";

    // ── Handlers ──────────────────────────────────────────────────────────────

    function toggleSupplier(name: string) {
        setActiveSuppliers((prev) => {
            const next = new Set(prev);
            next.has(name) ? next.delete(name) : next.add(name);
            return next;
        });
        setCurrentPage(1);
    }

    function toggleCriteria(criteriaName: string, value: string) {
        setActiveCriteria((prev) => {
            const currentSet = new Set(prev[criteriaName] ?? []);
            currentSet.has(value) ? currentSet.delete(value) : currentSet.add(value);
            return { ...prev, [criteriaName]: currentSet };
        });
        setCurrentPage(1);
    }

    function resetFilters() {
        setActiveSuppliers(new Set());
        setActiveCriteria({});
        setCurrentPage(1);
    }

    function handleCategoryChange(id: number) {
        setActiveCategoryId(id);
        resetFilters();
    }

    function handlePageSizeChange(size: number) {
        setPageSize(size);
        setCurrentPage(1);
    }

    return (
        <>
            <section className="flex flex-col gap-6">
                {/* En-tête */}
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-bold text-foreground">Pièces de frein</h2>
                    {vehicleLabel && (
                        <p className="text-sm text-muted-foreground">
                            Résultats pour :{" "}
                            <span className="font-medium text-foreground">{vehicleLabel}</span>
                        </p>
                    )}
                </div>

                {/* Onglets */}
                <CategoryTabs
                    activeCategoryId={activeCategoryId}
                    onChange={handleCategoryChange}
                    counts={counts}
                />

                {/* Layout : filtres + grille */}
                <div className="flex items-start gap-6">
                    {/* Panneau latéral */}
                    <div className="hidden w-64 shrink-0 md:block sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto pr-2">
                        <FacetPanel
                            parts={parts}
                            activeSuppliers={activeSuppliers}
                            activeCriteria={activeCriteria}
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
                            isSyncing={isSyncing}
                            isError={isError}
                            categoryLabel={activeCategoryLabel}
                            currentPage={currentPage}
                            pageSize={pageSize}
                            onPageChange={setCurrentPage}
                            onPageSizeChange={handlePageSizeChange}
                            onDetail={setSelectedArticleId}
                        />
                    </div>
                </div>
            </section>

            {/* Drawer détail article */}
            <ArticleDetailDrawer
                articleId={selectedArticleId}
                onClose={() => setSelectedArticleId(null)}
            />
        </>
    );
}
