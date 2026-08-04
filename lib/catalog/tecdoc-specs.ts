export interface TechnicalSpec {
    outerDiameter?: string;
    thickness?: string;
    thicknessMin?: string;
    discType?: string;
    pcd?: string;
    centerDiameter?: string;
    numberOfHoles?: number;
    width?: string;
    height?: string;
    surface?: string;
}

export const TECDOC_REF_SPECS: Record<string, TechnicalSpec> = {
    // Disques de frein
    "BG3620": {
        outerDiameter: "266",
        thickness: "22",
        thicknessMin: "20",
        discType: "Ventilé",
        numberOfHoles: 4,
        centerDiameter: "66",
        pcd: "108",
        surface: "Huilé",
    },
    "BG3622": {
        outerDiameter: "249",
        thickness: "9",
        thicknessMin: "8",
        discType: "Plein",
        numberOfHoles: 4,
        centerDiameter: "30",
        pcd: "108",
        surface: "Huilé",
    },
    "BD536": {
        outerDiameter: "266",
        thickness: "22",
        thicknessMin: "20",
        discType: "Ventilé",
        numberOfHoles: 4,
        centerDiameter: "66",
        pcd: "108",
    },
    "BD876": {
        outerDiameter: "249",
        thickness: "9",
        thicknessMin: "8",
        discType: "Plein",
        numberOfHoles: 4,
        centerDiameter: "30",
    },
    "BG9022RSC": {
        outerDiameter: "283",
        thickness: "26",
        thicknessMin: "24",
        discType: "Ventilé",
        numberOfHoles: 4,
        centerDiameter: "66",
    },
    // Plaquettes de frein
    "LP1727": {
        width: "137",
        height: "51.5",
        thickness: "19",
    },
    "LP2254": {
        width: "87.2",
        height: "53",
        thickness: "17.2",
    },
    "LP565": {
        width: "87",
        height: "52.8",
        thickness: "17",
    },
};

export function getTecDocSpecsForRef(ref: string): TechnicalSpec | undefined {
    const clean = ref.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    for (const [key, spec] of Object.entries(TECDOC_REF_SPECS)) {
        if (clean.includes(key.toUpperCase())) return spec;
    }
    return undefined;
}
