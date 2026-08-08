/**
 * Braking catalog acquisition, from TecDoc into the `td_*` tables.
 *
 * RapidAPI is an acquisition channel, not a runtime dependency: a
 * (vehicle, category) pair is paid for once, then served free.
 *
 * The fitment pass costs about 10 calls per vehicle and brings articles,
 * criteria and WVA numbers. The details pass costs one call per article and
 * brings OEM references, so it stays opt-in.
 */

import { db } from "@/lib/db/client";
import { rapidApi } from "@/lib/rapidapi/client";
import { getWithCompressedCache } from "@/lib/vehicle/api-cache";
import { logger } from "@/lib/logger";
import {
    indexJob,
    tdArticle,
    tdCriteria,
    tdFitment,
    tdOem,
    tdSupplier,
    tdVehicle,
    tdWva,
    vehicles as legacyVehicles,
} from "@/lib/db/schema";
import { ALLOWED_SUPPLIER_IDS, CATEGORIES } from "@/lib/config";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { articleNoKey, brandKey, isAccessoryRef, isBlockedBrand, refKeyRaw } from "./normalize";

/** Criteria name carrying the WVA number, TecDoc spelling, lowercased. */
const WVA_CRITERIA = "numéro wva";

export interface IndexResult {
    vehicleId: number;
    categoryId: number;
    status: "ok" | "empty" | "error" | "skipped";
    articlesFound: number;
    articlesKept: number;
    criteriaRows: number;
    apiCalls: number;
    durationMs: number;
    error?: string;
}

/**
 * Guarantees the `td_vehicle` row that `td_fitment` references.
 *
 * Labels come from the legacy `vehicles` table when known, otherwise a minimal
 * record: indexing depends only on the K-Type, labels can be enriched later.
 */
async function ensureVehicle(vehicleId: number): Promise<boolean> {
    const [existing] = await db
        .select({ vehicleId: tdVehicle.vehicleId })
        .from(tdVehicle)
        .where(eq(tdVehicle.vehicleId, vehicleId))
        .limit(1);
    if (existing) return true;

    const [legacy] = await db
        .select()
        .from(legacyVehicles)
        .where(eq(legacyVehicles.vehicleId, vehicleId))
        .limit(1);

    await db
        .insert(tdVehicle)
        .values({
            vehicleId,
            manufacturerId: legacy?.manufacturerId ?? null,
            manufacturerName: legacy?.manufacturerName ?? "À enrichir",
            modelId: legacy?.modelId ?? null,
            modelName: legacy?.modelName ?? "À enrichir",
            typeEngineName: legacy?.typeEngineName ?? "À enrichir",
            powerKw: legacy?.powerKw ?? null,
            powerPs: legacy?.powerPs ?? null,
            fuelType: legacy?.fuelType ?? null,
            bodyType: legacy?.bodyType ?? null,
            engineCodes: null,
            ctorStart: legacy?.constructionIntervalStart ?? null,
            ctorEnd: legacy?.constructionIntervalEnd ?? null,
        })
        .onConflictDoNothing();

    return legacy != null;
}

/** Has this (vehicle, category) pair already been paid for? */
export async function alreadyIndexed(vehicleId: number, categoryId: number): Promise<boolean> {
    const [row] = await db
        .select({ status: indexJob.status })
        .from(indexJob)
        .where(and(eq(indexJob.vehicleId, vehicleId), eq(indexJob.categoryId, categoryId)))
        .limit(1);
    return row != null && (row.status === "ok" || row.status === "empty");
}

async function recordJob(r: IndexResult): Promise<void> {
    await db
        .insert(indexJob)
        .values({
            vehicleId: r.vehicleId,
            categoryId: r.categoryId,
            status: r.status,
            articlesFound: r.articlesFound,
            articlesKept: r.articlesKept,
            criteriaRows: r.criteriaRows,
            apiCalls: r.apiCalls,
            durationMs: r.durationMs,
            error: r.error ?? null,
            indexedAt: new Date(),
        })
        .onConflictDoUpdate({
            target: [indexJob.vehicleId, indexJob.categoryId],
            set: {
                status: r.status,
                articlesFound: r.articlesFound,
                articlesKept: r.articlesKept,
                criteriaRows: r.criteriaRows,
                apiCalls: r.apiCalls,
                durationMs: r.durationMs,
                error: r.error ?? null,
                indexedAt: new Date(),
            },
        });
}

/** Fitment pass: articles, applicability, criteria and WVA for one pair. */
export async function indexVehicleCategory(
    vehicleId: number,
    categoryId: number,
    options: { force?: boolean } = {}
): Promise<IndexResult> {
    const started = Date.now();
    const base = { vehicleId, categoryId, articlesFound: 0, articlesKept: 0, criteriaRows: 0 };

    if (!options.force && (await alreadyIndexed(vehicleId, categoryId))) {
        return { ...base, status: "skipped", apiCalls: 0, durationMs: 0 };
    }

    let apiCalls = 0;

    try {
        await ensureVehicle(vehicleId);

        const res = await rapidApi.listArticles(vehicleId, categoryId);
        apiCalls++;
        const found = Array.isArray(res?.articles) ? res.articles : [];

        // Trois filtres, dans cet ordre : équipementiers commercialisés, marques
        // écartées, accessoires (capteurs et visserie que TecDoc rattache aux
        // plaquettes par une relation « se monte avec »).
        const kept = found.filter(
            (a) =>
                ALLOWED_SUPPLIER_IDS.has(a.supplierId) &&
                !isBlockedBrand(a.supplierName) &&
                !isAccessoryRef(a.supplierName, a.articleNo)
        );

        if (kept.length === 0) {
            const result: IndexResult = {
                ...base,
                articlesFound: found.length,
                status: "empty",
                apiCalls,
                durationMs: Date.now() - started,
            };
            await recordJob(result);
            return result;
        }

        for (const a of kept) {
            await db
                .insert(tdSupplier)
                .values({ supplierId: a.supplierId, supplierName: a.supplierName })
                .onConflictDoNothing();

            await db
                .insert(tdArticle)
                .values({
                    articleId: a.articleId,
                    articleNo: a.articleNo,
                    articleNoKey: articleNoKey(a.supplierName, a.articleNo),
                    supplierId: a.supplierId,
                    brandKey: brandKey(a.supplierName),
                    productId: a.productId ?? null,
                    productName: a.articleProductName ?? null,
                    imageUrl: a.s3image ?? null,
                })
                .onConflictDoNothing();

            await db
                .insert(tdFitment)
                .values({
                    vehicleId,
                    articleId: a.articleId,
                    categoryId,
                    productId: a.productId ?? null,
                })
                .onConflictDoNothing();
        }

        const keptIds = new Set(kept.map((a) => a.articleId));

        /**
         * Criteria belong to the reference, not to the vehicle. Verified: the
         * 307 2.0 HDi indexed after the 307 1.6 16V processed 879 criteria rows
         * to produce 10, those of its 2 new references out of 93.
         *
         * Only pairs covering a reference still lacking criteria are queried,
         * which drops a sibling vehicle from about 11 calls to one.
         */
        const withCriteria = new Set(
            (
                await db
                    .selectDistinct({ articleId: tdCriteria.articleId })
                    .from(tdCriteria)
                    .where(inArray(tdCriteria.articleId, [...keptIds]))
            ).map((r) => r.articleId)
        );

        const pairs = new Map<string, { productId: number; supplierId: number }>();
        for (const a of kept) {
            if (!a.productId) continue;
            if (withCriteria.has(a.articleId)) continue;
            pairs.set(`${a.productId}:${a.supplierId}`, {
                productId: a.productId,
                supplierId: a.supplierId,
            });
        }

        if (withCriteria.size > 0) {
            logger.info("Criteria already known for some articles", {
                module: "indexer",
                action: "criteria_reused",
                vehicleId,
                categoryId,
                articlesReused: withCriteria.size,
                articlesToFetch: kept.length - withCriteria.size,
                pairsToCall: pairs.size,
            });
        }
        let criteriaRows = 0;

        for (const { productId, supplierId } of pairs.values()) {
            let rows;
            try {
                const cr = await rapidApi.getSparePartCriteria(productId, vehicleId, supplierId);
                apiCalls++;
                rows = cr?.articles ?? [];
            } catch (error) {
                // Journalisé, jamais avalé : un critère manquant est une perte de
                // donnée silencieuse si on ne le trace pas.
                logger.warn("Criteria lookup failed during indexing", {
                    module: "indexer",
                    action: "criteria_error",
                    vehicleId,
                    categoryId,
                    productId,
                    supplierId,
                    error,
                });
                apiCalls++;
                continue;
            }

            for (const row of rows) {
                // La réponse couvre tous les articles du couple, y compris ceux
                // qu'on ne commercialise pas.
                if (!keptIds.has(row.articleId)) continue;

                await db
                    .insert(tdCriteria)
                    .values({
                        articleId: row.articleId,
                        criteriaName: row.criteriaName,
                        criteriaValue: row.criteriaValue,
                    })
                    .onConflictDoNothing();
                criteriaRows++;

                // WVA récupéré au passage : arête d'équivalence gratuite.
                if (row.criteriaName.trim().toLowerCase() === WVA_CRITERIA) {
                    for (const wva of row.criteriaValue.split(/[,;\s]+/)) {
                        const clean = refKeyRaw(wva);
                        if (!clean) continue;
                        await db
                            .insert(tdWva)
                            .values({ articleId: row.articleId, wva: clean })
                            .onConflictDoNothing();
                    }
                }
            }
        }

        const result: IndexResult = {
            vehicleId,
            categoryId,
            status: "ok",
            articlesFound: found.length,
            articlesKept: kept.length,
            criteriaRows,
            apiCalls,
            durationMs: Date.now() - started,
        };
        await recordJob(result);
        return result;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const result: IndexResult = {
            ...base,
            status: "error",
            apiCalls,
            durationMs: Date.now() - started,
            error: message,
        };
        await recordJob(result);
        return result;
    }
}

/**
 * OEM references of an article, from its complete record. One billed call each,
 * through the compressed cache, so an article already consulted costs nothing.
 */
export async function indexArticleDetails(
    articleId: number
): Promise<{ oemRows: number; apiCalls: number }> {
    const [existing] = await db
        .select({ detailsFetchedAt: tdArticle.detailsFetchedAt })
        .from(tdArticle)
        .where(eq(tdArticle.articleId, articleId))
        .limit(1);

    if (!existing) return { oemRows: 0, apiCalls: 0 };
    if (existing.detailsFetchedAt) return { oemRows: 0, apiCalls: 0 };

    let apiCalls = 0;
    const details = await getWithCompressedCache(`article_details_${articleId}`, async () => {
        apiCalls++;
        return rapidApi.getArticleDetails(articleId);
    });

    let oemRows = 0;
    for (const oem of details?.article?.oemNo ?? []) {
        if (!oem?.oemDisplayNo) continue;
        await db
            .insert(tdOem)
            .values({
                articleId,
                oemBrand: brandKey(oem.oemBrand ?? ""),
                oemNo: oem.oemDisplayNo,
                oemNoKey: refKeyRaw(oem.oemDisplayNo),
            })
            .onConflictDoNothing();
        oemRows++;
    }

    await db
        .update(tdArticle)
        .set({ detailsFetchedAt: new Date() })
        .where(eq(tdArticle.articleId, articleId));

    return { oemRows, apiCalls };
}

/** Articles whose complete record has not been fetched yet. */
export async function articlesMissingDetails(limit: number): Promise<number[]> {
    const rows = await db
        .select({ articleId: tdArticle.articleId })
        .from(tdArticle)
        .where(isNull(tdArticle.detailsFetchedAt))
        .limit(limit);
    return rows.map((r) => r.articleId);
}

export const BRAKING_CATEGORIES = CATEGORIES.map((c) => c.categoryId);