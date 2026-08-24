/** The main content of a reference, so it comes first and reads as a table. */
export function Specifications({
    specs,
}: {
    specs: { criteriaName: string; criteriaValue: string }[];
}) {
    if (specs.length === 0) return null;

    return (
        <section id="specifications">
            <h2 className="mb-3 font-heading text-base font-bold text-ink">Spécifications</h2>
            <div className="overflow-hidden rounded-lg border border-stroke">
                <table className="w-full text-sm">
                    <tbody>
                        {specs.map((spec, i) => (
                            <tr key={i} className="border-b border-stroke/60 last:border-b-0 even:bg-muted/20">
                                <th
                                    scope="row"
                                    className="w-1/2 px-4 py-2.5 text-left font-medium text-txt2"
                                >
                                    {spec.criteriaName}
                                </th>
                                <td className="px-4 py-2.5 text-foreground">{spec.criteriaValue}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
