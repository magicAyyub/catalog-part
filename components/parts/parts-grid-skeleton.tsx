import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PartsGridSkeleton({ count = 6 }: { count?: number }) {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: count }).map((_, i) => (
                <Card key={i} className="flex flex-col justify-between overflow-hidden border-border/60 shadow-xs">
                    <CardHeader className="gap-2 p-4 pb-2">
                        <div className="flex items-center justify-between">
                            <Skeleton className="h-4 w-1/3 rounded" />
                            <Skeleton className="h-4 w-1/4 rounded bg-primary/10" />
                        </div>
                        <Skeleton className="h-5 w-3/4 rounded" />
                        <Skeleton className="h-3.5 w-1/2 rounded" />
                    </CardHeader>

                    <CardContent className="flex flex-col gap-3 p-4 pt-2">
                        <Skeleton className="aspect-video w-full rounded-md" />
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            <Skeleton className="h-3.5 w-16 rounded" />
                            <Skeleton className="h-3.5 w-20 rounded" />
                            <Skeleton className="h-3.5 w-14 rounded" />
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-border/40">
                            <Skeleton className="h-4 w-24 rounded" />
                            <Skeleton className="h-9 w-28 rounded-lg" />
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
