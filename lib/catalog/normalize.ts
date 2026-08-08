/**
 * Brand and reference normalization.
 *
 * TecDoc thinks in numeric `articleId`s; wholesaler portals only know a brand
 * name and the reference printed on the box. The (brandKey, articleNoKey) pair
 * is the only bridge between them.
 *
 * A mistake here never crashes, it silently fails a match and surfaces as a part
 * with no price. Hence separate, testable rules rather than one regex. Carried
 * over from app-etf, where they were proven in production.
 */

/** Uppercase, internal whitespace collapsed to a single space. */
export function normalizeBrandRaw(brand: string): string {
    return brand.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Drops the parenthesised suffix some portals append, so that
 * "FERODO (FEDERAL MOGUL)" and "FERODO" meet.
 */
export function stripParentheticalBrandSuffix(brand: string): string {
    return brand.replace(/\s*\([^)]*\)\s*$/u, "").trim();
}

/**
 * Drops legal entity and group suffixes: "BREMBO N.V." becomes "BREMBO".
 * Several passes, because suffixes stack ("X GROUP CO").
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

/** Naming gaps no general rule closes. Add only from an observed failed match. */
const BRAND_ALIASES: Record<string, string> = {
    "MERCEDES BENZ": "MERCEDES",
    VOLKSWAGEN: "VW",
    "ALFA ROMEO": "ALFA",
    "FEDERAL MOGUL": "FERODO",
};

/** Canonical brand key. */
export function brandKey(brand: string): string {
    const base = stripCorpBrandSuffix(
        stripParentheticalBrandSuffix(normalizeBrandRaw(brand))
    );
    return BRAND_ALIASES[base] ?? base;
}

/**
 * Canonical reference key: no separators, uppercase. "09.5843.31" and
 * "09584331" collapse onto the same stable key.
 */
export function refKeyRaw(ref: string): string {
    return ref.trim().replace(/[\s.\-_/]+/g, "").toUpperCase();
}

/**
 * Brand specific cleanups, applied before the general normalization. Preference
 * appends a warehouse code to BOSCH OE references
 * (`0986479382PH01WHCO0000`); without this the article never meets its TecDoc
 * record and shows no price.
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

/** Canonical reference key, brand aware. */
export function articleNoKey(brand: string, ref: string): string {
    return refKeyRaw(applyBrandSpecificCleanup(brand, ref));
}

/** Full join key between the reference data and wholesaler offers. */
export function joinKey(brand: string, ref: string): { brandKey: string; articleNoKey: string } {
    return { brandKey: brandKey(brand), articleNoKey: articleNoKey(brand, ref) };
}

/**
 * Brands excluded from display: they surface in portal results without being
 * sold, or without usable technical data. Configurable via `BLOCKED_BRANDS`.
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
 * Accessory detection: wear sensors, fitting kits, bolts. TecDoc attaches these
 * to the brake pad category through a "fits with" relation; they carry neither
 * comparable dimensions nor prices.
 */
export function isAccessoryRef(brand: string, ref: string): boolean {
    const b = brandKey(brand);
    const r = refKeyRaw(ref);
    if (b === "DELPHI" && /^L[XZ]\d/.test(r)) return true;
    return false;
}
