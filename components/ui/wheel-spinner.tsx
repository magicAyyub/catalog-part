import { cn } from "@/lib/utils";

/** Loader minimaliste et fluide pour l'interface comptoir. */
export function WheelSpinner({ className }: { className?: string }) {
    return (
        <svg
            className={cn("animate-spin text-pine motion-reduce:animate-none", className)}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <circle
                className="opacity-20"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
            />
            <path
                className="opacity-90"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
        </svg>
    );
}

/** Barre de progression indéterminée — discrète et moderne. */
export function IndeterminateBar() {
    return (
        <div
            role="progressbar"
            aria-label="Progression indéterminée"
            className="h-1.5 w-full max-w-72 overflow-hidden rounded-full bg-ink-100"
        >
            <div
                className="h-full w-1/3 rounded-full bg-pine motion-reduce:w-full motion-reduce:animate-none motion-reduce:bg-pine/40"
                style={{ animation: "buffer-slide 1.4s ease-in-out infinite" }}
            />
        </div>
    );
}
