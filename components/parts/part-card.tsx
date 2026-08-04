"use client";

import { ArrowRightIcon, CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PartItem } from "@/hooks/parts/use-parts";

interface PartCardProps {
    part: PartItem;
    onDetail: (articleId: number) => void;
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

function formatPrice(value: number): string {
    return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function PartCard({ part, onDetail }: PartCardProps) {
    const hasDiscount = part.priceBase !== null && part.priceNet !== null && part.priceBase > part.priceNet;

    return (
        <article className="flex w-full flex-col gap-y-4 rounded-lg border border-stroke bg-card p-4 sm:flex-row sm:items-start sm:justify-between sm:py-4 sm:pr-5 sm:pl-4">
            {/* Marque + image + stock */}
            <div className="flex w-full shrink-0 flex-col items-center gap-3 sm:w-27.5">
                <div className="font-heading text-base font-bold text-navy">
                    {part.supplierName ?? "—"}
                </div>
                <div className="flex size-21.25 items-center justify-center rounded bg-ink-50">
                    {part.s3image ? (
                        <img
                            src={part.s3image}
                            alt={part.articleProductName}
                            className="max-h-full max-w-full object-contain"
                            onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                        />
                    ) : (
                        <BrakeIcon />
                    )}
                </div>
                {part.stockLabel && (
                    <span
                        className={cn(
                            "flex items-center gap-1.5 text-xs font-semibold",
                            part.inStock ? "text-leaf" : "text-txt2"
                        )}
                    >
                        {part.inStock ? (
                            <CheckCircle2Icon className="size-3.5" />
                        ) : (
                            <XCircleIcon className="size-3.5" />
                        )}
                        {part.stockLabel}
                    </span>
                )}
            </div>

            {/* Titre + specs, séparé par un trait vertical */}
            <div className="w-full min-w-0 flex-1 border-stroke sm:border-l sm:pl-5 sm:pr-6">
                <div className="font-heading text-lg font-bold leading-tight text-navy">
                    {part.articleProductName}
                </div>
                <div className="mt-0.5 mb-3.5 font-heading text-sm font-medium text-navy">
                    Réf : {part.articleNo}
                </div>

                {part.specs.length > 0 && (
                    <>
                        <div className="mb-2 flex items-center gap-3 font-heading text-sm font-semibold text-navy after:h-px after:flex-1 after:bg-stroke after:content-['']">
                            Caractéristiques
                        </div>
                        <dl className="flex flex-col">
                            {part.specs.map((s, idx) => (
                                <div
                                    key={`${s.criteriaName}-${s.criteriaValue}-${idx}`}
                                    className="flex items-baseline justify-between gap-3 border-b border-stroke/60 py-1.5 text-sm"
                                >
                                    <dt className="font-bold text-navy">{s.criteriaName}</dt>
                                    <dd className="text-right text-txt2">{s.criteriaValue}</dd>
                                </div>
                            ))}
                        </dl>
                    </>
                )}
            </div>

            {/* Prix + action */}
            <div className="flex w-full shrink-0 flex-row items-center justify-between gap-4 border-t border-stroke pt-4 sm:w-47.5 sm:flex-col sm:items-end sm:border-l sm:border-t-0 sm:pt-0 sm:pl-4 sm:text-right">
                <div className="flex flex-col items-end gap-0.5">
                    {hasDiscount && part.priceBase !== null && (
                        <div className="flex items-center gap-2 text-sm text-txt2">
                            <span className="line-through">{formatPrice(part.priceBase)} €</span>
                            {part.discountLabel && (
                                <span className="rounded bg-flame px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
                                    {part.discountLabel}
                                </span>
                            )}
                        </div>
                    )}

                    {part.priceNet !== null ? (
                        <>
                            <span className="text-xs text-txt2">Prix unitaire</span>
                            <span className="font-heading text-[28px] font-semibold leading-none text-navy">
                                {formatPrice(part.priceNet)} €
                            </span>
                        </>
                    ) : (
                        <span className="text-sm text-txt2">Prix sur devis</span>
                    )}
                </div>

                <button
                    id={`part-detail-${part.articleId}`}
                    onClick={() => onDetail(part.articleId)}
                    className={cn(
                        "flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md bg-royal",
                        "px-4 font-heading text-sm font-bold text-white",
                        "transition-colors hover:bg-royal-hover",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        "w-auto sm:w-full"
                    )}
                >
                    Voir le détail
                    <ArrowRightIcon className="size-4" />
                </button>
            </div>
        </article>
    );
}
