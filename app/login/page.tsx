import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
    title: "Connexion",
};

/**
 * Keeps `?next=` to internal paths. `//evil.com` is a valid URL to a browser,
 * so checking the leading slash alone would hand out an open redirect.
 */
function safeRedirectTarget(next: string | undefined): string {
    if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
    return next;
}

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ next?: string }>;
}) {
    const [user, { next }] = await Promise.all([getCurrentUser(), searchParams]);
    const target = safeRedirectTarget(next);

    if (user) redirect(target);

    return (
        <main className="flex min-h-dvh flex-col lg:flex-row">
            {/* Le logo est dessiné pour un fond sombre : ce panneau est son support,
                pas une décoration. */}
            <aside className="flex flex-col justify-between gap-10 bg-pine px-8 py-10 lg:w-2/5 lg:max-w-xl lg:px-12 lg:py-14">
                <Image
                    src="/jumbo-pneus.svg"
                    alt="Jumbo Pneus"
                    width={260}
                    height={48}
                    priority
                    className="h-8 w-auto lg:h-11"
                />
                <p className="max-w-sm font-heading text-2xl leading-snug font-semibold text-white lg:text-3xl">
                    Le catalogue pièces,
                    <br />
                    réservé aux franchisés.
                </p>
                <p className="text-sm text-white/70">
                    Les références compatibles avec le véhicule que vous identifiez, avec leurs
                    caractéristiques techniques.
                </p>
            </aside>

            <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-12">
                <div className="w-full max-w-md">
                    <h1 className="font-heading text-2xl font-bold text-ink">Espace franchisé</h1>
                    <p className="mt-2 mb-10 text-base text-txt2">
                        Connectez-vous pour accéder au catalogue.
                    </p>

                    <LoginForm next={target} />

                    <p className="mt-8 border-t border-stroke pt-6 text-sm text-txt2">
                        Identifiants oubliés ? Contactez l&apos;administrateur du catalogue.
                    </p>
                </div>
            </div>
        </main>
    );
}
