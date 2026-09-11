"use client";

import { Popover } from "@base-ui/react/popover";

interface CascadeGuideProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Élément désigné. */
    anchor: React.RefObject<HTMLElement | null>;
    title: string;
    description: string;
    side?: "top" | "bottom" | "left" | "right";
}

/**
 * Bulle d'apprentissage ancrée sur l'élément à actionner.
 */
export function CascadeGuide({
    open,
    onOpenChange,
    anchor,
    title,
    description,
    side = "bottom",
}: CascadeGuideProps) {
    return (
        <Popover.Root open={open} onOpenChange={onOpenChange} modal={false}>
            <Popover.Portal>
                <Popover.Backdrop className="fixed inset-0 z-[140] bg-ink/60 transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
                <Popover.Positioner
                    anchor={anchor}
                    side={side}
                    align="center"
                    sideOffset={12}
                    className="z-[150]"
                >
                    <Popover.Popup className="max-w-80 rounded-xl bg-white p-4 shadow-2xl border border-stroke transition-all data-[starting-style]:opacity-0 data-[ending-style]:opacity-0">
                        <Popover.Arrow className="data-[side=top]:-bottom-2 data-[side=top]:rotate-180 data-[side=bottom]:-top-2">
                            <svg width="16" height="8" viewBox="0 0 16 8" className="fill-white">
                                <path d="M8 0 L16 8 L0 8 Z" />
                            </svg>
                        </Popover.Arrow>

                        <Popover.Title className="font-heading text-sm font-bold text-ink">
                            {title}
                        </Popover.Title>
                        <Popover.Description className="mt-1 text-xs leading-snug text-txt2">
                            {description}
                        </Popover.Description>

                        <Popover.Close className="mt-3 h-9 w-full rounded-lg bg-pine px-3 font-heading text-xs font-bold text-white transition-colors hover:bg-pine-hover cursor-pointer">
                            J&apos;ai compris
                        </Popover.Close>
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}
