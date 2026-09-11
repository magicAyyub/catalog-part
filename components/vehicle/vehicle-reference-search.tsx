"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function VehicleReferenceSearch() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [query, setQuery] = useState(() => searchParams.get("ref") ?? "");
    const [error, setError] = useState<string | null>(null);

    function handleSearch(e?: React.FormEvent) {
        e?.preventDefault();
        const trimmed = query.trim();

        if (trimmed.length < 3) {
            setError("Veuillez saisir au moins 3 caractères.");
            return;
        }

        setError(null);
        // Soumission directe vers la grille du catalogue avec le paramètre ?ref=...
        const params = new URLSearchParams(searchParams.toString());
        params.set("ref", trimmed);
        params.delete("page"); // Réinitialiser à la page 1
        router.push(`/?${params.toString()}`);
    }

    function handleClear() {
        setQuery("");
        setError(null);
        const params = new URLSearchParams(searchParams.toString());
        params.delete("ref");
        params.delete("page");
        router.push(params.toString() ? `/?${params.toString()}` : "/");
    }

    return (
        <div className="flex flex-col gap-2 w-full">
            <form onSubmit={handleSearch} className="flex items-stretch gap-2.5 w-full">
                <div className="relative flex flex-1 items-center rounded-md border-2 border-transparent bg-white p-1 shadow-sm transition-colors focus-within:border-pine">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            if (error) setError(null);
                        }}
                        placeholder="Référence de la pièce…"
                        aria-label="Référence pièce"
                        className="w-full bg-transparent px-3 font-mono text-sm sm:text-base font-semibold text-ink placeholder:text-txt2/60 focus:outline-none"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={handleClear}
                            className="mr-2 rounded p-1 text-txt2 hover:text-ink transition-colors cursor-pointer"
                            title="Effacer"
                        >
                            <X className="size-4" />
                        </button>
                    )}
                </div>

                <Button
                    type="submit"
                    disabled={!query.trim()}
                    className="h-12 shrink-0 bg-pine px-4 sm:px-6 font-heading font-bold text-white hover:bg-pine-hover transition-colors cursor-pointer"
                >
                    Rechercher
                </Button>
            </form>

            <span className="text-[11px] font-medium text-white/75">
                Exemples : EP0849, 2370802, DF4183 ou 0 986 479 042
            </span>

            {error && (
                <div className="rounded-md bg-white/10 p-2.5 text-xs font-medium text-white">
                    {error}
                </div>
            )}
        </div>
    );
}
