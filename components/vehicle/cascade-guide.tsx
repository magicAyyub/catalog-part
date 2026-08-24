"use client";

import { Popover } from "@base-ui/react/popover";

interface CascadeGuideProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Élément désigné. Il doit être remonté au-dessus du fond assombri. */
    anchor: React.RefObject<HTMLElement | null>;
    title: string;
    description: string;
}

/**
 * Bulle d'apprentissage ancrée sur le champ qu'il reste à remplir.
 *
 * Le fond s'assombrit et seul l'élément désigné reste éclairé, de sorte qu'un
 * comptoir qui n'a jamais vu l'écran comprenne le geste sans qu'on le lui
 * explique deux fois.
 *
 * Non modale : la liste désignée doit rester cliquable, et l'ouvrir vaut avoir
 * compris, donc referme la bulle.
 */
export function CascadeGuide({ open, onOpenChange, anchor, title, description }: CascadeGuideProps) {
    return (
        <Popover.Root open={open} onOpenChange={onOpenChange} modal={false}>
            <Popover.Portal>
                <Popover.Backdrop className="fixed inset-0 z-40 bg-ink/60 transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
                <Popover.Positioner
                    anchor={anchor}
                    side="bottom"
                    align="center"
                    sideOffset={12}
                    className="z-50"
                >
                    <Popover.Popup className="max-w-80 rounded-lg bg-card p-4 shadow-lg transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0">
                        <Popover.Arrow className="data-[side=bottom]:-top-2">
                            <svg width="16" height="8" viewBox="0 0 16 8" className="fill-card">
                                <path d="M8 0 L16 8 L0 8 Z" />
                            </svg>
                        </Popover.Arrow>

                        <Popover.Title className="font-heading text-sm font-bold text-ink">
                            {title}
                        </Popover.Title>
                        <Popover.Description className="mt-1 text-sm leading-snug text-txt2">
                            {description}
                        </Popover.Description>

                        <Popover.Close className="mt-3 h-9 w-full rounded-md bg-pine px-3 font-heading text-sm font-bold text-white transition-colors hover:bg-pine-hover">
                            J&apos;ai compris
                        </Popover.Close>
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}
