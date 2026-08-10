import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
    title: "Connexion · Catalogue Jumbo Pneus",
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
                <div className="mb-6 text-center">
                    <h1 className="font-heading text-xl font-bold text-navy">Espace franchisé</h1>
                    <p className="mt-1 text-sm text-txt2">
                        Catalogue freinage réservé aux franchisés Jumbo Pneus.
                    </p>
                </div>
                <LoginForm next={target} />
            </div>
        </main>
    );
}
