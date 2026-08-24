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
        <main className="flex flex-1 items-center justify-center px-4 py-12">
            <div className="w-full max-w-sm">
                <div className="mb-6 flex flex-col items-center text-center">
                    <span className="mb-5 flex items-center rounded-lg bg-pine px-5 py-3 shadow-sm">
                        <Image
                            src="/jumbo-pneus.svg"
                            alt="Jumbo Pneus"
                            width={200}
                            height={37}
                            priority
                            className="h-8 w-auto"
                        />
                    </span>
                    <h1 className="font-heading text-xl font-bold text-ink">Espace franchisé</h1>
                    <p className="mt-1 text-sm text-txt2">
                        Catalogue freinage réservé aux franchisés Jumbo Pneus.
                    </p>
                </div>
                <LoginForm next={target} />
            </div>
        </main>
    );
}
