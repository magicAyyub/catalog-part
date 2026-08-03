/**
 * lib/vehicle/plate-resolver.ts
 *
 * Service de résolution d'immatriculation française (SIV/FNI) vers vehicleId TecDoc.
 *
 * Pattern Adaptateur :
 * - Mode Mock (USE_MOCK_API=true) : Normalise la plaque et retourne un véhicule simulé déterministe.
 * - Mode Prod (USE_MOCK_API=false) : Point d'extension pour brancher l'API SIV choisie par l'entreprise.
 */

import { IS_MOCK } from "@/lib/config";
import type { ApiEngineType } from "@/lib/rapidapi/types";

export interface PlateLookupResult {
    plate: string;
    vehicleId: number;
    manufacturerId: number;
    modelId: number;
    manufacturerName: string;
    modelName: string;
    typeEngineName: string;
    powerKw: string;
    fuelType: string;
    vin?: string;
    products?: any[];
    engineType: ApiEngineType;
}

/**
 * Nettoie et normalise la plaque (supprime espaces, tirets, majuscules).
 */
export function normalizePlate(raw: string): string {
    return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Valide si la chaîne correspond à un format d'immatriculation français valide :
 * - SIV (depuis 2009) : AA-123-BB (7 caractères alfanumériques : 2 lettres, 3 chiffres, 2 lettres)
 * - FNI (ancien)      : 1234-AB-75 (ou similaire)
 */
export function isValidFrenchPlate(raw: string): boolean {
    const clean = normalizePlate(raw);
    // SIV: 2 lettres, 3 chiffres, 2 lettres (7 chars)
    const sivRegex = /^[A-Z]{2}\d{3}[A-Z]{2}$/;
    // FNI: 1 à 4 chiffres, 1 à 3 lettres, 2 ou 3 chiffres (ex: 1234AB75)
    const fniRegex = /^\d{1,4}[A-Z]{1,3}\d{2,3}$/;

    return sivRegex.test(clean) || fniRegex.test(clean);
}

/**
 * Formate une plaque SIV propre pour l'affichage (ex: AA123BB -> AA-123-BB).
 */
export function formatDisplayPlate(raw: string): string {
    const clean = normalizePlate(raw);
    if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(clean)) {
        return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5, 7)}`;
    }
    return raw.trim().toUpperCase();
}

/**
 * Formate en temps réel la plaque au fil de la saisie manuelle ou du copier-coller (ex: AA123BB -> AA-123-BB).
 * Limite la saisie aux 7 caractères alphanumériques réels (soit 9 caractères formatés avec tirets).
 */
export function formatPlateInput(input: string): string {
    const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, "");

    if (/^\d/.test(clean)) {
        const truncated = clean.slice(0, 9);
        const match = truncated.match(/^(\d{1,4})([A-Z]{0,3})(\d{0,3})$/);
        if (match) {
            const parts = [match[1], match[2], match[3]].filter(Boolean);
            return parts.join("-");
        }
        return truncated;
    }

    const truncated = clean.slice(0, 7);
    if (truncated.length <= 2) {
        return truncated;
    }
    if (truncated.length <= 5) {
        return `${truncated.slice(0, 2)}-${truncated.slice(2)}`;
    }
    return `${truncated.slice(0, 2)}-${truncated.slice(2, 5)}-${truncated.slice(5)}`;
}

// ─── Pool de véhicules de démonstration pour le mode Mock ─────────────────────

const MOCK_VEHICLES: Omit<PlateLookupResult, "plate">[] = [
    {
        vehicleId: 19942,
        manufacturerId: 93,
        modelId: 5626,
        manufacturerName: "RENAULT",
        modelName: "CLIO III (BR0/1, CR0/1)",
        typeEngineName: "1.2 16V (BR02, BR0J, BR11, CR02, CR0J, CR11)",
        powerKw: "55.0000",
        fuelType: "Essence",
        vin: "VF1BR1J0H41994200",
        engineType: {
            vehicleId: 19942,
            manufacturerName: "RENAULT",
            modelName: "CLIO III (BR0/1, CR0/1)",
            typeEngineName: "1.2 16V (BR02, BR0J, BR11, CR02, CR0J, CR11)",
            constructionIntervalStart: "2005-06-01",
            constructionIntervalEnd: "2014-12-01",
            powerKw: "55.0000",
            powerPs: "75.0000",
            capacityTax: null,
            fuelType: "Essence",
            bodyType: "Hatchback",
            numberOfCylinders: 4,
            capacityLt: "1.2000",
            capacityTech: "1149.0000",
            engineCodes: "D4F 740",
            engId: 19942,
        },
    },
    {
        vehicleId: 178952,
        manufacturerId: 121,
        modelId: 87037,
        manufacturerName: "VOLKSWAGEN",
        modelName: "GOLF VI (5K1)",
        typeEngineName: "2.0 TDI",
        powerKw: "103.0000",
        fuelType: "Diesel",
        vin: "WVWZZZ1KZBP178952",
        engineType: {
            vehicleId: 178952,
            manufacturerName: "VOLKSWAGEN",
            modelName: "GOLF VI (5K1)",
            typeEngineName: "2.0 TDI",
            constructionIntervalStart: "2008-10-01",
            constructionIntervalEnd: "2013-05-01",
            powerKw: "103.0000",
            powerPs: "140.0000",
            capacityTax: null,
            fuelType: "Diesel",
            bodyType: "Hatchback",
            numberOfCylinders: 4,
            capacityLt: "2.0000",
            capacityTech: "1968.0000",
            engineCodes: "CBAB, CFFB",
            engId: 178952,
        },
    },
    {
        vehicleId: 125643,
        manufacturerId: 16,
        modelId: 16499,
        manufacturerName: "BMW",
        modelName: "3 (E90)",
        typeEngineName: "320 d",
        powerKw: "130.0000",
        fuelType: "Diesel",
        vin: "WBAPP71040A125643",
        engineType: {
            vehicleId: 125643,
            manufacturerName: "BMW",
            modelName: "3 (E90)",
            typeEngineName: "320 d",
            constructionIntervalStart: "2007-09-01",
            constructionIntervalEnd: "2011-12-01",
            powerKw: "130.0000",
            powerPs: "177.0000",
            capacityTax: null,
            fuelType: "Diesel",
            bodyType: "Saloon",
            numberOfCylinders: 4,
            capacityLt: "2.0000",
            capacityTech: "1995.0000",
            engineCodes: "N47 D20 A",
            engId: 125643,
        },
    },
    {
        vehicleId: 28160,
        manufacturerId: 88,
        modelId: 6412,
        manufacturerName: "PEUGEOT",
        modelName: "207 (WA_, WC_)",
        typeEngineName: "1.6 HDi",
        powerKw: "66.0000",
        fuelType: "Diesel",
        vin: "VF3WA9HXC34281600",
        engineType: {
            vehicleId: 28160,
            manufacturerName: "PEUGEOT",
            modelName: "207 (WA_, WC_)",
            typeEngineName: "1.6 HDi",
            constructionIntervalStart: "2006-02-01",
            constructionIntervalEnd: "2013-10-01",
            powerKw: "66.0000",
            powerPs: "90.0000",
            capacityTax: null,
            fuelType: "Diesel",
            bodyType: "Hatchback",
            numberOfCylinders: 4,
            capacityLt: "1.6000",
            capacityTech: "1560.0000",
            engineCodes: "9HX (DV6ATED4)",
            engId: 28160,
        },
    },
];

/**
 * Résout une immatriculation en fiche véhicule.
 */
export async function resolvePlateToVehicle(rawPlate: string): Promise<PlateLookupResult> {
    const clean = normalizePlate(rawPlate);

    if (!clean) {
        throw new Error("Veuillez saisir une plaque d'immatriculation.");
    }

    if (!isValidFrenchPlate(clean)) {
        throw new Error("Format d'immatriculation invalide (Exemple SIV : AA-123-BB).");
    }

    if (IS_MOCK) {
        // Hachage déterministe de la plaque pour toujours retourner le même véhicule pour la même plaque
        let hash = 0;
        for (let i = 0; i < clean.length; i++) {
            hash = (hash << 5) - hash + clean.charCodeAt(i);
            hash |= 0;
        }
        const index = Math.abs(hash) % MOCK_VEHICLES.length;
        const mockMatch = MOCK_VEHICLES[index];

        return {
            plate: formatDisplayPlate(clean),
            ...mockMatch,
        };
    }

    // Mode Production: Service SIV local autonome ou microservice externe
    const baseUrl = process.env.PLATE_API_URL || "http://localhost:3000/api/external/by-plate";
    const token = process.env.PLATE_API_TOKEN || "jbo_dev_token";

    const res = await fetch(`${baseUrl}?plate=${encodeURIComponent(clean)}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
    });

    if (!res.ok) {
        if (res.status === 404) {
            throw new Error("Aucun véhicule trouvé pour cette plaque.");
        }
        throw new Error(`Service d'immatriculation indisponible (statut ${res.status}).`);
    }

    const data = await res.json();
    const v = data.vehicle;
    if (!v) {
        throw new Error("Aucun véhicule associé à cette immatriculation.");
    }

    const vehicleId = Number(v.vehicleId || v.carId || 0);

    return {
        plate: formatDisplayPlate(clean),
        vehicleId,
        manufacturerId: 0,
        modelId: 0,
        manufacturerName: v.manufacturerName || v.brand || "Marque inconnue",
        modelName: v.modelName || v.model || "Modèle inconnu",
        typeEngineName: v.typeEngineName || v.engineLine || v.version || v.model || "Motorisation inconnue",
        powerKw: String(v.powerKw || ""),
        fuelType: v.fuelType || "Inconnu",
        vin: v.vin,
        products: Array.isArray(data.products) ? data.products : [],
        engineType: {
            vehicleId,
            manufacturerName: v.manufacturerName || v.brand || "",
            modelName: v.modelName || v.model || "",
            typeEngineName: v.typeEngineName || v.engineLine || "",
            constructionIntervalStart: "",
            constructionIntervalEnd: "",
            powerKw: String(v.powerKw || ""),
            powerPs: "",
            capacityTax: null,
            fuelType: v.fuelType || "Inconnu",
            bodyType: "",
            numberOfCylinders: 4,
            capacityLt: "",
            capacityTech: "",
            engineCodes: "",
            engId: vehicleId,
        },
    };
}
