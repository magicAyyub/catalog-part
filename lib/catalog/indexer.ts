/**
 * lib/catalog/indexer.ts
 *
 * Acquisition du catalogue freinage depuis TecDoc vers les tables `td_*`.
 *
 * Principe : RapidAPI est un canal d'acquisition ponctuel, pas une dépendance
 * d'exécution. Un couple (véhicule, catégorie) est payé une fois, puis servi
 * gratuitement pour toujours. Comme une référence n'est stockée qu'une seule
 * fois — `td_article` est clé sur `articleId` seul —, ses caractéristiques
 * profitent à tous les véhicules qu'elle équipe : le coût marginal décroît à
 * mesure que le catalogue grandit.
 *
 * Deux passes, séparées parce que leur coût diffère d'un ordre de grandeur :
 *
 *   Passe 1 (« fitment »)   ~10 appels par véhicule
 *                           articles + critères + WVA
 *   Passe 2 (« details »)   1 appel par ARTICLE, sur demande explicite
 *                           références OEM, EAN, compatibilités
 *
 * Les numéros WVA n’exigent pas la passe 2 : ils figurent parmi les 40 critères
 * (« numéro WVA »), donc la passe 1 les récupère sans appel supplémentaire.
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

/** Nom de critère portant le numéro WVA (orthographe TecDoc, minuscule). */
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
 * Garantit une ligne `td_vehicle`, requise par la clé étrangère de `td_fitment`.
 *
 * Reprend les libellés de l'ancienne table `vehicles` quand le véhicule y est
 * déjà connu. Sinon, crée une fiche minimale : l'indexation des pièces ne dépend
 * que du K-Type, les libellés peuvent être enrichis plus tard sans repayer les
 * appels.
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

/** A-t-on déjà payé ce couple (véhicule, catégorie) ? */
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

/**
 * Passe 1 : articles, applicabilité, critères et WVA d'un couple
 * (véhicule, catégorie).
 */
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
         * Les caractéristiques appartiennent à la RÉFÉRENCE, pas au véhicule.
         *
         * Vérifié sur données réelles : indexer la 307 2.0 HDi après la 307
         * 1.6 16V a traité 879 lignes de critères pour n'en apporter que 10 —
         * exactement celles des 2 seules références nouvelles sur 93. Les 869
         * autres étaient identiques au triplet près.
         *
         * On n'interroge donc que les couples (article générique, équipementier)
         * qui couvrent au moins une référence encore dépourvue de
         * caractéristiques. Sur un véhicule frère, le coût marginal tombe de
         * ~11 appels à 1 seul : la liste d'articles.
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
 * Passe 2 : références OEM d'un article, depuis sa fiche complète.
 *
 * Un appel par article, contre ~10 par véhicule pour la passe 1 : c'est le poste
 * coûteux, donc explicitement optionnel. Il passe par le cache compressé, donc
 * un article déjà consulté dans l'application ne coûte rien.
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

/** Articles dont la fiche complète n'a pas encore été récupérée. */
export async function articlesMissingDetails(limit: number): Promise<number[]> {
    const rows = await db
        .select({ articleId: tdArticle.articleId })
        .from(tdArticle)
        .where(isNull(tdArticle.detailsFetchedAt))
        .limit(limit);
    return rows.map((r) => r.articleId);
}

export const BRAKING_CATEGORIES = CATEGORIES.map((c) => c.categoryId);