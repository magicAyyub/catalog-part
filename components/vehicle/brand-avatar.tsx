import { getBrandColorClass, getBrandInitial } from "@/lib/vehicle/brand-avatar";
import { cn } from "@/lib/utils";

interface BrandAvatarProps {
    name: string;
    size?: number;
    className?: string;
}

export function BrandAvatar({ name, size = 16, className }: BrandAvatarProps) {
    return (
        <span
            className={cn(
                "flex shrink-0 items-center justify-center rounded-xs font-medium text-white",
                getBrandColorClass(name),
                className
            )}
            style={{ width: size, height: size, fontSize: size * 0.6 }}
            aria-hidden
        >
            {getBrandInitial(name)}
        </span>
    );
}