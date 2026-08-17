/**
 * Which criteria become filters, and how their values are grouped.
 *
 * TecDoc returns around twenty criteria per brake reference. Deriving a filter
 * section from each one produced 19 sections on a single vehicle, most of them
 * dimensions nobody filters on. Only the criteria listed here become filters;
 * the rest stay stored and stay visible on the card and the detail page, which
 * is where a counter reads a dimension before ordering.
 *
 * Brand and category are not criteria: they are the supplier column and the
 * category tabs, already filters of their own.
 */

/** The two categories the catalog covers, in display order. */
export const BRAKE_CATEGORIES = [
    { categoryId: 100030, label: "Plaquettes de frein" },
    { categoryId: 100032, label: "Disques de frein" },
] as const;

export const CATEGORY_IDS = BRAKE_CATEGORIES.map((c) => c.categoryId);

/** Criteria offered as filters, in display order. */
export const FACET_CRITERIA = ["Côté d'assemblage"] as const;

const FACET_CRITERIA_SET: ReadonlySet<string> = new Set(FACET_CRITERIA);

export function isFacetCriteria(criteriaName: string): boolean {
    return FACET_CRITERIA_SET.has(criteriaName);
}

/**
 * Groups values TecDoc words two ways for the same thing. Observed on
 * `Côté d'assemblage`: "Essieu avant" on 33 rows and "avant" on 2, which would
 * otherwise be two checkboxes and a filter that silently drops articles.
 */
export function canonicalCriteriaValue(criteriaName: string, value: string): string {
    if (criteriaName !== "Côté d'assemblage") return value;

    const normalized = value
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();

    if (normalized.includes("avant")) return "Essieu avant";
    if (normalized.includes("arriere")) return "Essieu arrière";
    return value;
}
