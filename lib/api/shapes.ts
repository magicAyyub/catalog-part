import type { Manufacturer, Model, Vehicle } from "@/lib/db/queries/vehicles";
import type { ArticleDetail, CatalogArticle } from "@/lib/db/queries/catalog";

/**
 * Traduction des lignes de base vers le vocabulaire TecDoc que l'interface
 * consomme encore.
 *
 * Couche de compatibilité, à supprimer quand les composants passeront aux noms
 * du schéma. Elle évite de renommer quatre-vingts références dans neuf fichiers
 * pour un changement qui ne touche que le stockage.
 */

export function toApiManufacturer(row: Manufacturer) {
    return { manufacturerId: row.manufacturerId, manufacturerName: row.name };
}

export function toApiModel(row: Model) {
    return {
        modelId: row.modelId,
        modelName: row.name,
        modelYearFrom: row.yearFrom ?? "",
        modelYearTo: row.yearTo,
    };
}

export function toApiEngineType(row: Vehicle) {
    return {
        vehicleId: row.vehicleId,
        manufacturerName: row.manufacturerName,
        modelName: row.modelName,
        typeEngineName: row.typeEngineName,
        powerKw: row.powerKw,
        powerPs: row.powerPs,
        fuelType: row.fuelType,
        bodyType: row.bodyType,
        engineCodes: row.engineCodes,
        constructionIntervalStart: row.constructionIntervalStart,
        constructionIntervalEnd: row.constructionIntervalEnd,
    };
}

export function toApiArticle(row: CatalogArticle) {
    return {
        articleId: row.articleId,
        articleNo: row.articleNo,
        articleProductName: row.productName ?? "",
        productId: row.productId,
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        supplierLogoName: null,
        articleMediaType: row.mediaType,
        articleMediaFileName: row.mediaFileName,
        s3image: row.imageUrl,
        specs: row.criteria.map((c) => ({ criteriaName: c.name, criteriaValue: c.value })),
    };
}

export function toApiArticleDetail(row: ArticleDetail) {
    return { ...toApiArticle(row), eanNo: row.eanNumber };
}
