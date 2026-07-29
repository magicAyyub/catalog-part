"use client";

import { useArticleDetail } from "@/hooks/parts/use-article-detail";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ArticleDetailDrawerProps {
    articleId: number | null;
    onClose: () => void;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="text-sm text-foreground">{value}</dd>
        </div>
    );
}

export function ArticleDetailDrawer({ articleId, onClose }: ArticleDetailDrawerProps) {
    const { data, isLoading, isError } = useArticleDetail(articleId);
    const article = data?.article;

    if (!articleId) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Drawer */}
            <aside
                className={cn(
                    "fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-background shadow-2xl",
                    "sm:w-120 sm:border-l sm:border-border"
                )}
                role="dialog"
                aria-label="Détail de l'article"
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                    <h2 className="text-base font-semibold text-foreground">
                        {isLoading ? "Chargement…" : (article?.articleProductName ?? "Détail article")}
                    </h2>
                    <button
                        onClick={onClose}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Fermer"
                    >
                        <svg className="size-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Contenu scrollable */}
                <div className="flex-1 overflow-y-auto p-6">
                    {isLoading && (
                        <div className="flex flex-col gap-6">
                            <Skeleton className="aspect-square w-full rounded-xl" />
                            <div className="flex flex-col gap-3">
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-4 w-1/2" />
                                <Skeleton className="h-4 w-2/3" />
                            </div>
                        </div>
                    )}

                    {isError && (
                        <div className="flex flex-col items-center gap-3 py-16 text-center">
                            <span className="text-4xl">⚠️</span>
                            <p className="text-sm text-destructive">Impossible de charger le détail.</p>
                        </div>
                    )}

                    {article && (
                        <div className="flex flex-col gap-6">
                            {/* Image */}
                            {article.s3image && (
                                <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
                                    <img
                                        src={article.s3image}
                                        alt={article.articleProductName}
                                        className="w-full object-contain p-4"
                                        onError={(e) => {
                                            (e.currentTarget as HTMLImageElement).parentElement!.style.display = "none";
                                        }}
                                    />
                                </div>
                            )}

                            {/* Infos principales */}
                            <dl className="grid grid-cols-2 gap-4">
                                <DetailRow label="Référence" value={
                                    <span className="font-mono">{article.articleNo}</span>
                                } />
                                <DetailRow label="Fournisseur" value={article.supplierName} />
                            </dl>

                            {/* Références OEM */}
                            {article.oemNo.length > 0 && (
                                <div>
                                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Références OEM
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {article.oemNo.map((oem, i) => (
                                            <span
                                                key={i}
                                                className="rounded-md bg-secondary px-2 py-1 font-mono text-xs text-secondary-foreground"
                                            >
                                                {oem.oemBrand} | {oem.oemDisplayNo}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* EAN */}
                            {article.eanNo && (
                                <DetailRow
                                    label="Code EAN"
                                    value={<span className="font-mono">{article.eanNo.eanNumbers}</span>}
                                />
                            )}

                            {/* Spécifications */}
                            {article.allSpecifications.length > 0 && (
                                <div>
                                    <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Spécifications
                                    </p>
                                    <dl className="grid grid-cols-2 gap-3">
                                        {article.allSpecifications.map((spec, i) => (
                                            <DetailRow
                                                key={i}
                                                label={spec.criteriaName}
                                                value={spec.criteriaValue}
                                            />
                                        ))}
                                    </dl>
                                </div>
                            )}

                            {/* Véhicules compatibles */}
                            {article.compatibleCars.length > 0 && (
                                <div>
                                    <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Véhicules compatibles ({article.compatibleCars.length})
                                    </p>
                                    <ul className="flex flex-col gap-2">
                                        {article.compatibleCars.slice(0, 10).map((car, i) => (
                                            <li
                                                key={i}
                                                className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs"
                                            >
                                                <span className="font-medium">{car.manufacturerName} {car.modelName}</span>
                                                <span className="ml-2 text-muted-foreground">{car.typeEngineName}</span>
                                            </li>
                                        ))}
                                        {article.compatibleCars.length > 10 && (
                                            <li className="text-center text-xs text-muted-foreground">
                                                +{article.compatibleCars.length - 10} autres véhicules
                                            </li>
                                        )}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}
