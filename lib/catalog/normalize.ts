/**
 * lib/catalog/normalize.ts
 *
 * Normalisation des marques et des références.
 *
 * C'est la brique la plus modeste et la plus critique du catalogue : elle
 * fabrique la clé qui relie deux mondes qui ne partagent aucun identifiant.
 * TecDoc raisonne en `articleId` numériques ; les portails grossistes ne
 * connaissent qu'un nom de marque et une référence imprimée sur la boîte. Le
 * couple (brandKey, articleNoKey) est le seul pont entre les deux.
 *
 * Une erreur ici ne provoque pas de plantage : elle fait silencieusement rater
 * un rapprochement, donc une pièce affichée sans prix. C'est pour cette raison
 * que les règles sont explicitées et testables une par une plutôt que fondues
 * dans une expression régulière unique.
 *
 * Règles reprises de app-etf, où elles ont été éprouvées en production.
 */

/** Majuscules, espaces internes réduits à un seul. */
export function normalizeBrandRaw(brand: string): string {
    return brand.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Retire le suffixe entre parenthèses ajouté par certains portails.
 * « FERODO (FEDERAL MOGUL) » et « FERODO » doivent se rejoindre.
 */
export function stripParentheticalBrandSuffix(brand: string): string {
    return brand.replace(/\s*\([^)]*\)\s*$/u, "").trim();
}

/**
 * Retire les suffixes de forme juridique ou de groupe.
 * « LPR GROUP », « BREMBO N.V. », « FERODO SA » → « LPR », « BREMBO », « FERODO ».
 * Plusieurs passes, parce que les suffixes se cumulent (« X GROUP CO »).
 */
const CORP_BRAND_SUFFIX_RE =
    /\s+(N\.V\.?|NV|GMBH|S\.A\.|SA|AG|LTD|B\.V\.|BV|S\.P\.A\.|SPA|INC\.?|GROUP|SAS|AB|AS|CO)$/i;

export function stripCorpBrandSuffix(brand: string): string {
    let s = brand;
    for (let i = 0; i < 4; i++) {
        const t = s.replace(CORP_BRAND_SUFFIX_RE, "").trim();
        if (t === s) break;
        s = t;
    }
    return s;
}

/**
 * Écarts de dénomination irréductibles par règle générale.
 * À compléter au fil des marques rencontrées — chaque entrée devrait venir
 * d'un rapprochement raté observé, pas d'une supposition.
 */
const BRAND_ALIASES: Record<string, string> = {
    "MERCEDES BENZ": "MERCEDES",
    VOLKSWAGEN: "VW",
    "ALFA ROMEO": "ALFA",
    "FEDERAL MOGUL": "FERODO",
};

/** Clé de marque canonique. */
export function brandKey(brand: string): string {
    const base = stripCorpBrandSuffix(
        stripParentheticalBrandSuffix(normalizeBrandRaw(brand))
    );
    return BRAND_ALIASES[base] ?? base;
}

/**
 * Clé de référence canonique : sans séparateur, en majuscules.
 * « 09.5843.31 », « 09584331 », « P 68 050X », « DDF1061C-1 » se replient
 * chacune sur une clé unique et stable.
 */
export function refKeyRaw(ref: string): string {
    return ref.trim().replace(/[\s.\-_/]+/g, "").toUpperCase();
}

/**
 * Nettoyages propres à certaines marques, appliqués AVANT la normalisation
 * générale.
 *
 * Préférence ajoute parfois un code d'entrepôt à la référence OE de BOSCH :
 * `0986479382PH01WHCO0000` au lieu de `0986479382`. Sans ce nettoyage, l'article
 * ne se rapproche jamais de sa fiche TecDoc — et il s'affiche donc sans prix.
 */
function applyBrandSpecificCleanup(brand: string, ref: string): string {
    switch (brandKey(brand)) {
        case "BOSCH": {
            const m = ref.match(/^(0986\d{6})/);
            return m ? m[1] : ref;
        }
        default:
            return ref;
    }
}

/** Clé de référence canonique, en tenant compte de la marque. */
export function articleNoKey(brand: string, ref: string): string {
    return refKeyRaw(applyBrandSpecificCleanup(brand, ref));
}

/** Clé de jointure complète entre le référentiel et les offres grossistes. */
export function joinKey(brand: string, ref: string): { brandKey: string; articleNoKey: string } {
    return { brandKey: brandKey(brand), articleNoKey: articleNoKey(brand, ref) };
}

/**
 * Marques écartées de l'affichage.
 *
 * Reprise de la liste d'app-etf : ces marques remontent dans les résultats des
 * portails sans être commercialisées, ou sans donnée technique exploitable.
 * Configurable par `BLOCKED_BRANDS` dans .env.
 */
export const BLOCKED_BRANDS: Set<string> = new Set(
    (process.env.BLOCKED_BRANDS ?? "FEBI BILSTEIN")
        .split(",")
        .map((b) => brandKey(b))
        .filter(Boolean)
);

export function isBlockedBrand(brand: string): boolean {
    return BLOCKED_BRANDS.has(brandKey(brand));
}

/**
 * Détection d'accessoire (capteur d'usure, kit de montage, visserie).
 *
 * TecDoc rattache ces articles à la catégorie « plaquettes » par une relation
 * « se monte avec ». Ils n'ont ni dimensions ni prix comparables et polluent la
 * grille. Repris d'app-etf, où le cas DELPHI LX/LZ avait été identifié.
 */
export function isAccessoryRef(brand: string, ref: string): boolean {
    const b = brandKey(brand);
    const r = refKeyRaw(ref);
    if (b === "DELPHI" && /^L[XZ]\d/.test(r)) return true;
    return false;
}