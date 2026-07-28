/**
 * Synchronise, pour un vehicleId donné, les articles + facettes des catégories
 * "Plaquettes de frein" (100030) et "Disques de frein" (100032) depuis RapidAPI vers SQLite.
 *
 * Usage : npx tsx scripts/sync-vehicle.ts [vehicleId]
 * Si vehicleId est omis, le premier véhicule retourné par l'API est utilisé.
 */
import { db } from "../lib/db/client";
import { rapidApi } from "../lib/rapidapi/client";
import { articles, articleCriteriaFacets, categories, suppliers, vehicles } from "../lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { ApiEngineType } from "../lib/rapidapi/types";

const CATEGORIES = [
    { categoryId: 100030, labelFr: "Plaquettes de frein" },
    { categoryId: 100032, labelFr: "Disques de frein" },
] as const;

const CATEGORY_TO_PRODUCT_ID: Record<number, number> = {
    100030: 100030, // Brake Pad
    100032: 100032, // Brake Disc
};

async function ensureCategories() {
    for (const c of CATEGORIES) {
        await db
            .insert(categories)
            .values({ categoryId: c.categoryId, labelFr: c.labelFr })
            .onConflictDoUpdate({ target: categories.categoryId, set: { labelFr: c.labelFr } });
    }
}

async function syncSuppliersOnce() {
    const existing = await db.select().from(suppliers).limit(1);
    if (existing.length > 0) return; // référentiel global, pas besoin de le refaire à chaque véhicule

    const all = await rapidApi.listAllSuppliers();
    for (const s of all) {
        await db
            .insert(suppliers)
            .values({
                supplierId: s.supplierId,
                supplierName: s.supplierName,
                supplierMatchCode: s.supplierMatchCode,
                supplierLogoName: s.supplierLogoName,
                s3image: s.s3image,
            })
            .onConflictDoNothing();
    }
    console.log(`Fournisseurs synchronisés : ${all.length}`);
}

async function syncCategoryArticles(vehicleId: number, categoryId: number) {
    const { articles: apiArticles, countArticles } = await rapidApi.listArticles(vehicleId, categoryId);

    console.log(`  Catégorie ${categoryId} : ${countArticles} articles annoncés, ${apiArticles.length} reçus`);

    const distinctSupplierIds = new Set<number>();

    for (const a of apiArticles) {
        distinctSupplierIds.add(a.supplierId);
        await db
            .insert(articles)
            .values({
                articleId: a.articleId,
                vehicleId,
                categoryId,
                articleNo: a.articleNo,
                articleProductName: a.articleProductName,
                productId: a.productId,
                supplierId: a.supplierId,
                articleMediaType: a.articleMediaType,
                articleMediaFileName: a.articleMediaFileName,
                s3image: a.s3image,
            })
            .onConflictDoNothing();
    }

    return distinctSupplierIds;
}

async function syncFacetsForCategory(vehicleId: number, categoryId: number, supplierIds: Set<number>) {
    const productId = CATEGORY_TO_PRODUCT_ID[categoryId];
    if (!productId) {
        console.warn(
            `  Pas de productId configuré pour categoryId=${categoryId}, facettes ignorées pour l'instant.`
        );
        return;
    }

    // criteriaName -> { type, values: Set<string> }
    const aggregated = new Map<string, { type: string; values: Set<string> }>();

    for (const supplierId of supplierIds) {
        const { articles: criteriaRows } = await rapidApi.getSparePartCriteria(productId, vehicleId, supplierId);

        for (const row of criteriaRows) {
            const entry = aggregated.get(row.criteriaName) ?? { type: row.type, values: new Set<string>() };
            entry.values.add(row.criteriaValue);
            aggregated.set(row.criteriaName, entry);
        }
    }

    // On repart de zéro pour cette (vehicleId, categoryId) à chaque sync
    await db
        .delete(articleCriteriaFacets)
        .where(and(eq(articleCriteriaFacets.vehicleId, vehicleId), eq(articleCriteriaFacets.categoryId, categoryId)));

    for (const [criteriaName, { type, values }] of aggregated) {
        await db.insert(articleCriteriaFacets).values({
            vehicleId,
            categoryId,
            criteriaName,
            type,
            distinctValuesJson: JSON.stringify([...values]),
        });
    }

    console.log(`  Facettes agrégées pour categoryId=${categoryId} : ${aggregated.size} critères distincts`);
}

async function resolveVehicle(vehicleIdArg: number | null): Promise<ApiEngineType> {
    // modelId=1 est arbitraire : on veut juste récupérer un premier véhicule valide depuis l'API
    const { modelTypes } = await rapidApi.listEngineTypes(1);
    if (modelTypes.length === 0) throw new Error("Aucun véhicule retourné par l'API.");

    if (vehicleIdArg) {
        const found = modelTypes.find((v) => v.vehicleId === vehicleIdArg);
        if (!found) {
            console.warn(`vehicleId ${vehicleIdArg} absent de la réponse API, utilisation du premier disponible.`);
            return modelTypes[0];
        }
        return found;
    }

    return modelTypes[0];
}

async function upsertVehicle(v: ApiEngineType, manufacturerId: number, modelId: number) {
    await db
        .insert(vehicles)
        .values({
            vehicleId: v.vehicleId,
            manufacturerId,
            manufacturerName: v.manufacturerName,
            modelId,
            modelName: v.modelName,
            typeEngineName: v.typeEngineName,
            powerKw: v.powerKw ? parseFloat(v.powerKw) : null,
            powerPs: v.powerPs ? parseFloat(v.powerPs) : null,
            fuelType: v.fuelType ?? null,
            bodyType: v.bodyType ?? null,
            constructionIntervalStart: v.constructionIntervalStart ?? null,
            constructionIntervalEnd: v.constructionIntervalEnd ?? null,
        })
        .onConflictDoUpdate({
            target: vehicles.vehicleId,
            set: { manufacturerName: v.manufacturerName, modelName: v.modelName },
        });
}

async function main() {
    const vehicleIdArg = process.argv[2] ? Number(process.argv[2]) : null;

    await ensureCategories();
    await syncSuppliersOnce();

    const vehicleData = await resolveVehicle(vehicleIdArg);
    const vehicleId = vehicleData.vehicleId;

    // manufacturerId et modelId ne sont pas dans listEngineTypes — on utilise des valeurs de substitution
    // suffisantes pour la clé étrangère. Un vrai import passerait par listManufacturers + listModels.
    await upsertVehicle(vehicleData, 0, 0);

    console.log(`Synchronisation du véhicule ${vehicleId} (${vehicleData.manufacturerName} ${vehicleData.modelName})...`);

    for (const c of CATEGORIES) {
        console.log(`Catégorie "${c.labelFr}" (${c.categoryId})`);
        const supplierIds = await syncCategoryArticles(vehicleId, c.categoryId);
        await syncFacetsForCategory(vehicleId, c.categoryId, supplierIds);
    }

    await db
        .update(vehicles)
        .set({ syncedAt: new Date() })
        .where(eq(vehicles.vehicleId, vehicleId));

    console.log("Synchronisation terminée.");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});