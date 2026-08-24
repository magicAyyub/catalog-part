import { cn } from "@/lib/utils";

/** Loader "roue" — clin d'œil au métier (pneus). Tourne via `animate-spin`,
 *  s'arrête pour les utilisateurs qui ont désactivé les animations. */
export function WheelSpinner({ className }: { className?: string }) {
    return (
        <svg
            className={cn("animate-spin text-ink motion-reduce:animate-none", className)}
            viewBox="0 0 64 64"
            aria-hidden="true"
        >
            <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="none" />
            <circle cx="32" cy="32" r="22" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.4" />
            <circle cx="32" cy="32" r="6" fill="currentColor" />
            {[0, 60, 120, 180, 240, 300].map((a) => (
                <line
                    key={a}
                    x1="32"
                    y1="32"
                    x2="32"
                    y2="10"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    transform={`rotate(${a} 32 32)`}
                />
            ))}
        </svg>
    );
}

/** Barre de progression indéterminée — jamais présentée comme une vraie progression. */
export function IndeterminateBar() {
    return (
        <div
            role="progressbar"
            aria-label="Progression indéterminée"
            className="h-1.5 w-full max-w-100 overflow-hidden rounded-full bg-ink-100"
        >
            <div
                className="h-full w-1/3 rounded-full bg-pine motion-reduce:w-full motion-reduce:animate-none motion-reduce:bg-pine/40"
                style={{ animation: "buffer-slide 1.4s ease-in-out infinite" }}
            />
        </div>
    );
}
