import { WheelSpinner, IndeterminateBar } from "@/components/ui/wheel-spinner";

/**
 * What the screen shows while something slow runs. One shape for every wait, so
 * identifying a plate and synchronising a catalog do not look like two different
 * applications.
 *
 * The bar is indeterminate on purpose: neither step can be reported as a
 * percentage without inventing one.
 */
export function BusyPanel({ title, description }: { title: string; description: string }) {
    return (
        <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className="flex flex-col items-center gap-5 rounded-lg border border-stroke bg-card p-10"
        >
            <WheelSpinner className="size-16" />
            <p className="font-heading text-base font-semibold text-navy">{title}</p>
            <p className="max-w-100 text-center text-sm text-txt2">{description}</p>
            <IndeterminateBar />
        </div>
    );
}
