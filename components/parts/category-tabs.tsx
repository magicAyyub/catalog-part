"use client";

import { cn } from "@/lib/utils";

export const BRAKE_CATEGORIES = [
    { categoryId: 100030, label: "Plaquettes de frein" },
    { categoryId: 100032, label: "Disques de frein" },
] as const;

interface CategoryTabsProps {
    activeCategoryId: number;
    onChange: (categoryId: number) => void;
    counts?: Record<number, number>;
}

function PadIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="size-4"
            aria-hidden="true"
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 9h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 11V8M22 11V8" />
        </svg>
    );
}

function DiscIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="size-4"
            aria-hidden="true"
        >
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="3" />
            <path strokeLinecap="round" d="M12 3v2M12 19v2M3 12h2M19 12h2" />
        </svg>
    );
}

export function CategoryTabs({ activeCategoryId, onChange, counts }: CategoryTabsProps) {
    return (
        <div className="flex gap-2">
            {BRAKE_CATEGORIES.map(({ categoryId, label }) => {
                const isActive = activeCategoryId === categoryId;
                const count = counts?.[categoryId];
                const Icon = categoryId === 100030 ? PadIcon : DiscIcon;

                return (
                    <button
                        key={categoryId}
                        onClick={() => onChange(categoryId)}
                        className={cn(
                            "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all duration-150",
                            isActive
                                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-muted hover:text-foreground"
                        )}
                    >
                        <Icon />
                        <span>{label}</span>
                        {count !== undefined && (
                            <span
                                className={cn(
                                    "rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                                    isActive
                                        ? "bg-primary-foreground/20 text-primary-foreground"
                                        : "bg-muted text-muted-foreground"
                                )}
                            >
                                {count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
