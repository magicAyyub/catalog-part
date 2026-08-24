/**
 * Rapproche un libellé de fournisseur d'une entrée du référentiel TecDoc.
 *
 * Les règles viennent de `parked/plate/ktype-resolver.ts`, où elles décidaient
 * quels appels facturés acheter. Ici elles ne font que préremplir un champ que
 * le comptoir a sous les yeux et peut corriger, alors la règle s'inverse : un
 * seul candidat au meilleur palier, sinon rien. Un préremplissage plausible et
 * faux ne serait jamais vérifié.
 */

interface Named {
    name: string;
}

/** Ordre de préférence. Un palier plus bas gagne toujours. */
const enum Tier {
    Exact = 0,
    Alias = 1,
    Compact = 2,
    Prefix = 3,
}

export function normalizeLabel(value: string): string {
    return value
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, " ")
        .trim();
}

/** Sans séparateurs, pour que `M.G.` et `MG` se comparent. */
function compactLabel(value: string): string {
    return normalizeLabel(value).replace(/ /g, "");
}

/**
 * Écarts de nommage qu'aucune règle générale ne rattrape.
 *
 * Mesuré sur les 698 constructeurs du référentiel. `ALFA`, `DS` et `CITROEN`
 * n'ont pas besoin d'alias, les paliers préfixe et diacritiques suffisent.
 * `MERCEDES` et `LAND` en ont besoin : leurs déclinaisons régionales sont trop
 * nombreuses au palier préfixe pour qu'un gagnant s'en dégage, et sans alias
 * la règle stricte refuse de préremplir. Elle grandit par constat.
 */
const BRAND_ALIASES: Record<string, string[]> = {
    VW: ["VOLKSWAGEN"],
    VOLKSWAGEN: ["VW"],
    MERCEDES: ["MERCEDES-BENZ"],
    LAND: ["LAND ROVER"],
};

/** Rend l'unique gagnant du meilleur palier, ou null si zéro ou plusieurs. */
function uniqueWinner<T>(items: T[], tierOf: (item: T) => Tier | null): T | null {
    let best: Tier | null = null;
    let winners: T[] = [];

    for (const item of items) {
        const tier = tierOf(item);
        if (tier === null) continue;

        if (best === null || tier < best) {
            best = tier;
            winners = [item];
        } else if (tier === best) {
            winners.push(item);
        }
    }

    return winners.length === 1 ? winners[0] : null;
}

export function matchManufacturer<T extends Named>(list: T[], brand: string): T | null {
    const target = normalizeLabel(brand);
    if (!target) return null;

    const compact = compactLabel(brand);
    const aliases = new Set((BRAND_ALIASES[target] ?? []).map(normalizeLabel));

    return uniqueWinner(list, (item) => {
        const label = normalizeLabel(item.name);
        if (label === target) return Tier.Exact;
        if (aliases.has(label)) return Tier.Alias;

        const packed = compactLabel(item.name);
        if (packed === compact) return Tier.Compact;
        // Le libellé TecDoc commence par celui du fournisseur, "MERCEDES" donnant
        // "MERCEDES-BENZ". Jamais l'inverse, ce serait trop permissif.
        if (packed.startsWith(compact)) return Tier.Prefix;

        return null;
    });
}

export function matchModel<T extends Named>(list: T[], modelLabel: string): T | null {
    const target = normalizeLabel(modelLabel);
    if (!target) return null;

    return uniqueWinner(list, (item) => {
        const label = normalizeLabel(item.name);
        if (label === target) return Tier.Exact;
        if (label.startsWith(target) || target.startsWith(label)) return Tier.Prefix;
        return null;
    });
}
