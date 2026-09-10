"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search, X, Loader2, ArrowRight } from "lucide-react";
import { isEtfSupplier } from "@/lib/parts/suppliers";

interface SearchResultItem {
    articleId: number;
    articleNo: string;
    articleProductName: string;
    supplierId: number;
    supplierName: string | null;
    s3image: string | null;
    specs: { criteriaName: string; criteriaValue: string }[];
}

interface SearchModalProps {
    trigger?: React.ReactNode;
}

export function SearchModal({ trigger }: SearchModalProps = {}) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResultItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);

    function openModal() {
        setIsOpen(true);
    }

    function closeModal() {
        setIsOpen(false);
        setQuery("");
        setResults([]);
        setError(null);
    }

    // Verrouillage du défilement de la page lorsque la modale est ouverte
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    // Raccourci clavier Cmd+K / Ctrl+K
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setIsOpen((open) => {
                    if (open) {
                        setQuery("");
                        setResults([]);
                        setError(null);
                    }
                    return !open;
                });
            } else if (e.key === "Escape" && isOpen) {
                closeModal();
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen]);

    // Focus automatique à l'ouverture
    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => inputRef.current?.focus(), 50);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    // Recherche avec temporisation de 300ms
    useEffect(() => {
        const trimmed = query.trim();
        if (trimmed.length < 3) return;

        const timer = setTimeout(async () => {
            setIsLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/parts/search?q=${encodeURIComponent(trimmed)}&limit=15`);
                if (!res.ok) throw new Error("Erreur de recherche");
                const data = (await res.json()) as SearchResultItem[];
                setResults(data);
            } catch {
                setError("Impossible d'effectuer la recherche.");
            } finally {
                setIsLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    function handleSelectResult(articleId: number) {
        closeModal();
        router.push(`/piece/${articleId}`);
    }

    const effectiveResults = query.trim().length >= 3 ? results : [];

    return (
        <>
            {/* Déclencheur personnalisé ou bouton par défaut dans le Header */}
            {trigger ? (
                <div onClick={openModal} className="w-full cursor-pointer">
                    {trigger}
                </div>
            ) : (
                <button
                    type="button"
                    onClick={openModal}
                    className="group flex w-full items-center justify-between gap-2.5 rounded-lg border border-stroke bg-muted/40 px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-txt2 transition-all hover:border-pine hover:bg-white hover:text-ink focus:outline-none focus:ring-2 focus:ring-pine/30 shadow-2xs cursor-pointer"
                    title="Rechercher par référence fabricant, EAN, WVA ou OE"
                >
                    <div className="flex items-center gap-2 min-w-0 truncate">
                        <Search className="size-4 shrink-0 text-pine transition-transform group-hover:scale-110" />
                        <span className="truncate font-medium text-txt2 group-hover:text-ink text-xs sm:text-sm">
                            <span className="inline sm:hidden">Rechercher réf...</span>
                            <span className="hidden sm:inline">Rechercher une référence, EAN, OE…</span>
                        </span>
                    </div>
                    <kbd className="hidden md:inline-flex items-center rounded border border-stroke bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-txt2 shadow-2xs">
                        Ctrl K
                    </kbd>
                </button>
            )}

            {/* Modale overlay téléportée au root body avec Portal */}
            {isOpen && typeof document !== "undefined" && createPortal(
                <div
                    onClick={closeModal}
                    className="fixed inset-0 z-[100] flex items-start justify-center pt-3 sm:pt-16 px-3 sm:px-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150 overflow-y-auto"
                >
                    <div
                        className="relative flex w-full max-w-2xl flex-col rounded-xl border border-stroke bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 my-auto sm:my-0"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* En-tête de saisie */}
                        <div className="flex items-center border-b border-stroke px-3 sm:px-4 py-3">
                            <Search className="size-5 shrink-0 text-pine mr-2.5" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Référence fabricant, Code EAN, Numéro WVA..."
                                className="w-full bg-transparent text-sm sm:text-base text-ink placeholder:text-txt2 focus:outline-none font-medium"
                            />
                            {isLoading ? (
                                <Loader2 className="size-5 shrink-0 animate-spin text-pine ml-2" />
                            ) : query ? (
                                <button
                                    type="button"
                                    onClick={() => setQuery("")}
                                    className="rounded p-1 text-txt2 hover:text-ink mr-1"
                                >
                                    <X className="size-4" />
                                </button>
                            ) : null}
                            <button
                                type="button"
                                onClick={closeModal}
                                className="ml-1 sm:ml-2 flex items-center justify-center rounded-md border border-stroke px-2 py-1 text-xs font-semibold text-txt2 hover:bg-muted"
                                title="Fermer la recherche"
                            >
                                <span className="hidden sm:inline">Esc</span>
                                <X className="sm:hidden size-4 text-ink" />
                            </button>
                        </div>

                        {/* Corps des résultats */}
                        <div className="max-h-[70vh] sm:max-h-[60vh] overflow-y-auto p-3 sm:p-4">
                            {query.trim().length < 3 ? (
                                <div className="py-8 text-center text-xs text-txt2">
                                    Saisissez au moins <strong className="text-ink font-semibold">3 caractères</strong> pour lancer la recherche par référence fabricant, EAN ou WVA.
                                </div>
                            ) : isLoading ? (
                                <div className="py-12 flex items-center justify-center gap-2 text-sm text-txt2">
                                    <Loader2 className="size-4 animate-spin text-pine" />
                                    Recherche dans le catalogue…
                                </div>
                            ) : error ? (
                                <div className="py-8 text-center text-xs text-destructive">{error}</div>
                            ) : effectiveResults.length === 0 ? (
                                <div className="py-8 px-4 text-center">
                                    <p className="text-sm font-semibold text-ink">Aucun résultat trouvé pour « {query} »</p>
                                    <p className="mt-2 text-xs text-txt2 max-w-md mx-auto leading-relaxed">
                                        Types de références acceptés : <strong>Référence fabricant</strong> (ex: <code>0 986 424 021</code>), <strong>Code EAN</strong> (ex: <code>4047026182927</code>), ou <strong>Numéro WVA</strong> (ex: <code>22525</code>).
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-txt2 mb-1">
                                        {effectiveResults.length} résultat{effectiveResults.length > 1 ? "s" : ""} trouvé{effectiveResults.length > 1 ? "s" : ""}
                                    </div>
                                    {effectiveResults.map((item) => {
                                        const isEtf = isEtfSupplier(item.supplierId, item.supplierName);
                                        return (
                                            <button
                                                key={item.articleId}
                                                type="button"
                                                onClick={() => handleSelectResult(item.articleId)}
                                                className="group flex items-center gap-3 sm:gap-4 rounded-lg border border-stroke bg-card p-3 text-left transition-all hover:border-pine hover:shadow-xs hover:bg-muted/40"
                                            >
                                                <div className="flex size-12 sm:size-14 shrink-0 items-center justify-center rounded border border-stroke bg-white p-1">
                                                    {item.s3image ? (
                                                        /* eslint-disable-next-line @next/next/no-img-element */
                                                        <img
                                                            src={item.s3image}
                                                            alt={item.articleProductName}
                                                            className="size-full object-contain"
                                                        />
                                                    ) : (
                                                        <Search className="size-5 text-txt2/50" />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-heading text-xs font-bold text-ink">
                                                            {item.supplierName ?? "—"}
                                                        </span>
                                                        {isEtf && (
                                                            <span className="rounded bg-pine px-1.5 py-0.2 font-heading text-[9px] font-bold text-white uppercase">
                                                                ETF
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h4 className="font-heading text-sm font-bold text-ink truncate">
                                                        {item.articleProductName}
                                                    </h4>
                                                    <p className="font-mono text-xs text-txt2">
                                                        Réf : <span className="font-semibold text-ink">{item.articleNo}</span>
                                                    </p>
                                                </div>
                                                <ArrowRight className="size-4 text-txt2 opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-pine" />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
