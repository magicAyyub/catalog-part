"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Journalisation de l'erreur
        console.error("Erreur d'application capturée:", error);
    }, [error]);

    return (
        <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-6">
                <AlertTriangle className="size-8" />
            </div>

            <h1 className="font-heading text-2xl font-bold text-ink sm:text-3xl">
                Une erreur inattendue est survenue
            </h1>

            <p className="mt-3 text-sm text-txt2 max-w-md">
                Le service rencontre une difficulté temporaire. Vous pouvez réespérer l&apos;action ou retourner à l&apos;accueil du catalogue.
            </p>

            {error.digest && (
                <p className="mt-2 font-mono text-xs text-txt2/60">
                    Code incident : {error.digest}
                </p>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button
                    type="button"
                    onClick={() => reset()}
                    className="flex h-11 items-center gap-2 bg-pine px-6 font-heading font-bold text-white hover:bg-pine-hover"
                >
                    <RefreshCw className="size-4" />
                    Réessayer
                </Button>

                <Link
                    href="/"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-stroke bg-card px-6 font-heading text-sm font-bold text-ink transition-colors hover:bg-muted"
                >
                    <Home className="size-4" />
                    Accueil catalogue
                </Link>
            </div>
        </main>
    );
}
