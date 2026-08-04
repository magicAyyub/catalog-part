import { NextResponse } from "next/server";
import { formatDisplayPlate, normalizePlate } from "@/lib/vehicle/plate-resolver";
import { searchByPlate } from "@/lib/suppliers/preference";
import { syncVehicle } from "@/lib/vehicle/sync-service";
import { db } from "@/lib/db/client";
import { articles } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
    const startTime = Date.now();
    try {
        const body = await req.json().catch(() => ({}));
        const { plate } = body;

        if (!plate || typeof plate !== "string") {
            return NextResponse.json(
                { error: "Le paramètre 'plate' est requis." },
                { status: 400 }
            );
        }

        const clean = normalizePlate(plate);
        logger.info("Plate search started via TecDoc pipeline", { action: "by-plate", plate: clean });

        // 1. Résolution de la plaque -> K-Type / vehicleId via le scraper / SIV
        const scraperRes = await searchByPlate(clean, "plaquette").catch(() => null);
        if (!scraperRes || !scraperRes.vehicle) {
            throw new Error("Aucun véhicule trouvé pour cette immatriculation.");
        }

        const v = scraperRes.vehicle;
        const vehicleId = Number(v.carId || 0);

        if (!vehicleId) {
            throw new Error("Impossible d'identifier l'ID véhicule (K-Type) pour cette plaque.");
        }

        const engineTypeObj = {
            vehicleId,
            manufacturerName: v.brand || "Marque inconnue",
            modelName: v.model || "Modèle inconnu",
            typeEngineName: v.version || v.model || "Motorisation inconnue",
            constructionIntervalStart: "",
            constructionIntervalEnd: "",
            powerKw: "",
            powerPs: "",
            capacityTax: null,
            fuelType: "Inconnu",
            bodyType: "",
            numberOfCylinders: 4,
            capacityLt: "",
            capacityTech: "",
            engineCodes: "",
            engId: vehicleId,
        };

        // 2. Exécution de la synchronisation TecDoc RapidAPI vers SQLite (avec cache TTL)
        await syncVehicle(engineTypeObj, 0, 0);

        // 3. Injecter les prix & stocks nets du grossiste B2B sur les articles TecDoc dans SQLite
        if (Array.isArray(scraperRes.parts) && scraperRes.parts.length > 0) {
            for (const p of scraperRes.parts) {
                if (typeof p.priceNet === "number") {
                    const dbArts = await db
                        .select({ articleId: articles.articleId })
                        .from(articles)
                        .where(eq(articles.vehicleId, vehicleId));

                    for (const art of dbArts) {
                        await db
                            .update(articles)
                            .set({
                                priceNet: p.priceNet,
                                priceBase: p.priceBase || null,
                                discountLabel: p.discountLabel || null,
                                inStock: typeof p.inStock === "boolean" ? p.inStock : null,
                                stockLabel: p.stockLabel || null,
                            })
                            .where(eq(articles.articleId, art.articleId));
                    }
                }
            }
        }

        const vehicleResult = {
            plate: formatDisplayPlate(clean),
            vehicleId,
            manufacturerId: 0,
            modelId: 0,
            manufacturerName: v.brand || "Marque inconnue",
            modelName: v.model || "Modèle inconnu",
            typeEngineName: v.version || v.model || "Motorisation inconnue",
            engineType: engineTypeObj,
        };

        const durationMs = Date.now() - startTime;
        logger.info("Plate lookup completed", { action: "by-plate", plate: clean, vehicleId, durationMs });

        return NextResponse.json({ success: true, vehicle: vehicleResult });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Erreur lors de la recherche par immatriculation.";
        logger.error("Plate lookup failed", { action: "by-plate", error: err });
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
