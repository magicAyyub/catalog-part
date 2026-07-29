/**
 * sync-service.ts : Logique de synchronisation véhicule → SQLite.
 *
 * Utilisé par :
 *   - POST /api/vehicle/sync   (déclenchement depuis le client après sélection)
 *   - scripts/sync-vehicle.ts  (usage CLI standalone)
 *
 * Principe : cache-on-demand avec TTL 7 jours.
 * Si le véhicule est déjà en DB et synced_at < 7 jours, on ne rappelle pas l'API.
 */

import { db } from "@/lib/db/client";
import { rapidApi } from "@/lib/rapidapi/client";
import {
    articles,
    articleCriteriaFacets,
    articleSpecifications,
    categories,
    suppliers,
    vehicles,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { ApiEngineType } from "@/lib/rapidapi/types";

// ─── Constantes ───────────────────────────────────────────────────────────────

const SYNC_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

export const CATEGORIES = [
    { categoryId: 100030, labelFr: "Plaquettes de frein" },
    { categoryId: 100032, labelFr: "Disques de frein" },
] as const;

// productId = même valeur que categoryId dans l'API TecDoc pour ces deux catégories
const CATEGORY_TO_PRODUCT_ID: Record<number, number> = {
    100030: 100030,
    100032: 100032,
};

// ─── Helpers internes ─────────────────────────────────────────────────────────

async function ensureCategories() {
    for (const c of CATEGORIES) {
        await db
            .insert(categories)
            .values({ categoryId: c.categoryId, labelFr: c.labelFr })
            .onConflictDoNothing();
    }
}

async function ensureSuppliersOnce() {
    const existing = await db.select().from(suppliers).limit(1);
    if (existing.length > 0) return;

    const all = await rapidApi.listAllSuppliers();
    for (const s of all) {
        await db
            .insert(suppliers)
            .values({
                supplierId: s.supplierId,
                supplierName: s.supplierName,
                supplierMatchCode: s.supplierMatchCode ?? null,
                supplierLogoName: s.supplierLogoName ?? null,
                s3image: null,
            })
            .onConflictDoNothing();
    }
}

async function syncArticlesForCategory(
    vehicleId: number,
    categoryId: number
): Promise<Set<number>> {
    const { articles: apiArticles } = await rapidApi.listArticles(vehicleId, categoryId);
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
                articleMediaType: a.articleMediaType ?? null,
                articleMediaFileName: a.articleMediaFileName ?? null,
                s3image: a.s3image ?? null,
            })
            .onConflictDoNothing();
    }

    return distinctSupplierIds;
}

async function syncFacetsForCategory(
    vehicleId: number,
    categoryId: number,
    supplierIds: Set<number>
) {
    const productId = CATEGORY_TO_PRODUCT_ID[categoryId];
    if (!productId) return;

    // criteriaName -> { type, values: Set<string> }
    const aggregated = new Map<string, { type: string; values: Set<string> }>();
    const specsToInsert: { articleId: number; criteriaName: string; criteriaValue: string }[] = [];

    for (const supplierId of supplierIds) {
        // 1. Récupérer les articles réels de ce fournisseur en DB
        const dbArticles = await db
            .select({ articleId: articles.articleId })
            .from(articles)
            .where(
                and(
                    eq(articles.vehicleId, vehicleId),
                    eq(articles.categoryId, categoryId),
                    eq(articles.supplierId, supplierId)
                )
            );
        if (dbArticles.length === 0) continue;

        // 2. Récupérer les critères depuis l'API
        const { articles: criteriaRows } = await rapidApi.getSparePartCriteria(
            productId,
            vehicleId,
            supplierId
        );
        if (criteriaRows.length === 0) continue;

        // 3. Grouper les critères de l'API par article fictif
        const apiArticleSpecs = new Map<number, { criteriaName: string; criteriaValue: string; type: string }[]>();
        for (const row of criteriaRows) {
            // Agrégation globale pour les filtres
            const entry = aggregated.get(row.criteriaName) ?? {
                type: row.type,
                values: new Set<string>(),
            };
            entry.values.add(row.criteriaValue);
            aggregated.set(row.criteriaName, entry);

            // Groupement par article fictif
            const list = apiArticleSpecs.get(row.articleId) ?? [];
            list.push({ criteriaName: row.criteriaName, criteriaValue: row.criteriaValue, type: row.type });
            apiArticleSpecs.set(row.articleId, list);
        }

        // 4. Associer les spécifications aux articles réels de notre DB
        const apiSpecsList = Array.from(apiArticleSpecs.values());
        dbArticles.forEach((dbArt, index) => {
            // En prod, on associe par ID direct. En dev/mock, on distribue séquentiellement.
            const directMatch = apiArticleSpecs.get(dbArt.articleId);
            const specs = directMatch ?? apiSpecsList[index % apiSpecsList.length];
            
            if (specs) {
                for (const spec of specs) {
                    specsToInsert.push({
                        articleId: dbArt.articleId,
                        criteriaName: spec.criteriaName,
                        criteriaValue: spec.criteriaValue,
                    });
                }
            }
        });
    }

    // Supprimer les anciennes specs des articles de cette catégorie+véhicule
    const articleIdsInCategory = (
        await db
            .select({ articleId: articles.articleId })
            .from(articles)
            .where(and(eq(articles.vehicleId, vehicleId), eq(articles.categoryId, categoryId)))
    ).map((r) => r.articleId);

    if (articleIdsInCategory.length > 0) {
        await db
            .delete(articleSpecifications)
            .where(inArray(articleSpecifications.articleId, articleIdsInCategory));
    }

    // Insérer les specs
    for (const spec of specsToInsert) {
        await db.insert(articleSpecifications).values({
            articleId: spec.articleId,
            criteriaName: spec.criteriaName,
            criteriaValue: spec.criteriaValue,
        });
    }

    // Repart de zéro pour cette paire (vehicleId, categoryId) à chaque sync
    await db
        .delete(articleCriteriaFacets)
        .where(
            and(
                eq(articleCriteriaFacets.vehicleId, vehicleId),
                eq(articleCriteriaFacets.categoryId, categoryId)
            )
        );

    for (const [criteriaName, { type, values }] of aggregated) {
        await db.insert(articleCriteriaFacets).values({
            vehicleId,
            categoryId,
            criteriaName,
            type,
            distinctValuesJson: JSON.stringify([...values]),
        });
    }
}

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Vérifie si le véhicule a besoin d'une sync (absent de DB ou synced_at trop ancien).
 */
export async function needsSync(vehicleId: number): Promise<boolean> {
    const [row] = await db
        .select({ syncedAt: vehicles.syncedAt })
        .from(vehicles)
        .where(eq(vehicles.vehicleId, vehicleId))
        .limit(1);

    if (!row || !row.syncedAt) return true;
    return Date.now() - row.syncedAt.getTime() > SYNC_TTL_MS;
}

/**
 * Synchronise le véhicule + ses articles + ses facettes vers SQLite.
 * À appeler uniquement si needsSync() retourne true.
 */
export async function syncVehicle(
    engineType: ApiEngineType,
    manufacturerId: number,
    modelId: number
): Promise<void> {
    const vehicleId = engineType.vehicleId;

    await ensureCategories();
    await ensureSuppliersOnce();

    // Upsert du véhicule
    await db
        .insert(vehicles)
        .values({
            vehicleId,
            manufacturerId,
            manufacturerName: engineType.manufacturerName,
            modelId,
            modelName: engineType.modelName,
            typeEngineName: engineType.typeEngineName,
            powerKw: engineType.powerKw ? parseFloat(engineType.powerKw) : null,
            powerPs: engineType.powerPs ? parseFloat(engineType.powerPs) : null,
            fuelType: engineType.fuelType ?? null,
            bodyType: engineType.bodyType ?? null,
            constructionIntervalStart: engineType.constructionIntervalStart ?? null,
            constructionIntervalEnd: engineType.constructionIntervalEnd ?? null,
        })
        .onConflictDoUpdate({
            target: vehicles.vehicleId,
            set: {
                manufacturerName: engineType.manufacturerName,
                modelName: engineType.modelName,
            },
        });

    // Sync articles + facettes par catégorie
    for (const cat of CATEGORIES) {
        const supplierIds = await syncArticlesForCategory(vehicleId, cat.categoryId);
        await syncFacetsForCategory(vehicleId, cat.categoryId, supplierIds);
    }

    // Mise à jour du timestamp de sync
    await db
        .update(vehicles)
        .set({ syncedAt: new Date() })
        .where(eq(vehicles.vehicleId, vehicleId));
}
