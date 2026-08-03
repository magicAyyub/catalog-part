"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/reui/badge";
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
            className="size-14 text-muted-foreground/20"
        >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M19.07 4.93l-2.83 2.83M7.76 16.24l-2.83 2.83" />
        </svg>
    );
}

export function PartCard({ part, onDetail }: PartCardProps) {
    return (
        <article
            className={cn(
                "group flex flex-col overflow-hidden rounded-xl bg-card",
                "ring-1 ring-border transition-all duration-200",
                "hover:ring-primary/50 hover:shadow-md"
            )}
        >
            {/* Zone image */}
            <div className="relative flex h-36 items-center justify-center overflow-hidden bg-muted/30">
                {part.s3image && (
                    <img
                        src={part.s3image}
                        alt={part.articleProductName}
                        className="h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                    />
                )}
                {/* Fallback toujours présent en arrière-plan */}
                <BrakeIcon />

                {/* Badge fournisseur ancré sur l'image */}
                {part.supplierName && (
                    <Badge
                        variant="secondary"
                        size="xs"
                        radius="full"
                        className="absolute top-2 right-2 shadow-sm font-semibold backdrop-blur-sm"
                    >
                        {part.supplierName}
                    </Badge>
                )}
            </div>

            {/* Contenu */}
            <div className="flex flex-1 flex-col gap-2 p-3">
                {/* Nom produit */}
                <h3 className="line-clamp-2 text-sm font-medium leading-snug text-card-foreground">
                    {part.articleProductName}
                </h3>

                {/* Référence */}
                <p className="font-mono text-xs text-muted-foreground">
                    Réf.&nbsp;{part.articleNo}
                </p>

                {/* Specs clés (diamètre, épaisseur…) */}
                {part.specs.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                        {part.specs.slice(0, 3).map((s, idx) => (
                            <span
                                key={`${s.criteriaName}-${s.criteriaValue}-${idx}`}
                                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                title={s.criteriaName}
                            >
                                {s.criteriaValue}
                            </span>
                        ))}
                    </div>
                )}

                {/* CTA */}
                <button
                    id={`part-detail-${part.articleId}`}
                    onClick={() => onDetail(part.articleId)}
                    className={cn(
                        "mt-auto w-full rounded-lg border border-border bg-background",
                        "px-3 py-1.5 text-xs font-medium text-foreground",
                        "transition-all duration-150",
                        "hover:border-primary/60 hover:bg-primary hover:text-primary-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    )}
                >
                    Voir le détail →
                </button>
            </div>
        </article>
    );
}
