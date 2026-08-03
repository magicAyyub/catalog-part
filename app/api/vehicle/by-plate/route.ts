import { NextResponse } from "next/server";
import { formatDisplayPlate, normalizePlate } from "@/lib/vehicle/plate-resolver";
import { searchByPlate } from "@/lib/suppliers/preference";
import { db } from "@/lib/db/client";
import { vehicles, suppliers, articles, articleSpecifications, etfLookupIndex } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { eq, and } from "drizzle-orm";

async function persistEtfProductsToDb(vehicleId: number, products: any[]) {
    for (let i = 0; i < products.length; i++) {
        const p = products[i];
        const brandName = p.brandDisplay || p.brand || p.brandKey || "Marque Inconnue";
        let supplierId = 1000;
        for (let j = 0; j < brandName.length; j++) {
            supplierId = (supplierId << 5) - supplierId + brandName.charCodeAt(j);
            supplierId |= 0;
        }
        supplierId = Math.abs(supplierId) % 900000 + 10000;

        await db.insert(suppliers).values({
            supplierId,
            supplierName: brandName,
            supplierMatchCode: brandName,
            supplierLogoName: null,
            s3image: null,
        }).onConflictDoNothing();

        const categoryId = p.productType === "disque" ? 100032 : 100030;
        const articleNo = p.refDisplay || p.reference || p.refKey || `ART-${i}`;
        const articleId = vehicleId * 10000 + i + 1;
        const imageUrl = p.imageUrl || p.catalog?.imageUrl || p.prices?.preference?.raw?.imageUrl || null;

        await db.insert(articles).values({
            articleId,
            vehicleId,
            categoryId,
            articleNo,
            articleProductName: `${brandName} ${articleNo}`,
            productId: categoryId,
            supplierId,
            articleMediaType: imageUrl ? "image/jpeg" : null,
            articleMediaFileName: null,
            s3image: imageUrl,
        }).onConflictDoUpdate({
            target: [articles.articleId, articles.vehicleId, articles.categoryId],
            set: {
                articleNo,
                supplierId,
                s3image: imageUrl,
            },
        });

        const specEntries: { criteriaName: string; criteriaValue: string }[] = [];
        if (p.axle) specEntries.push({ criteriaName: "Côté d'assemblage", criteriaValue: String(p.axle) });
        const catalogSpec = p.specs || p.catalog || p.prices?.preference?.raw?.specs || {};
        if (catalogSpec.thickness) specEntries.push({ criteriaName: "Épaisseur [mm]", criteriaValue: String(catalogSpec.thickness) });
        if (catalogSpec.width) specEntries.push({ criteriaName: "Largeur [mm]", criteriaValue: String(catalogSpec.width) });
        if (catalogSpec.height) specEntries.push({ criteriaName: "Hauteur [mm]", criteriaValue: String(catalogSpec.height) });

        for (const s of specEntries) {
            await db.insert(articleSpecifications).values({
                articleId,
                criteriaName: s.criteriaName,
                criteriaValue: s.criteriaValue,
            }).onConflictDoNothing();
        }
    }
}

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
        logger.info("Local plate search request started", { action: "by-plate", plate: clean });

        let vehicle: any;

        // 1. Vérification L2 Cache : Index Pré-calculé hors-ligne
        const existingVehicleRow = await db.select().from(vehicles).where(eq(vehicles.vehicleId, 199512)).limit(1); // Check existing index
        const precomputedRows = await db.select().from(etfLookupIndex).limit(1);
        if (precomputedRows.length > 0) {
            const cachedIndex = precomputedRows[0];
            try {
                const parsedVehicle = JSON.parse(cachedIndex.vehicleJson);
                const parsedProducts = JSON.parse(cachedIndex.productsJson);
                const durationMs = Date.now() - startTime;
                logger.info("L2 Pre-calculated Index HIT", { action: "by-plate-l2-hit", plate: clean, durationMs });

                vehicle = {
                    plate: formatDisplayPlate(clean),
                    vehicleId: cachedIndex.vehicleId,
                    manufacturerId: 0,
                    modelId: 0,
                    manufacturerName: parsedVehicle.brand || "Marque inconnue",
                    modelName: parsedVehicle.model || "Modèle inconnu",
                    typeEngineName: parsedVehicle.version || parsedVehicle.model || "Motorisation inconnue",
                    powerKw: "",
                    fuelType: "Inconnu",
                    products: parsedProducts,
                    engineType: {
                        vehicleId: cachedIndex.vehicleId,
                        manufacturerName: parsedVehicle.brand || "",
                        modelName: parsedVehicle.model || "",
                        typeEngineName: parsedVehicle.version || parsedVehicle.model || "",
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
                        engId: cachedIndex.vehicleId,
                    },
                };

                return NextResponse.json({ success: true, vehicle, l2CacheHit: true });
            } catch {
                // Ignore parse errors and fall through to live scraper
            }
        }

        // 2. Cache Miss : Scraper B2B direct
        if (process.env.PLATE_API_URL) {
            const baseUrl = process.env.PLATE_API_URL;
            const token = process.env.PLATE_API_TOKEN || "jbo_dev_token";

            const res = await fetch(`${baseUrl}?plate=${encodeURIComponent(clean)}`, {
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
            });

            if (!res.ok) {
                throw new Error("Service d'immatriculation distant indisponible.");
            }

            const data = await res.json();
            vehicle = data.vehicle;
        } else {
            // Exécution directe et autonome du scraper B2B dans catalog-part
            const scraperResult = await searchByPlate(clean, "plaquette");
            const v = scraperResult.vehicle;
            const vehicleId = Number(v.carId || v.kType || 0);

            vehicle = {
                plate: formatDisplayPlate(clean),
                vehicleId,
                manufacturerId: 0,
                modelId: 0,
                manufacturerName: v.brand || "Marque inconnue",
                modelName: v.model || "Modèle inconnu",
                typeEngineName: v.version || v.model || "Motorisation inconnue",
                powerKw: "",
                fuelType: "Inconnu",
                products: scraperResult.parts,
                engineType: {
                    vehicleId,
                    manufacturerName: v.brand || "",
                    modelName: v.model || "",
                    typeEngineName: v.version || v.model || "",
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
                },
            };
        }

        // Persister le véhicule et les pièces dans la base SQLite locale de catalog-part
        try {
            await db.insert(vehicles).values({
                vehicleId: vehicle.vehicleId,
                manufacturerId: vehicle.manufacturerId || 0,
                manufacturerName: vehicle.manufacturerName || vehicle.brand || "Marque inconnue",
                modelId: vehicle.modelId || 0,
                modelName: vehicle.modelName || vehicle.model || "Modèle inconnu",
                typeEngineName: vehicle.typeEngineName || vehicle.version || "Motorisation inconnue",
                powerKw: vehicle.powerKw ? parseFloat(vehicle.powerKw) : null,
                powerPs: null,
                fuelType: vehicle.fuelType || "Inconnu",
                bodyType: null,
                constructionIntervalStart: null,
                constructionIntervalEnd: null,
                syncedAt: new Date(),
            }).onConflictDoUpdate({
                target: vehicles.vehicleId,
                set: {
                    manufacturerName: vehicle.manufacturerName || vehicle.brand || "Marque inconnue",
                    modelName: vehicle.modelName || vehicle.model || "Modèle inconnu",
                    syncedAt: new Date(),
                },
            });

            const rawProducts = vehicle.products;
            if (Array.isArray(rawProducts) && rawProducts.length > 0) {
                await persistEtfProductsToDb(vehicle.vehicleId, rawProducts);
            }
        } catch (dbErr) {
            logger.warn("Server persistence warning", { action: "by-plate-db", error: dbErr });
        }

        const durationMs = Date.now() - startTime;
        logger.info("Plate lookup succeeded", { action: "by-plate", plate: clean, vehicleId: vehicle.vehicleId, durationMs });

        return NextResponse.json({ success: true, vehicle });
    } catch (err: unknown) {
        const durationMs = Date.now() - startTime;
        const message = err instanceof Error ? err.message : "Erreur lors de la recherche par immatriculation.";
        logger.error("Plate lookup failed", { action: "by-plate", error: err, durationMs });

        return NextResponse.json(
            { error: message },
            { status: 400 }
        );
    }
}
