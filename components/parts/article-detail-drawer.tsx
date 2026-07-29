"use client";

import { useState, useEffect, useMemo } from "react";
import { useArticleDetail } from "@/hooks/parts/use-article-detail";
import { useArticleMedia } from "@/hooks/parts/use-article-media";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ApiCompatibleCar } from "@/lib/rapidapi/types";

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

function BrakeIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.8"
            className="size-16 text-muted-foreground/20"
        >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M19.07 4.93l-2.83 2.83M7.76 16.24l-2.83 2.83" />
        </svg>
    );
}

export function ArticleDetailDrawer({ articleId, onClose }: ArticleDetailDrawerProps) {
    const { data: detailData, isLoading: isDetailLoading, isError: isDetailError } = useArticleDetail(articleId);
    const { data: mediaData } = useArticleMedia(articleId);

    const article = detailData?.article;

    // Image active dans le visualiseur
    const [activeImage, setActiveImage] = useState<string | null>(null);

    const [openManufacturers, setOpenManufacturers] = useState<Set<string>>(new Set());
    const [openModels, setOpenModels] = useState<Set<string>>(new Set());

    // Regroupe les voitures compatibles par constructeur puis par modèle
    const groupedCompatibleCars = useMemo(() => {
        if (!article?.compatibleCars) return {};
        const groups: Record<string, Record<string, ApiCompatibleCar[]>> = {};

        for (const car of article.compatibleCars) {
            const manuf = car.manufacturerName;
            const model = car.modelName;

            if (!groups[manuf]) {
                groups[manuf] = {};
            }
            if (!groups[manuf][model]) {
                groups[manuf][model] = [];
            }
            groups[manuf][model].push(car);
        }

        return groups;
    }, [article]);

    function toggleManufacturer(manuf: string) {
        setOpenManufacturers((prev) => {
            const next = new Set(prev);
            next.has(manuf) ? next.delete(manuf) : next.add(manuf);
            return next;
        });
    }

    function toggleModel(modelKey: string) {
        setOpenModels((prev) => {
            const next = new Set(prev);
            next.has(modelKey) ? next.delete(modelKey) : next.add(modelKey);
            return next;
        });
    }

    // Initialise/réinitialise l'image affichée au chargement d'un nouvel article
    useEffect(() => {
        if (article?.s3image) {
            setActiveImage(article.s3image);
        } else {
            setActiveImage(null);
        }
        // Réinitialiser le pliage des accordéons à chaque changement de produit
        setOpenManufacturers(new Set());
        setOpenModels(new Set());
    }, [articleId, article]);

    if (!articleId) return null;

    const isLoading = isDetailLoading;
    const isError = isDetailError;

    // Union de l'image principale et de toutes les images secondaires pour la galerie
    const allImages = Array.from(
        new Set(
            [
                article?.s3image,
                ...(mediaData?.map((m) => m.s3image) ?? []),
            ].filter(Boolean) as string[]
        )
    );

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
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                className="size-10 text-destructive/60"
                                aria-hidden="true"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-sm text-destructive">Impossible de charger le détail.</p>
                        </div>
                    )}

                    {article && (
                        <div className="flex flex-col gap-6">
                            {/* Galerie d'images */}
                            {activeImage && (
                                <div className="flex flex-col gap-3">
                                    {/* Grande image active */}
                                    <div className="relative flex h-64 w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/20">
                                        <img
                                            src={activeImage}
                                            alt={article.articleProductName}
                                            className="h-full w-full object-contain p-4 transition-all duration-300"
                                            onError={(e) => {
                                                const el = e.currentTarget as HTMLImageElement;
                                                el.style.display = "none";
                                                (el.nextSibling as HTMLElement | null)?.classList.remove("hidden");
                                            }}
                                        />
                                        {/* Fallback en arrière-plan (masqué par défaut, révélé si image error) */}
                                        <div className="hidden flex-col items-center gap-1 text-muted-foreground/30">
                                            <BrakeIcon />
                                        </div>
                                    </div>

                                    {/* Liste des miniatures */}
                                    {allImages.length > 1 && (
                                        <div className="flex flex-wrap gap-2">
                                            {allImages.map((imgUrl, idx) => {
                                                const isActive = imgUrl === activeImage;
                                                return (
                                                    <button
                                                        key={idx}
                                                        onClick={() => setActiveImage(imgUrl)}
                                                        className={cn(
                                                            "relative size-12 overflow-hidden rounded-lg border bg-muted/10 p-1 transition-all",
                                                            isActive
                                                                ? "border-primary ring-2 ring-primary/20"
                                                                : "border-border hover:border-primary/40 hover:bg-muted/30"
                                                        )}
                                                        aria-label={`Afficher l'image ${idx + 1}`}
                                                    >
                                                        <img
                                                            src={imgUrl}
                                                            alt=""
                                                            className="h-full w-full object-contain"
                                                            onError={(e) => {
                                                                const btn = (e.currentTarget as HTMLImageElement).parentElement as HTMLButtonElement;
                                                                if (btn) btn.style.display = "none";
                                                            }}
                                                        />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
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
                                <div className="mt-6">
                                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Véhicules compatibles ({article.compatibleCars.length})
                                    </p>
                                    <div className="flex flex-col gap-2">
                                        {Object.entries(groupedCompatibleCars).map(([manuf, modelsMap]) => {
                                            const isManufOpen = openManufacturers.has(manuf);
                                            return (
                                                <div key={manuf} className="rounded-lg border border-border bg-card overflow-hidden">
                                                    {/* En-tête constructeur */}
                                                    <button
                                                        onClick={() => toggleManufacturer(manuf)}
                                                        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
                                                    >
                                                        <span>{manuf}</span>
                                                        <svg
                                                            className={cn("size-4 text-muted-foreground transition-transform duration-200", isManufOpen && "rotate-180")}
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                            strokeWidth="2"
                                                        >
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    </button>

                                                    {/* Liste des modèles */}
                                                    {isManufOpen && (
                                                        <div className="border-t border-border/60 bg-muted/10 divide-y divide-border/40">
                                                            {Object.entries(modelsMap).map(([model, cars]) => {
                                                                const modelKey = `${manuf}_${model}`;
                                                                const isModelOpen = openModels.has(modelKey);
                                                                return (
                                                                    <div key={model} className="flex flex-col">
                                                                        {/* En-tête modèle */}
                                                                        <button
                                                                            onClick={() => toggleModel(modelKey)}
                                                                            className="flex w-full items-center justify-between pl-6 pr-4 py-2.5 text-xs font-medium hover:bg-muted/65 transition-colors text-left"
                                                                        >
                                                                            <span className="text-foreground/90">{model}</span>
                                                                            <svg
                                                                                className={cn("size-3.5 text-muted-foreground/85 transition-transform duration-200", isModelOpen && "rotate-180")}
                                                                                fill="none"
                                                                                viewBox="0 0 24 24"
                                                                                stroke="currentColor"
                                                                                strokeWidth="2"
                                                                            >
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                                                            </svg>
                                                                        </button>

                                                                        {/* Motorisations */}
                                                                        {isModelOpen && (
                                                                            <div className="bg-background border-t border-border/30 pl-8 pr-4 py-2 flex flex-col gap-2 divide-y divide-border/20">
                                                                                {cars.map((car, index) => {
                                                                                    // Formater proprement l'intervalle de dates en MM/AAAA
                                                                                    const formatDate = (dateStr: string) => {
                                                                                        if (!dateStr) return "";
                                                                                        const parts = dateStr.split("-");
                                                                                        if (parts.length < 2) return dateStr;
                                                                                        return `${parts[1]}/${parts[0]}`;
                                                                                    };
                                                                                    const formattedDates = `${formatDate(car.constructionIntervalStart)} - ${car.constructionIntervalEnd ? formatDate(car.constructionIntervalEnd) : "aujourd'hui"}`;
                                                                                    
                                                                                    return (
                                                                                        <div key={index} className="flex items-start gap-2.5 pt-2 first:pt-0 text-xs">
                                                                                            <svg
                                                                                                className="size-3.5 text-green-600 shrink-0 mt-0.5"
                                                                                                xmlns="http://www.w3.org/2000/svg"
                                                                                                fill="none"
                                                                                                viewBox="0 0 24 24"
                                                                                                stroke="currentColor"
                                                                                                strokeWidth="2.5"
                                                                                            >
                                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                                            </svg>
                                                                                            <div className="flex flex-col gap-0.5 min-w-0">
                                                                                                <span className="font-medium text-foreground leading-snug">{car.typeEngineName}</span>
                                                                                                <span className="text-[10px] text-muted-foreground leading-none">{formattedDates}</span>
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}
