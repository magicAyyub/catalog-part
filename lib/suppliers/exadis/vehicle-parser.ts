/**
 * Lecture de l'identité véhicule dans la table de chaînes d'Exadis.
 *
 * La table est une liste à plat, sans clés : les champs se repèrent par
 * position, relevée sur des réponses réelles de longueurs différentes.
 *
 *   plaque    l'ancre, comparée après normalisation
 *   marque    trois entrées après la plaque
 *   kType     premier groupe de neuf chiffres
 *   version   l'entrée qui suit le kType
 *   modèle    la dernière entrée
 *
 * Seul le kType est indispensable, et il se reconnaît à sa forme plutôt qu'à
 * sa position. Les libellés sont un bonus qu'un changement de gabarit fait
 * disparaître sans casser l'identification.
 */

export interface ExadisVehicle {
    kType: number;
    /** Libellé modèle TecDoc, "307 (3A/C)". Vide si illisible. */
    model: string;
    /** Libellé constructeur, "PEUGEOT". Vide si illisible. */
    brand: string;
    /** Motorisation telle que le portail la nomme, "1.6 Passion 16V". */
    version: string;
}

const JAVA_TYPE = /^(com\.|java\.)/;

export function normalizePlate(raw: string): string {
    return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

/** Une marque est alphabétique, jamais un code ni un nombre. */
function plausibleBrand(value: string | undefined): string {
    if (!value || JAVA_TYPE.test(value)) return "";
    const trimmed = value.trim();
    if (trimmed.length < 2 || trimmed.length > 30) return "";
    return /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]*$/.test(trimmed) ? trimmed : "";
}

/** Un libellé modèle porte au moins une lettre et n'est pas un nombre nu. */
function plausibleModel(value: string | undefined): string {
    if (!value || JAVA_TYPE.test(value)) return "";
    const trimmed = value.trim();
    if (trimmed.length < 1 || trimmed.length > 60) return "";
    if (/^\d+(\.\d+)?$/.test(trimmed)) return "";
    return /[A-Za-z]/.test(trimmed) ? trimmed : "";
}

/** Rend null sans kType, ce qui rend la réponse inexploitable. */
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
