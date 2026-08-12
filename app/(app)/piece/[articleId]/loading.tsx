import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while the server assembles the reference.
 *
 * The drawer had a skeleton because it fetched from the client; the page
 * renders on the server, so without this boundary the browser stayed on the
 * catalog with nothing moving. On a reference whose details are not cached yet,
 * that wait carries a RapidAPI call and lasts seconds.
 */
export default function Loading() {
    return (
        <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
            <Skeleton className="mb-6 h-5 w-40" />

            <div className="mb-8 flex flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-96 max-w-full" />
                <Skeleton className="h-4 w-40" />
            </div>

            <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
                <div className="flex flex-col gap-3">
                    <Skeleton className="h-80 w-full rounded-xl" />
                    <div className="flex gap-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="size-12 rounded-lg" />
                        ))}
                    </div>
                </div>

                <div className="flex flex-col gap-8">
                    <div className="grid grid-cols-2 gap-4">
                        <Skeleton className="h-10" />
                        <Skeleton className="h-10" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-24 w-full" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-40 w-full" />
                    </div>
                </div>
            </div>
        </main>
    );
}
