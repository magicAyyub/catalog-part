import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function NotFound() {
    return (
        <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-pine/10 text-pine mb-6">
                <FileQuestion className="size-8" />
            </div>

            <h1 className="font-heading text-3xl font-bold tracking-tight text-ink sm:text-4xl">
                Page introuvable (404)
            </h1>

            <p className="mt-3 text-base text-txt2 max-w-md">
                La page ou la pièce que vous recherchez n&apos;existe pas ou a été déplacée.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <Link
                    href="/"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-pine px-6 font-heading text-sm font-bold text-white transition-colors hover:bg-pine-hover"
                >
                    <ArrowLeft className="size-4" />
                    Retour au catalogue
                </Link>
            </div>
        </main>
    );
}
