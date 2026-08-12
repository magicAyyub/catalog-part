"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Shown when an image fails to load, rather than a broken frame. */
function BrakeIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.8"
            className="size-16 text-muted-foreground/20"
        >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M19.07 4.93l-2.83 2.83M7.76 16.24l-2.83 2.83" />
        </svg>
    );
}

interface ArticleGalleryProps {
    images: string[];
    alt: string;
}

export function ArticleGallery({ images, alt }: ArticleGalleryProps) {
    const [activeImage, setActiveImage] = useState<string | null>(images[0] ?? null);

    if (!activeImage) return null;

    return (
        <div className="flex flex-col gap-3">
            <div className="relative flex h-80 w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/20">
                <img
                    src={activeImage}
                    alt={alt}
                    className="h-full w-full object-contain p-4 transition-all duration-300"
                    onError={(e) => {
                        const el = e.currentTarget as HTMLImageElement;
                        el.style.display = "none";
                        (el.nextSibling as HTMLElement | null)?.classList.remove("hidden");
                    }}
                />
                <div className="hidden flex-col items-center gap-1 text-muted-foreground/30">
                    <BrakeIcon />
                </div>
            </div>

            {images.length > 1 && (
                <div className="flex flex-wrap gap-2">
                    {images.map((imgUrl, idx) => {
                        const isActive = imgUrl === activeImage;
                        return (
                            <button
                                key={idx}
                                onClick={() => setActiveImage(imgUrl)}
                                className={cn(
                                    "relative size-12 overflow-hidden rounded-lg border bg-muted/10 p-1 transition-all",
                                    isActive
                                        ? "border-primary ring-2 ring-primary/20"
                                        : "border-border hover:border-primary/40 hover:bg-muted/30"
                                )}
                                aria-label={`Afficher l'image ${idx + 1}`}
                            >
                                <img
                                    src={imgUrl}
                                    alt=""
                                    className="h-full w-full object-contain"
                                    onError={(e) => {
                                        const btn = (e.currentTarget as HTMLImageElement)
                                            .parentElement as HTMLButtonElement;
                                        if (btn) btn.style.display = "none";
                                    }}
                                />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
