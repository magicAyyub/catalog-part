import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";

/**
 * Un véhicule sélectionné/synchronisé (issu de Engine_Types_by_Model).
 * On le cache pour ne pas rappeler la cascade marque/modèle/moteur à chaque affichage.
 */
export const vehicles = sqliteTable("vehicles", {
    vehicleId: integer("vehicle_id").primaryKey(),
    manufacturerId: integer("manufacturer_id").notNull(),
    manufacturerName: text("manufacturer_name").notNull(),
    modelId: integer("model_id").notNull(),
    modelName: text("model_name").notNull(),
    typeEngineName: text("type_engine_name").notNull(),
    powerKw: real("power_kw"),
    powerPs: real("power_ps"),
    fuelType: text("fuel_type"),
    bodyType: text("body_type"),
    constructionIntervalStart: text("construction_interval_start"),
    constructionIntervalEnd: text("construction_interval_end"),
    syncedAt: integer("synced_at", { mode: "timestamp" }),
});

/**
 * Catégories qu'on gère (en dur, pas besoin de synchroniser l'arbre complet TecDoc).
 * 100030 = Plaquettes de frein, 100032 = Disques de frein.
 */
export const categories = sqliteTable("categories", {
    categoryId: integer("category_id").primaryKey(),
    labelFr: text("label_fr").notNull(),
    labelEn: text("label_en"),
});

/**
 * Fournisseurs (référentiel global, indépendant du véhicule).
 * Alimenté une seule fois via List_All_Suppliers.
 */
export const suppliers = sqliteTable("suppliers", {
    supplierId: integer("supplier_id").primaryKey(),
    supplierName: text("supplier_name").notNull(),
    supplierMatchCode: text("supplier_match_code"),
    supplierLogoName: text("supplier_logo_name"),
    s3image: text("s3image"),
});

/**
 * Un article tel qu'il apparaît dans Article_List_by_Vehicle_ID__Category_ID
 * pour un véhicule + une catégorie donnés.
 * Clé composite car le même articleId peut apparaître pour plusieurs vehicleId/categoryId.
 */
export const articles = sqliteTable(
    "articles",
    {
        articleId: integer("article_id").notNull(),
        vehicleId: integer("vehicle_id")
            .notNull()
            .references(() => vehicles.vehicleId),
        categoryId: integer("category_id")
            .notNull()
            .references(() => categories.categoryId),
        articleNo: text("article_no").notNull(),
        articleProductName: text("article_product_name").notNull(),
        productId: integer("product_id"),
        supplierId: integer("supplier_id")
            .notNull()
            .references(() => suppliers.supplierId),
        articleMediaType: text("article_media_type"),
        articleMediaFileName: text("article_media_file_name"),
        s3image: text("s3image"),
        priceNet: real("price_net"),
        priceBase: real("price_base"),
        discountLabel: text("discount_label"),
        inStock: integer("in_stock", { mode: "boolean" }),
        stockLabel: text("stock_label"),
    },
    (table) => ({
        pk: primaryKey({ columns: [table.articleId, table.vehicleId, table.categoryId] }),
    })
);

/**
 * Specs détaillées d'un article (allSpecifications d'Article_Details).
 * Rempli en lazy-load (cache-on-read) quand on ouvre une fiche produit,
 * pas préchargé pour tous les articles.
 */
export const articleSpecifications = sqliteTable("article_specifications", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    articleId: integer("article_id").notNull(),
    criteriaName: text("criteria_name").notNull(),
    criteriaValue: text("criteria_value").notNull(),
});

/**
 * Facettes agrégées pour un couple (vehicleId, categoryId), calculées à la sync
 * en bouclant Vehicle_Spare_Part_Criteria sur chaque supplierId distinct.
 * distinctValues stocke la liste JSON des valeurs possibles pour construire les checkboxes.
 */
export const articleCriteriaFacets = sqliteTable("article_criteria_facets", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    vehicleId: integer("vehicle_id").notNull(),
    categoryId: integer("category_id").notNull(),
    criteriaName: text("criteria_name").notNull(),
    type: text("type"), // ex: "MANDATORY,ONLY_ARTICLE"
    distinctValuesJson: text("distinct_values_json").notNull(), // JSON.stringify(string[])
});

/**
 * Véhicules compatibles avec un article (compatibleCars d'Article_Details).
 * Rempli en lazy-load quand la fiche produit est consultée.
 */
export const articleCompatibleCars = sqliteTable("article_compatible_cars", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    articleId: integer("article_id").notNull(),
    vehicleId: integer("vehicle_id").notNull(),
    modelId: integer("model_id"),
    manufacturerName: text("manufacturer_name").notNull(),
    modelName: text("model_name").notNull(),
    typeEngineName: text("type_engine_name").notNull(),
    constructionIntervalStart: text("construction_interval_start"),
    constructionIntervalEnd: text("construction_interval_end"),
});

export const apiCache = sqliteTable("api_cache", {
    key: text("key").primaryKey(),
    valueJson: text("value_json").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/**
 * Index pré-calculé hors-ligne (L2 Cache) pour la résolution instantanée O(log N) par véhicule/catégorie.
 */
export const etfLookupIndex = sqliteTable("etf_lookup_index", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    vehicleId: integer("vehicle_id").notNull(),
    categoryId: integer("category_id").notNull(),
    vehicleJson: text("vehicle_json").notNull(),
    productsJson: text("products_json").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});