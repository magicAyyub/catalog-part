"use client";

import { useState } from "react";
import { CheckIcon, MinusIcon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { sortSupplierNames } from "@/lib/parts/suppliers";
import { BRAKE_CATEGORIES, FACET_CRITERIA, canonicalCriteriaValue } from "@/lib/parts/facets";
import type { PartItem } from "@/hooks/parts/use-parts";

interface FacetOption {
    label: string;
    count: number;
    checked: boolean;
}

interface FacetPanelProps {
    parts: PartItem[] | undefined;
    /** Empty means every category, which is the default state of the catalog. */
    activeCategories: Set<number>;
    activeSuppliers: Set<string>;
    activeCriteria: Record<string, Set<string>>;
    onToggleCategory: (categoryId: number) => void;
    onToggleSupplier: (name: string) => void;
    onToggleCriteria: (criteriaName: string, value: string) => void;
    onReset: () => void;
}

export function FacetPanel({
    parts,
    activeCategories,
    activeSuppliers,
    activeCriteria,
    onToggleCategory,
    onToggleSupplier,
    onToggleCriteria,
    onReset,
}: FacetPanelProps) {
    // ── Catégories ────────────────────────────────────────────────────────────
    const categoryOptions: FacetOption[] = BRAKE_CATEGORIES.map(({ categoryId, label }) => ({
        label,
        count: (parts ?? []).filter((p) => p.categoryId === categoryId).length,
        checked: activeCategories.has(categoryId),
    }));

    // ── Fournisseurs ──────────────────────────────────────────────────────────
    const supplierIdMap = new Map<string, number>();
    for (const p of parts ?? []) {
        if (p.supplierName && !supplierIdMap.has(p.supplierName)) {
            supplierIdMap.set(p.supplierName, p.supplierId);
        }
    }
    const presentNames = Array.from(supplierIdMap.keys());
    const sortedSuppliers = sortSupplierNames(presentNames, supplierIdMap);
    const supplierOptions: FacetOption[] = sortedSuppliers.map((name) => ({
        label: name,
        count: (parts ?? []).filter((p) => p.supplierName === name).length,
        checked: activeSuppliers.has(name),
    }));

    // ── Critères retenus comme filtres ────────────────────────────────────────
    // Dérivés des specs des articles présents, mais bornés à la liste blanche :
    // tout critère TecDoc donnait une section, soit une vingtaine par véhicule.
    const criteriaGroupsMap = new Map<string, Set<string>>();
    for (const p of parts ?? []) {
        for (const s of p.specs) {
            const values = criteriaGroupsMap.get(s.criteriaName) ?? new Set<string>();
            values.add(canonicalCriteriaValue(s.criteriaName, s.criteriaValue));
            criteriaGroupsMap.set(s.criteriaName, values);
        }
    }
    // Une seule valeur distincte : filtrer ne retirerait rien.
    const criteriaGroups = FACET_CRITERIA.map(
        (name) => [name, criteriaGroupsMap.get(name) ?? new Set<string>()] as const
    ).filter(([, values]) => values.size > 1);

    const hasActiveFilter =
        activeCategories.size > 0 ||
        activeSuppliers.size > 0 ||
        Object.values(activeCriteria).some((s) => s.size > 0);

    return (
        <aside className="flex flex-col rounded-lg border border-stroke bg-card p-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3">
                <h2 className="font-heading text-base font-bold text-ink">Filtres</h2>
                {hasActiveFilter && (
                    <button
                        onClick={onReset}
                        className="text-sm font-medium text-ink hover:text-ink-hover"
                    >
                        Réinitialiser
                    </button>
                )}
            </div>

            <FilterSection
                title="Catégorie"
                options={categoryOptions}
                onToggle={(label) => {
                    const hit = BRAKE_CATEGORIES.find((c) => c.label === label);
                    if (hit) onToggleCategory(hit.categoryId);
                }}
                emptyLabel="Aucune catégorie"
                first
            />

            <FilterSection
                title="Marques"
                options={supplierOptions}
                onToggle={onToggleSupplier}
                emptyLabel={parts === undefined ? "Chargement…" : "Aucun fournisseur"}
            />

            {/* Sections critères dynamiques */}
            {criteriaGroups.map(([criteriaName, values]) => {
                const active = activeCriteria[criteriaName] ?? new Set<string>();
                // Tri numérique si possible, alphabétique sinon
                const sortedValues = [...values].sort((a, b) => {
                    const na = parseFloat(a);
                    const nb = parseFloat(b);
                    if (!isNaN(na) && !isNaN(nb)) return na - nb;
                    return a.localeCompare(b);
                });
                const options: FacetOption[] = sortedValues.map((value) => ({
                    label: value,
                    count: (parts ?? []).filter((p) =>
                        p.specs.some(
                            (s) =>
                                s.criteriaName === criteriaName &&
                                canonicalCriteriaValue(criteriaName, s.criteriaValue) === value
                        )
                    ).length,
                    checked: active.has(value),
                }));

                return (
                    <FilterSection
                        key={criteriaName}
                        title={criteriaName}
                        options={options}
                        onToggle={(value) => onToggleCriteria(criteriaName, value)}
                        emptyLabel="Aucune valeur"
                    />
                );
            })}
        </aside>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Bloc de filtre repliable : recherche + liste défilante, comme sur la référence. */
function FilterSection({
    title,
    options,
    onToggle,
    emptyLabel,
    first = false,
}: {
    title: string;
    options: FacetOption[];
    onToggle: (label: string) => void;
    emptyLabel: string;
    first?: boolean;
}) {
    const [open, setOpen] = useState(true);
    const [query, setQuery] = useState("");

    const q = query.trim().toLowerCase();
    // Les options cochées restent toujours visibles, même si la recherche les masquerait.
    const checkedFirst = [...options].sort((a, b) => Number(b.checked) - Number(a.checked));
    const visible = q
        ? checkedFirst.filter((o) => o.checked || o.label.toLowerCase().includes(q))
        : checkedFirst;

    return (
        <div className={cn("py-3", !first && "border-t border-stroke")}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center justify-between rounded-md bg-muted px-3 py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-ink"
            >
                {title}
                {open ? <MinusIcon size={14} /> : <PlusIcon size={14} />}
            </button>

            {open && (
                <div className="mt-3 flex flex-col gap-2">
                    {options.length > 0 && (
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Recherche"
                            className="h-9 w-full rounded-md border border-stroke px-3 text-sm text-ink outline-none placeholder:text-txt2 focus:border-pine"
                        />
                    )}

                    {options.length === 0 ? (
                        <p className="py-1 text-sm italic text-txt2">{emptyLabel}</p>
                    ) : (
                        <div className="flex max-h-56 flex-col overflow-y-auto">
                            {visible.length === 0 ? (
                                <p className="py-1 text-sm italic text-txt2">Aucun résultat</p>
                            ) : (
                                visible.map((o) => (
                                    <CheckRow
                                        key={o.label}
                                        label={o.label}
                                        count={o.count}
                                        checked={o.checked}
                                        onToggle={() => onToggle(o.label)}
                                    />
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function CheckRow({
    label,
    count,
    checked,
    onToggle,
}: {
    label: string;
    count?: number;
    checked: boolean;
    onToggle: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-pressed={checked}
            className="flex w-full shrink-0 items-center gap-2.5 rounded-md px-1 py-2 text-sm text-ink transition-colors hover:bg-muted"
        >
            <span
                className={cn(
                    "flex size-4 flex-none items-center justify-center rounded-sm border",
                    checked ? "border-pine bg-pine text-white" : "border-stroke bg-white"
                )}
            >
                {checked && <CheckIcon size={11} strokeWidth={3} />}
            </span>
            <span className="flex-1 truncate text-left">{label}</span>
            {count !== undefined && (
                <span className="tabular-nums text-xs text-txt2">{count}</span>
            )}
        </button>
    );
}
