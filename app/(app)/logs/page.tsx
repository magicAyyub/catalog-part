import type { Metadata } from "next";
import { logsPasswordConfigured, logsUnlocked } from "@/lib/logs/access";
import { LogViewer } from "./log-viewer";
import { UnlockForm } from "./unlock-form";

export const metadata: Metadata = {
    title: "Trace du système",
};

export default async function LogsPage() {
    const unlocked = await logsUnlocked();

    return (
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {unlocked ? (
                <LogViewer />
            ) : !logsPasswordConfigured() ? (
                <p className="mx-auto max-w-md rounded-xl border border-stroke bg-white p-6 text-center text-sm text-txt2">
                    La trace est fermée : définissez <code>LOGS_PASSWORD</code> dans le fichier
                    <code> .env</code> pour l&apos;activer.
                </p>
            ) : (
                <UnlockForm />
            )}
        </main>
    );
}
