"use client";

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
        <aside className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Filtres</h2>
                {hasActiveFilter && (
                    <button
                        onClick={onReset}
                        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                        Réinitialiser
                    </button>
                )}
            </div>

            {/* Section Fournisseur */}
            <FilterSection title="Fournisseur">
                {sortedSuppliers.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground">
                        {parts === undefined ? "Chargement…" : "Aucun fournisseur"}
                    </p>
                ) : (
                    <ul className="flex flex-col gap-0.5">
                        {sortedSuppliers.map((name, idx) => {
                            const isChecked = activeSuppliers.has(name);
                            const count = (parts ?? []).filter((p) => p.supplierName === name).length;
                            return (
                                <CheckboxItem
                                    key={name}
                                    label={name}
                                    count={count}
                                    checked={isChecked}
                                    onChange={() => onToggleSupplier(name)}
                                    separator={idx === 0}
                                />
                            );
                        })}
                    </ul>
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
                        <ul className="flex flex-col gap-0.5">
                            {shown.map((value) => {
                                const count = (parts ?? []).filter((p) =>
                                    p.specs.some(
                                        (s) => s.criteriaName === criteriaName && s.criteriaValue === value
                                    )
                                ).length;
                                return (
                                    <CheckboxItem
                                        key={value}
                                        label={value}
                                        count={count}
                                        checked={active.has(value)}
                                        onChange={() => onToggleCriteria(criteriaName, value)}
                                    />
                                );
                            })}
                        </ul>
                    </FilterSection>
                );
            })}
        </aside>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {title}
            </p>
            {children}
        </div>
    );
}

function CheckboxItem({
    label,
    count,
    checked,
    onChange,
    separator = false,
}: {
    label: string;
    count: number;
    checked: boolean;
    onChange: () => void;
    separator?: boolean;
}) {
    return (
        <li className={cn(separator && "border-b border-border pb-2 mb-1")}>
            <label
                className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors",
                    checked ? "bg-primary/10 font-medium text-foreground" : "hover:bg-muted"
                )}
            >
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={onChange}
                    className="accent-primary"
                />
                <span className="flex-1 truncate">{label}</span>
                <span className="tabular-nums text-xs text-muted-foreground">{count}</span>
            </label>
        </li>
    );
}
