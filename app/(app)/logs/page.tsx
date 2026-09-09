import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ShieldAlert } from "lucide-react";
import { LogViewer } from "./log-viewer";

export const metadata: Metadata = {
    title: "Trace du système",
};

export default async function LogsPage() {
    const user = await getCurrentUser();
    if (!user) {
        redirect("/login");
    }

    if (user.role !== "admin") {
        return (
            <main className="mx-auto w-full max-w-md flex-1 px-4 py-12">
                <div className="rounded-xl border border-stroke bg-card p-6 text-center shadow-xs">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-4">
                        <ShieldAlert className="size-6" />
                    </div>
                    <h1 className="font-heading text-lg font-bold text-ink">Accès restreint</h1>
                    <p className="mt-2 text-sm text-txt2">
                        Cette section est réservée aux administrateurs. Veuillez contacter le support si vous pensez qu&apos;il s&apos;agit d&apos;une erreur.
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <LogViewer />
        </main>
    );
}
