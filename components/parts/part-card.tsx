"use client";

import Link from "next/link";

import { ArrowRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PartItem, PartSpec } from "@/hooks/parts/use-parts";

/**
 * Regroupe les caractéristiques par libellé.
 *
 * TecDoc répète le même libellé pour un critère multivalué, comme les
 * références d'accessoires recommandés. Les laisser à plat noie les dimensions,
 * qui sont ce qu'on lit au comptoir.
 */
function groupSpecs(specs: PartSpec[]): [string, string[]][] {
    const grouped = new Map<string, string[]>();
    for (const spec of specs) {
        grouped.set(spec.criteriaName, [
            ...(grouped.get(spec.criteriaName) ?? []),
            spec.criteriaValue,
        ]);
    }
    return [...grouped.entries()];
}

/** Critères affichés d'emblée. Au-delà, la carte d'une liste devient illisible. */
const VISIBLE_SPECS = 6;

interface PartCardProps {
    part: PartItem;
    /** Adresse de la fiche, construite par la section avec l'état du catalogue. */
    detailHref: string;
}

function BrakeIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.8"
            className="size-10 text-ink-300"
        >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M19.07 4.93l-2.83 2.83M7.76 16.24l-2.83 2.83" />
        </svg>
    );
}

function SpecRow({ name, values }: { name: string; values: string[] }) {
    if (values.length === 1) {
        return (
            <div className="flex items-baseline justify-between gap-3 border-b border-stroke/60 py-1 text-sm">
                <span className="font-bold text-ink">{name}</span>
                <span className="text-right tabular-nums text-txt2">{values[0]}</span>
            </div>
        );
    }

    return (
        <details className="group border-b border-stroke/60 text-sm">
            <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 py-1 marker:content-none">
                <span className="font-bold text-ink">{name}</span>
                <span className="text-right text-txt2">
                    {values.length} valeurs
                    <span className="ml-1.5 inline-block transition-transform group-open:rotate-90">›</span>
                </span>
            </summary>
            <ul className="mb-1.5 flex flex-col gap-0.5 pl-3 text-right tabular-nums text-txt2">
                {values.map((value, idx) => (
                    <li key={`${value}-${idx}`}>{value}</li>
                ))}
            </ul>
        </details>
    );
}

export function PartCard({ part, detailHref }: PartCardProps) {
    const specs = groupSpecs(part.specs);
    const shown = specs.slice(0, VISIBLE_SPECS);
    const hidden = specs.slice(VISIBLE_SPECS);

    return (
        <article className="flex w-full flex-col gap-y-4 rounded-lg border border-stroke bg-card p-4 sm:flex-row sm:items-start sm:gap-y-0">
            {/* La photo prime : c'est elle qui fait reconnaître la pièce au comptoir. */}
            <div className="flex size-32 shrink-0 items-center justify-center self-center sm:size-40 sm:self-start">
                {part.s3image ? (
                    <img
                        src={part.s3image}
                        alt={part.articleProductName}
                        className="size-full object-contain"
                        onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                    />
                ) : (
                    <BrakeIcon />
                )}
            </div>

            <div className="w-full min-w-0 flex-1 border-stroke sm:border-l sm:pl-5 sm:pr-6">
                <div className="font-heading text-base font-bold text-ink">
                    {part.supplierName ?? "—"}
                </div>
                <h3 className="font-heading text-lg font-bold leading-tight text-ink">
                    {part.articleProductName}
                </h3>
                <div className="mt-1 mb-3 font-mono text-sm text-txt2">Réf : {part.articleNo}</div>

                {specs.length > 0 && (
                    <div className="flex flex-col">
                        {shown.map(([name, values]) => (
                            <SpecRow key={name} name={name} values={values} />
                        ))}

                        {hidden.length > 0 && (
                            <details className="group">
                                <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1.5 text-sm font-semibold text-pine marker:content-none">
                                    <span className="group-open:hidden">
                                        Voir les {hidden.length} autres caractéristiques
                                    </span>
                                    <span className="hidden group-open:inline">Réduire</span>
                                    <span className="inline-block transition-transform group-open:rotate-90">›</span>
                                </summary>
                                <div className="flex flex-col">
                                    {hidden.map(([name, values]) => (
                                        <SpecRow key={name} name={name} values={values} />
                                    ))}
                                </div>
                            </details>
                        )}
                    </div>
                )}
            </div>

            <div className="flex w-full shrink-0 flex-row items-center justify-between gap-4 border-t border-stroke pt-4 sm:w-47.5 sm:flex-col sm:items-end sm:border-l sm:border-t-0 sm:pt-0 sm:pl-4 sm:text-right">
                <span className="text-sm text-txt2">Prix sur devis</span>

                <Link
                    id={`part-detail-${part.articleId}`}
                    href={detailHref}
                    // Le rendu de la fiche peut porter un appel facturé sur un
                    // article encore froid. Précharger dix cartes achèterait des
                    // articles que personne n'ouvrira.
                    prefetch={false}
                    className={cn(
                        "flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md bg-pine",
                        "px-4 font-heading text-sm font-bold text-white",
                        "transition-colors hover:bg-pine-hover",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        "w-auto sm:w-full"
                    )}
                >
                    Voir le détail
                    <ArrowRightIcon className="size-4" />
                </Link>
            </div>
        </article>
    );
}
