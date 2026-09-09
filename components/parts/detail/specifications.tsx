function groupSpecs(specs: { criteriaName: string; criteriaValue: string }[]): [string, string[]][] {
    const grouped = new Map<string, string[]>();
    for (const spec of specs) {
        const list = grouped.get(spec.criteriaName) ?? [];
        list.push(spec.criteriaValue);
        grouped.set(spec.criteriaName, list);
    }
    return [...grouped.entries()];
}

/** The main content of a reference, so it comes first and reads as a table. */
export function Specifications({
    specs,
}: {
    specs: { criteriaName: string; criteriaValue: string }[];
}) {
    if (specs.length === 0) return null;

    const grouped = groupSpecs(specs);

    return (
        <section id="specifications">
            <h2 className="mb-3 font-heading text-base font-bold text-ink">Spécifications</h2>
            <div className="overflow-hidden rounded-lg border border-stroke">
                <table className="w-full text-sm">
                    <tbody>
                        {grouped.map(([name, values], i) => (
                            <tr key={i} className="border-b border-stroke/60 last:border-b-0 even:bg-muted/20">
                                <th
                                    scope="row"
                                    className="w-1/2 px-4 py-2.5 text-left font-medium text-txt2 align-top"
                                >
                                    {name}
                                </th>
                                <td className="px-4 py-2.5 text-foreground">
                                    {values.length === 1 ? (
                                        values[0]
                                    ) : (
                                        <ul className="flex flex-col gap-1 list-disc list-inside">
                                            {values.map((val, idx) => (
                                                <li key={idx}>{val}</li>
                                            ))}
                                        </ul>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
