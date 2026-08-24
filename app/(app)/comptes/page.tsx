import type { Metadata } from "next";
import { adminPasswordConfigured, adminUnlocked } from "@/lib/admin/access";
import { UnlockForm } from "@/components/auth/unlock-form";
import { AccountsManager } from "./accounts-manager";

export const metadata: Metadata = {
    title: "Comptes franchisés",
};

export default async function AccountsPage() {
    const unlocked = await adminUnlocked();

    return (
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {unlocked ? (
                <AccountsManager />
            ) : !adminPasswordConfigured() ? (
                <p className="mx-auto max-w-md rounded-xl border border-stroke bg-white p-6 text-center text-sm text-txt2">
                    L&apos;administration est fermée : définissez <code>ADMIN_PASSWORD</code> dans
                    le fichier <code>.env</code> pour l&apos;activer.
                </p>
            ) : (
                <UnlockForm title="Comptes franchisés" submitLabel="Ouvrir la gestion des comptes" />
            )}
        </main>
    );
}
