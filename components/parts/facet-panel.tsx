"use client";

import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { sortSupplierNames } from "@/lib/parts/suppliers";
import type { PartItem } from "@/hooks/parts/use-parts";

// Nombre max de groupes critères affichés
const MAX_CRITERIA_GROUPS = 5;
// Nombre max de valeurs par groupe avant "afficher plus"
const MAX_VALUES_SHOWN = 6;

interface FacetPanelProps {
    parts: PartItem[] | undefined;
    activeSuppliers: Set<string>;
    activeCriteria: Record<string, Set<string>>;
    onToggleSupplier: (name: string) => void;
    onToggleCriteria: (criteriaName: string, value: string) => void;
    onReset: () => void;
}

export function FacetPanel({
    parts,
    activeSuppliers,
    activeCriteria,
    onToggleSupplier,
    onToggleCriteria,
    onReset,
}: FacetPanelProps) {
    // ── Fournisseurs ──────────────────────────────────────────────────────────
    const supplierIdMap = new Map<string, number>();
    for (const p of parts ?? []) {
        if (p.supplierName && !supplierIdMap.has(p.supplierName)) {
            supplierIdMap.set(p.supplierName, p.supplierId);
        }
    }
    const presentNames = Array.from(supplierIdMap.keys());
    const sortedSuppliers = sortSupplierNames(presentNames, supplierIdMap);

    // ── Critères dynamiques ───────────────────────────────────────────────────
    // Dérive les groupes de critères directement depuis les specs des articles présents
    const criteriaGroupsMap = new Map<string, Set<string>>();
    for (const p of parts ?? []) {
        for (const s of p.specs) {
            const values = criteriaGroupsMap.get(s.criteriaName) ?? new Set<string>();
            values.add(s.criteriaValue);
            criteriaGroupsMap.set(s.criteriaName, values);
        }
    }
    // Ne garder que les groupes avec >1 valeur distincte (filtrer serait inutile sinon)
    // Trier par nombre de valeurs descendant, limiter à MAX_CRITERIA_GROUPS
    const criteriaGroups = [...criteriaGroupsMap.entries()]
        .filter(([, values]) => values.size > 1)
        .sort((a, b) => b[1].size - a[1].size)
        .slice(0, MAX_CRITERIA_GROUPS);

    const hasActiveFilter =
        activeSuppliers.size > 0 ||
        Object.values(activeCriteria).some((s) => s.size > 0);

    return (
        <aside className="flex flex-col rounded-lg border border-stroke bg-card p-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3">
                <h2 className="font-heading text-base font-bold text-navy">Filtres</h2>
                {hasActiveFilter && (
                    <button
                        onClick={onReset}
                        className="text-sm font-medium text-royal hover:text-royal-hover"
                    >
                        Réinitialiser
                    </button>
                )}
            </div>

            {/* Section Fournisseur */}
            <FilterSection title="Fournisseur" first>
                {sortedSuppliers.length === 0 ? (
                    <p className="py-1.5 text-sm italic text-txt2">
                        {parts === undefined ? "Chargement…" : "Aucun fournisseur"}
                    </p>
                ) : (
                    sortedSuppliers.map((name) => {
                        const isChecked = activeSuppliers.has(name);
                        const count = (parts ?? []).filter((p) => p.supplierName === name).length;
                        return (
                            <CheckRow
                                key={name}
                                label={name}
                                count={count}
                                checked={isChecked}
                                onToggle={() => onToggleSupplier(name)}
                            />
                        );
                    })
                )}
            </FilterSection>

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
                const shown = sortedValues.slice(0, MAX_VALUES_SHOWN);

                return (
                    <FilterSection key={criteriaName} title={criteriaName}>
                        {shown.map((value) => {
                            const count = (parts ?? []).filter((p) =>
                                p.specs.some(
                                    (s) => s.criteriaName === criteriaName && s.criteriaValue === value
                                )
                            ).length;
                            return (
                                <CheckRow
                                    key={value}
                                    label={value}
                                    count={count}
                                    checked={active.has(value)}
                                    onToggle={() => onToggleCriteria(criteriaName, value)}
                                />
                            );
                        })}
                    </FilterSection>
                );
            })}
        </aside>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterSection({
    title,
    first = false,
    children,
}: {
    title: string;
    first?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className={cn("flex flex-col py-3", !first && "border-t border-stroke")}>
            <p className="mb-1 font-heading text-sm font-semibold text-navy">{title}</p>
            {children}
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
            className="flex w-full items-center gap-2.5 rounded-md px-1 py-2 text-sm text-navy transition-colors hover:bg-muted"
        >
            <span
                className={cn(
                    "flex size-4 flex-none items-center justify-center rounded-sm border",
                    checked ? "border-navy bg-navy text-white" : "border-stroke bg-white"
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
