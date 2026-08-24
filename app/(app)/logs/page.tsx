import type { Metadata } from "next";
import { adminPasswordConfigured, adminUnlocked } from "@/lib/admin/access";
import { UnlockForm } from "@/components/auth/unlock-form";
import { LogViewer } from "./log-viewer";

export const metadata: Metadata = {
    title: "Trace du système",
};

export default async function LogsPage() {
    const unlocked = await adminUnlocked();

    return (
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {unlocked ? (
                <LogViewer />
            ) : !adminPasswordConfigured() ? (
                <p className="mx-auto max-w-md rounded-xl border border-stroke bg-white p-6 text-center text-sm text-txt2">
                    L&apos;administration est fermée : définissez <code>ADMIN_PASSWORD</code> dans
                    le fichier <code>.env</code> pour l&apos;activer.
                </p>
            ) : (
                <UnlockForm title="Trace du système" submitLabel="Ouvrir la trace" />
            )}
        </main>
    );
}
