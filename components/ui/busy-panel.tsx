import { WheelSpinner, IndeterminateBar } from "@/components/ui/wheel-spinner";

/**
 * Panneau de chargement épuré et rassurant pour les agents de comptoir.
 */
export function BusyPanel({
    title = "Recherche en cours...",
    description = "Veuillez patienter un instant.",
}: {
    title?: string;
    description?: string;
}) {
    return (
        <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className="flex flex-col items-center gap-4 rounded-xl border border-stroke bg-card py-8 px-6 shadow-sm"
        >
            <WheelSpinner className="size-10" />
            <div className="flex flex-col items-center gap-1 text-center">
                <p className="font-heading text-base font-semibold text-ink">{title}</p>
                {description && (
                    <p className="max-w-md text-sm text-txt2">{description}</p>
                )}
            </div>
            <IndeterminateBar />
        </div>
    );
}
