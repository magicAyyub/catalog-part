/**
 * Reads the vehicle identity out of an Exadis RPC #4 string table.
 *
 * Positions were derived from real responses rather than guessed, on a PEUGEOT
 * 307 and a FIAT PUNTO EVO, whose tables have different lengths:
 *
 *   plate     the anchor, matched after normalisation
 *   brand     three entries after the plate
 *   kType     first nine digit group, zero padded
 *   version   the entry right after the K-Type
 *   model     the last entry, and it matches app-etf's label exactly
 *
 * Only the K-Type is required. The labels are a bonus taken from the same
 * response, so a layout change costs the shortcut, never the identification.
 */

export interface ExadisVehicle {
    kType: number;
    /** TecDoc model label, "307 (3A/C)". Empty when it could not be trusted. */
    model: string;
    /** Manufacturer label, "PEUGEOT". Empty when it could not be trusted. */
    brand: string;
    /** Engine line as the portal words it, "1.6 Passion 16V". */
    version: string;
}

const JAVA_TYPE = /^(com\.|java\.)/;

export function normalizePlate(raw: string): string {
    return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

/** A brand is alphabetic, possibly hyphenated, never a code or a number. */
function plausibleBrand(value: string | undefined): string {
    if (!value || JAVA_TYPE.test(value)) return "";
    const trimmed = value.trim();
    if (trimmed.length < 2 || trimmed.length > 30) return "";
    return /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]*$/.test(trimmed) ? trimmed : "";
}

/** A model label carries at least one letter and is not a bare number. */
function plausibleModel(value: string | undefined): string {
    if (!value || JAVA_TYPE.test(value)) return "";
    const trimmed = value.trim();
    if (trimmed.length < 1 || trimmed.length > 60) return "";
    if (/^\d+(\.\d+)?$/.test(trimmed)) return "";
    return /[A-Za-z]/.test(trimmed) ? trimmed : "";
}

/** Returns null when no K-Type is present, which makes the source unusable. */
export function parseVehicleIdentity(stringTable: string[], plate: string): ExadisVehicle | null {
    const wanted = normalizePlate(plate);

    const plateIndex = stringTable.findIndex((value) => normalizePlate(value) === wanted);
    if (plateIndex < 0) return null;

    const kTypeIndex = stringTable.findIndex((value) => /^\d{9}$/.test(value));
    if (kTypeIndex < 0) return null;

    const kType = Number.parseInt(stringTable[kTypeIndex], 10);
    if (!Number.isFinite(kType) || kType <= 0) return null;

    return {
        kType,
        brand: plausibleBrand(stringTable[plateIndex + 3]),
        model: plausibleModel(stringTable[stringTable.length - 1]),
        version: plausibleModel(stringTable[kTypeIndex + 1]),
    };
}
