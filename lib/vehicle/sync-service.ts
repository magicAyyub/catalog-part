/**
 * Vehicle synchronization into SQLite.
 *
 * Used by POST /api/vehicle/sync, triggered from the client after a selection,
 * and by the warm-up script.
 *
 * Cache on demand with a configurable TTL, 30 days by default: when the vehicle
 * is already stored and `synced_at` is within the TTL, the API is not called
 * again.
 */

import { db } from "@/lib/db/client";
import { rapidApi } from "@/lib/rapidapi/client";
import { logger } from "@/lib/logger";
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
import {
    SYNC_TTL_MS,
    ALLOWED_SUPPLIER_IDS,
    CATEGORIES as CONFIG_CATEGORIES,
} from "@/lib/config";

export const CATEGORIES = CONFIG_CATEGORIES;

async function ensureCategories() {
    for (const c of CATEGORIES) {
        await db
            .insert(categories)
            .values({ categoryId: c.categoryId, labelFr: c.labelFr })
            .onConflictDoNothing();
    }
}

/**
 * `ensureSuppliersOnce` was removed.
 *
 * Despite its name it called `suppliers/list` on EVERY vehicle sync, downloading
 * 338 KB of frozen referential and inserting it through 1269 single statements.
 * `syncArticlesForCategory` already records each supplier it encounters, with
 * its name. The only extra field that referential provided was
 * `supplierLogoName`, which the interface does not use: `part-card.tsx` renders
 * the brand as text.
 */

async function syncArticlesForCategory(
    vehicleId: number,
    categoryId: number,
    force: boolean
): Promise<void> {
    if (!force) {
        const existing = await db
            .select({ articleId: articles.articleId })
            .from(articles)
            .where(and(eq(articles.vehicleId, vehicleId), eq(articles.categoryId, categoryId)))
            .limit(1);

        if (existing.length > 0) return;
    }

    const res = await rapidApi.listArticles(vehicleId, categoryId);
    const apiArticles = Array.isArray(res?.articles) ? res.articles : [];

    const filteredArticles = apiArticles.filter((a) => ALLOWED_SUPPLIER_IDS.has(a.supplierId));

    logger.info("Articles synced for category", {
        module: "sync-service",
        action: "articles_synced",
        vehicleId,
        categoryId,
        returnedByApi: apiArticles.length,
        keptAfterSupplierFilter: filteredArticles.length,
    });

    for (const a of filteredArticles) {
        // Garantir l'existence du supplierId pour éviter SqliteError: FOREIGN KEY constraint failed
        await db
            .insert(suppliers)
            .values({
                supplierId: a.supplierId,
                supplierName: a.supplierName || "Inconnu",
                supplierMatchCode: a.supplierName || null,
                supplierLogoName: null,
                s3image: null,
            })
            .onConflictDoNothing();

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
}

/**
 * Fetches the technical criteria of a category's articles and aggregates its
 * facets.
 *
 * `Vehicle_Spare_Part_Criteria` is queried by (productId, vehicleId,
 * supplierId). `productId` is the TecDoc generic article identifier, NOT the
 * category identifier. The previous version sent the category (100030 or
 * 100032): the API answered `{"articles": null}`, the failure was swallowed by an
 * empty `catch {}`, and no criteria were ever stored.
 *
 * Real `productId` values arrive with the article list and are already stored in
 * `articles.product_id` (on the FIAT PUNTO EVO: 402 for pads, 82 for discs), so
 * the pairs actually present in the database are used and no mapping table needs
 * maintaining.
 */
async function syncFacetsForCategory(vehicleId: number, categoryId: number, force: boolean) {
    const dbArticles = await db
        .select({
            articleId: articles.articleId,
            productId: articles.productId,
            supplierId: articles.supplierId,
        })
        .from(articles)
        .where(and(eq(articles.vehicleId, vehicleId), eq(articles.categoryId, categoryId)));

    if (dbArticles.length === 0) return;

    const ourArticleIds = new Set(dbArticles.map((a) => a.articleId));

    // Garde symétrique de celle des articles : si les caractéristiques sont déjà
    // en base, ne pas racheter les critères. Sans elle, toute resynchronisation
    // repayait 8 à 10 appels, c'est ce qui a consommé 17 des 34 appels criteria
    // de la journée de mise au point.
    if (!force) {
        const existing = await db
            .select({ id: articleSpecifications.id })
            .from(articleSpecifications)
            .where(inArray(articleSpecifications.articleId, [...ourArticleIds]))
            .limit(1);

        if (existing.length > 0) {
            logger.info("Criteria already cached for category, skipped", {
                module: "sync-service",
                action: "criteria_skipped",
                vehicleId,
                categoryId,
            });
            return;
        }
    }

    // Un couple = un appel API. En pratique une catégorie n'a qu'un productId,
    // donc c'est un appel par équipementier autorisé.
    const pairs = new Map<string, { productId: number; supplierId: number }>();
    for (const a of dbArticles) {
        if (!a.productId) continue;
        if (!ALLOWED_SUPPLIER_IDS.has(a.supplierId)) continue;
        pairs.set(`${a.productId}:${a.supplierId}`, {
            productId: a.productId,
            supplierId: a.supplierId,
        });
    }

    const aggregated = new Map<string, { type: string; values: Set<string> }>();
    // Clé composite pour ne pas insérer deux fois la même caractéristique :
    // la table n'a pas de contrainte d'unicité, un onConflictDoNothing n'y
    // changerait rien.
    const specs = new Map<string, { articleId: number; criteriaName: string; criteriaValue: string }>();

    for (const { productId, supplierId } of pairs.values()) {
        let criteriaRows;
        try {
            const res = await rapidApi.getSparePartCriteria(productId, vehicleId, supplierId);
            criteriaRows = res?.articles ?? [];
        } catch (error) {
            // Journalisé, jamais avalé : c'est ce silence qui masquait le bug.
            logger.warn("Spare part criteria lookup failed", {
                module: "sync-service",
                action: "criteria_error",
                vehicleId,
                categoryId,
                productId,
                supplierId,
                error,
            });
            continue;
        }

        for (const row of criteriaRows) {
            // La réponse couvre tous les articles du couple, y compris ceux
            // qu'on n'affiche pas. Les ignorer évite d'exposer un filtre qui ne
            // correspondrait à aucune pièce à l'écran.
            if (!ourArticleIds.has(row.articleId)) continue;

            const entry = aggregated.get(row.criteriaName) ?? {
                type: row.type,
                values: new Set<string>(),
            };
            entry.values.add(row.criteriaValue);
            aggregated.set(row.criteriaName, entry);

            specs.set(`${row.articleId}|${row.criteriaName}|${row.criteriaValue}`, {
                articleId: row.articleId,
                criteriaName: row.criteriaName,
                criteriaValue: row.criteriaValue,
            });
        }
    }

    const specsToInsert = [...specs.values()];

    logger.info("Criteria synced for category", {
        module: "sync-service",
        action: "criteria_synced",
        vehicleId,
        categoryId,
        apiCalls: pairs.size,
        articles: dbArticles.length,
        articlesWithSpecs: new Set(specsToInsert.map((s) => s.articleId)).size,
        specRows: specsToInsert.length,
        facets: aggregated.size,
    });

    // Remise à plat avant réécriture, pour qu'une resynchronisation ne cumule
    // pas les anciennes valeurs avec les nouvelles.
    await db
        .delete(articleSpecifications)
        .where(inArray(articleSpecifications.articleId, [...ourArticleIds]));

    for (const spec of specsToInsert) {
        await db.insert(articleSpecifications).values({
            articleId: spec.articleId,
            criteriaName: spec.criteriaName,
            criteriaValue: spec.criteriaValue,
        });
    }

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

export async function needsSync(vehicleId: number): Promise<boolean> {
    const [row] = await db
        .select({ syncedAt: vehicles.syncedAt })
        .from(vehicles)
        .where(eq(vehicles.vehicleId, vehicleId))
        .limit(1);

    if (!row || !row.syncedAt) return true;
    return Date.now() - row.syncedAt.getTime() > SYNC_TTL_MS;
}

export interface SyncOptions {
    /**
     * Refreshes even when articles and criteria are already stored. Reserved for
     * the warm-up, which renews vehicles approaching TTL expiry.
     */
    force?: boolean;
}

export async function syncVehicle(
    engineType: ApiEngineType,
    manufacturerId: number,
    modelId: number,
    options: SyncOptions = {}
): Promise<void> {
    const vehicleId = engineType.vehicleId;
    const force = options.force === true;

    await ensureCategories();

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

    for (const cat of CATEGORIES) {
        await syncArticlesForCategory(vehicleId, cat.categoryId, force);
        // Les couples (productId, supplierId) sont relus depuis la base : plus
        // besoin de faire circuler la liste des équipementiers.
        await syncFacetsForCategory(vehicleId, cat.categoryId, force);
    }

    await db
        .update(vehicles)
        .set({ syncedAt: new Date() })
        .where(eq(vehicles.vehicleId, vehicleId));
}

/**
 * Resynchronizes an already known vehicle from its stored record.
 *
 * Used by the nightly warm-up, which only holds a vehicleId while `syncVehicle`
 * expects an `ApiEngineType`. The latter is rebuilt from the `vehicles` row; it
 * only feeds the record upsert anyway, since fetching parts depends solely on
 * the vehicleId.
 */
export async function resyncVehicle(
    vehicleId: number,
    options: SyncOptions = {}
): Promise<boolean> {
    const [row] = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.vehicleId, vehicleId))
        .limit(1);

    if (!row) return false;

    const engineType: ApiEngineType = {
        vehicleId: row.vehicleId,
        manufacturerName: row.manufacturerName,
        modelName: row.modelName,
        typeEngineName: row.typeEngineName,
        constructionIntervalStart: row.constructionIntervalStart ?? "",
        constructionIntervalEnd: row.constructionIntervalEnd ?? null,
        powerKw: row.powerKw != null ? String(row.powerKw) : "",
        powerPs: row.powerPs != null ? String(row.powerPs) : "",
        capacityTax: null,
        fuelType: row.fuelType ?? "Inconnu",
        bodyType: row.bodyType ?? "",
        numberOfCylinders: 0,
        capacityLt: "",
        capacityTech: "",
        engineCodes: "",
        engId: row.vehicleId,
    };

    await syncVehicle(engineType, row.manufacturerId, row.modelId, options);
    return true;
}

/** Vehicles whose cache is nearing expiry, oldest first. */
export async function listVehiclesNeedingRefresh(
    withinMs: number
): Promise<{ vehicleId: number; label: string; syncedAt: Date | null }[]> {
    const rows = await db
        .select({
            vehicleId: vehicles.vehicleId,
            manufacturerName: vehicles.manufacturerName,
            modelName: vehicles.modelName,
            typeEngineName: vehicles.typeEngineName,
            syncedAt: vehicles.syncedAt,
        })
        .from(vehicles);

    const threshold = Date.now() - (SYNC_TTL_MS - withinMs);

    return rows
        .filter((r) => !r.syncedAt || r.syncedAt.getTime() <= threshold)
        .sort((a, b) => (a.syncedAt?.getTime() ?? 0) - (b.syncedAt?.getTime() ?? 0))
        .map((r) => ({
            vehicleId: r.vehicleId,
            label: `${r.manufacturerName} ${r.modelName} ${r.typeEngineName}`.trim(),
            syncedAt: r.syncedAt,
        }));
}
