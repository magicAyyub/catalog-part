/**
 * Fournisseurs prioritaires du catalogue.
 * ETF est toujours affiché en premier s'il est présent dans les résultats.
 * Les autres sont affichés dans cet ordre, puis les fournisseurs non listés à la suite.
 */
export const PRIORITY_SUPPLIERS: { supplierId: number; name: string }[] = [
    { supplierId: 7657, name: "RTF" },
    { supplierId: 161, name: "TRW" },
    { supplierId: 30, name: "BOSCH" },
    { supplierId: 21, name: "VALEO" },
    { supplierId: 39, name: "TEXTAR" },
];

export const PRIORITY_SUPPLIER_IDS = new Set(PRIORITY_SUPPLIERS.map((s) => s.supplierId));

/**
 * Trie les noms de fournisseurs en plaçant les prioritaires en premier (dans l'ordre défini),
 * et exclut ceux qui ne sont pas présents dans les résultats.
 */
export function sortSupplierNames(
    presentNames: string[],
    presentIds: Map<string, number> // nom → supplierId
): string[] {
    const presentSet = new Set(presentNames);

    // Fournisseurs prioritaires présents dans les résultats, dans l'ordre défini
    const priority = PRIORITY_SUPPLIERS
        .filter((s) => {
            // On cherche si un article avec ce supplierId est présent
            for (const [name, id] of presentIds) {
                if (id === s.supplierId && presentSet.has(name)) return true;
            }
            return false;
        })
        .map((s) => {
            // On retourne le nom tel qu'il apparaît dans les résultats
            for (const [name, id] of presentIds) {
                if (id === s.supplierId) return name;
            }
            return s.name;
        });

    // Fournisseurs non prioritaires présents dans les résultats
    const priorityNames = new Set(priority);
    const others = presentNames.filter((n) => !priorityNames.has(n)).sort();

    return [...priority, ...others];
}
