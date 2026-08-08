import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";

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
// ═══════════════════════════════════════════════════════════════════════════
//  CATALOGUE FREINAGE — modèle en trois natures de données
// ═══════════════════════════════════════════════════════════════════════════
//
// Les tables ci-dessus (articles, article_specifications, article_criteria_facets)
// mélangeaient trois choses de durées de vie très différentes dans une même
// ligne : le référentiel technique, l'applicabilité véhicule, et le prix. Elles
// stockaient aussi une référence BOSCH autant de fois qu'elle équipe de
// véhicules, ce qui interdit de partager ses caractéristiques.
//
// Le découpage retenu :
//
//   RÉFÉRENTIEL   immuable        une ligne par référence, jamais dupliquée
//   APPLICABILITÉ semi-stable     quelle référence va sur quel véhicule
//   OFFRE         volatile        prix et stock, par grossiste
//   ÉQUIVALENCE   dérivé          reconstructible à tout moment
//
// Conséquence voulue : ajouter un équipementier plus tard ne demande d'indexer
// que ses articles, pas de rebalayer le parc.

/** RÉFÉRENTIEL — un équipementier TecDoc (BOSCH, TRW, ETF…). */
export const tdSupplier = sqliteTable("td_supplier", {
    supplierId: integer("supplier_id").primaryKey(),
    supplierName: text("supplier_name").notNull(),
});

/**
 * RÉFÉRENTIEL — une référence, stockée UNE seule fois.
 *
 * `articleNoKey` est la référence normalisée (majuscules, sans séparateurs ni
 * suffixe d'entrepôt) : c'est la clé de jointure avec les offres des grossistes,
 * qui ne connaissent pas les articleId TecDoc.
 */
export const tdArticle = sqliteTable(
    "td_article",
    {
        articleId: integer("article_id").primaryKey(),
        articleNo: text("article_no").notNull(),
        articleNoKey: text("article_no_key").notNull(),
        supplierId: integer("supplier_id")
            .notNull()
            .references(() => tdSupplier.supplierId),
        brandKey: text("brand_key").notNull(),
        /** Article générique TecDoc : c'est lui qui détermine le jeu de critères. */
        productId: integer("product_id"),
        productName: text("product_name"),
        imageUrl: text("image_url"),
        /** Renseigné dès que la fiche complète a été récupérée. */
        detailsFetchedAt: integer("details_fetched_at", { mode: "timestamp" }),
    },
    (t) => ({
        byKey: index("td_article_key_idx").on(t.brandKey, t.articleNoKey),
        bySupplier: index("td_article_supplier_idx").on(t.supplierId),
    })
);

/** RÉFÉRENTIEL — caractéristiques techniques d'une référence (46 critères observés). */
export const tdCriteria = sqliteTable(
    "td_criteria",
    {
        articleId: integer("article_id")
            .notNull()
            .references(() => tdArticle.articleId),
        criteriaName: text("criteria_name").notNull(),
        criteriaValue: text("criteria_value").notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.articleId, t.criteriaName, t.criteriaValue] }),
        byArticle: index("td_criteria_article_idx").on(t.articleId),
        // Sert l'index inversé des facettes quand le filtrage passera côté serveur.
        byValue: index("td_criteria_value_idx").on(t.criteriaName, t.criteriaValue),
    })
);

/** RÉFÉRENTIEL — références constructeur, arêtes d'équivalence de type « oem ». */
export const tdOem = sqliteTable(
    "td_oem",
    {
        articleId: integer("article_id")
            .notNull()
            .references(() => tdArticle.articleId),
        oemBrand: text("oem_brand").notNull(),
        oemNo: text("oem_no").notNull(),
        oemNoKey: text("oem_no_key").notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.articleId, t.oemBrand, t.oemNoKey] }),
        byKey: index("td_oem_key_idx").on(t.oemNoKey),
    })
);

/** RÉFÉRENTIEL — numéros WVA, arêtes d'équivalence de type « wva ». */
export const tdWva = sqliteTable(
    "td_wva",
    {
        articleId: integer("article_id")
            .notNull()
            .references(() => tdArticle.articleId),
        wva: text("wva").notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.articleId, t.wva] }),
        byWva: index("td_wva_idx").on(t.wva),
    })
);

/** APPLICABILITÉ — un véhicule, identifié par son K-Type TecDoc. */
export const tdVehicle = sqliteTable(
    "td_vehicle",
    {
        vehicleId: integer("vehicle_id").primaryKey(),
        manufacturerId: integer("manufacturer_id"),
        manufacturerName: text("manufacturer_name").notNull(),
        modelId: integer("model_id"),
        modelName: text("model_name").notNull(),
        typeEngineName: text("type_engine_name").notNull(),
        powerKw: real("power_kw"),
        powerPs: real("power_ps"),
        fuelType: text("fuel_type"),
        bodyType: text("body_type"),
        engineCodes: text("engine_codes"),
        /** Bornes de production, pour les requêtes d'applicabilité par millésime. */
        ctorStart: text("ctor_start"),
        ctorEnd: text("ctor_end"),
    },
    (t) => ({
        byModel: index("td_vehicle_model_idx").on(t.modelId),
        byInterval: index("td_vehicle_interval_idx").on(t.ctorStart, t.ctorEnd),
    })
);

/**
 * APPLICABILITÉ — quelle référence équipe quel véhicule, pour quelle catégorie.
 *
 * C'est la table many-to-many qui remplace la duplication d'articles par
 * véhicule. Elle porte le `productId` observé, parce que le même article peut
 * relever d'articles génériques différents selon la catégorie.
 */
export const tdFitment = sqliteTable(
    "td_fitment",
    {
        vehicleId: integer("vehicle_id")
            .notNull()
            .references(() => tdVehicle.vehicleId),
        articleId: integer("article_id")
            .notNull()
            .references(() => tdArticle.articleId),
        categoryId: integer("category_id").notNull(),
        productId: integer("product_id"),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.vehicleId, t.articleId, t.categoryId] }),
        // L'accès principal de l'application : les pièces d'un véhicule pour un onglet.
        byVehicleCategory: index("td_fitment_vehicle_cat_idx").on(t.vehicleId, t.categoryId),
        byArticle: index("td_fitment_article_idx").on(t.articleId),
    })
);

/**
 * OFFRE — prix et stock chez un grossiste.
 *
 * Volontairement clé sur (marque, référence normalisée, grossiste) et non sur
 * articleId : les portails ne connaissent pas les identifiants TecDoc. C'est ce
 * couple qui fait le pont entre le référentiel et le commerce.
 */
export const supplierOffer = sqliteTable(
    "supplier_offer",
    {
        brandKey: text("brand_key").notNull(),
        articleNoKey: text("article_no_key").notNull(),
        /** 'preference' | 'exadis' | 'winpro' … */
        source: text("source").notNull(),
        priceNet: real("price_net"),
        priceGross: real("price_gross"),
        discountPct: real("discount_pct"),
        stockLabel: text("stock_label"),
        inStock: integer("in_stock", { mode: "boolean" }),
        fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.brandKey, t.articleNoKey, t.source] }),
        byFreshness: index("supplier_offer_fetched_idx").on(t.fetchedAt),
    })
);

/**
 * ÉQUIVALENCE — arêtes typées entre références.
 *
 * `kind` porte la force du lien : 'curated' (affirmé par le catalogue ETF),
 * 'wva' (même numéro WVA), 'oem' (même référence constructeur). Le regroupement
 * en grappes ne fusionne que sur les arêtes fortes et refuse toute fusion qui
 * violerait la compatibilité dimensionnelle — de sorte que la contamination
 * observée chez app-etf (un ETF destiné à une autre voiture remontant par
 * WVA) devient impossible par construction, au lieu d'être signalée après coup.
 */
export const equivalenceEdge = sqliteTable(
    "equivalence_edge",
    {
        articleIdA: integer("article_id_a").notNull(),
        articleIdB: integer("article_id_b").notNull(),
        kind: text("kind").notNull(),
        evidence: text("evidence"),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.articleIdA, t.articleIdB, t.kind] }),
        byA: index("equivalence_edge_a_idx").on(t.articleIdA),
    })
);

/** ÉQUIVALENCE — grappes matérialisées (sortie de l'union-find, recalculable). */
export const equivalenceCluster = sqliteTable(
    "equivalence_cluster",
    {
        articleId: integer("article_id").primaryKey(),
        clusterId: integer("cluster_id").notNull(),
    },
    (t) => ({
        byCluster: index("equivalence_cluster_idx").on(t.clusterId),
    })
);

/**
 * SUIVI — une ligne par (véhicule, catégorie) indexé.
 *
 * Rend l'indexation reprenable et, surtout, auditable : c'est cette table qui
 * alimentera le rapport de couverture, et qui permet de savoir ce que le
 * catalogue a réellement coûté en appels facturés.
 */
export const indexJob = sqliteTable(
    "index_job",
    {
        vehicleId: integer("vehicle_id").notNull(),
        categoryId: integer("category_id").notNull(),
        /** 'ok' | 'empty' | 'error' */
        status: text("status").notNull(),
        articlesFound: integer("articles_found").notNull().default(0),
        articlesKept: integer("articles_kept").notNull().default(0),
        criteriaRows: integer("criteria_rows").notNull().default(0),
        apiCalls: integer("api_calls").notNull().default(0),
        durationMs: integer("duration_ms"),
        error: text("error"),
        indexedAt: integer("indexed_at", { mode: "timestamp" }).notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.vehicleId, t.categoryId] }),
        byStatus: index("index_job_status_idx").on(t.status),
    })
);
