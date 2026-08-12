/**
 * Manufacturer references, folded away by default.
 *
 * A BOSCH pad kit carries 302 of them. Laid flat they filled the page and
 * pushed the specifications, which is what someone at the counter actually
 * reads, below the fold. Grouped by manufacturer and collapsed, they stay
 * available without dominating anything.
 *
 * `details` rather than client state, so the section costs no JavaScript.
 */
export function OemReferences({ refs }: { refs: { oemBrand: string; oemDisplayNo: string }[] }) {
    if (refs.length === 0) return null;

    const byBrand = new Map<string, string[]>();
    for (const ref of refs) {
        const list = byBrand.get(ref.oemBrand) ?? [];
        list.push(ref.oemDisplayNo);
        byBrand.set(ref.oemBrand, list);
    }

    const brands = [...byBrand.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    return (
        <section id="oem">
            <details className="group overflow-hidden rounded-lg border border-stroke">
                <summary className="flex cursor-pointer list-none items-baseline gap-2 px-4 py-3 hover:bg-muted/30">
                    <h2 className="font-heading text-base font-bold text-navy">Références OEM</h2>
                    <span className="text-sm text-txt2">
                        {refs.length} références, {brands.length} constructeurs
                    </span>
                    <span className="ml-auto text-sm text-txt2 group-open:hidden">Afficher</span>
                    <span className="ml-auto hidden text-sm text-txt2 group-open:inline">Masquer</span>
                </summary>

                <div className="max-h-96 overflow-y-auto border-t border-stroke">
                    {brands.map(([brand, numbers]) => (
                        <div
                            key={brand}
                            className="flex flex-col gap-1 border-b border-stroke/60 px-4 py-3 last:border-b-0 sm:flex-row sm:gap-4"
                        >
                            <span className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-txt2">
                                {brand}
                            </span>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-foreground">
                                {numbers.map((no, i) => (
                                    <span key={i}>{no}</span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </details>
        </section>
    );
}
