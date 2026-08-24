import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";

/** Constructeur automobile. Premier niveau de la cascade. */
export const manufacturers = sqliteTable("manufacturers", {
    manufacturerId: integer("manufacturer_id").primaryKey(),
    name: text("name").notNull(),
});

/** Modèle d'un constructeur, avec sa période de commercialisation. */
export const models = sqliteTable(
    "models",
    {
        modelId: integer("model_id").primaryKey(),
        manufacturerId: integer("manufacturer_id")
            .notNull()
            .references(() => manufacturers.manufacturerId),
        name: text("name").notNull(),
        yearFrom: text("year_from"),
        yearTo: text("year_to"),
    },
    (t) => ({
        byManufacturer: index("models_manufacturer_idx").on(t.manufacturerId),
    })
);

/**
 * Motorisation identifiée par son K-Type, pivot de toute l'application.
 *
 * `modelId` n'est volontairement pas une clé étrangère : les véhicules
 * compatibles d'un article arrivent avec leur modèle mais sans le constructeur,
 * donc on apprend des véhicules dont le modèle n'est pas encore en base.
 */
export const vehicles = sqliteTable(
    "vehicles",
    {
        vehicleId: integer("vehicle_id").primaryKey(),
        modelId: integer("model_id"),
        manufacturerName: text("manufacturer_name").notNull(),
        modelName: text("model_name").notNull(),
        typeEngineName: text("type_engine_name").notNull(),
        engineCodes: text("engine_codes"),
        engineId: integer("engine_id"),
        powerKw: real("power_kw"),
        powerPs: real("power_ps"),
        fuelType: text("fuel_type"),
        bodyType: text("body_type"),
        numberOfCylinders: integer("number_of_cylinders"),
        capacityLt: real("capacity_lt"),
        capacityTech: real("capacity_tech"),
        constructionIntervalStart: text("construction_interval_start"),
        constructionIntervalEnd: text("construction_interval_end"),
    },
    (t) => ({
        byModel: index("vehicles_model_idx").on(t.modelId),
        byEngineCodes: index("vehicles_engine_codes_idx").on(t.engineCodes),
    })
);

/** Équipementier. Le catalogue se limite à ceux listés dans ALLOWED_SUPPLIER_IDS. */
export const suppliers = sqliteTable("suppliers", {
    supplierId: integer("supplier_id").primaryKey(),
    name: text("name").notNull(),
});

/** Une référence, stockée une seule fois quel que soit le nombre de véhicules qu'elle équipe. */
export const articles = sqliteTable(
    "articles",
    {
        articleId: integer("article_id").primaryKey(),
        articleNo: text("article_no").notNull(),
        supplierId: integer("supplier_id")
            .notNull()
            .references(() => suppliers.supplierId),
        productId: integer("product_id"), // Article générique TecDoc, il détermine les critères attendus.
        productName: text("product_name"),
        eanNumber: text("ean_number"),
        mediaType: text("media_type"),
        mediaFileName: text("media_file_name"),
        imageUrl: text("image_url"),
        detailsFetchedAt: integer("details_fetched_at", { mode: "timestamp" }), // Posé une fois la fiche complète récupérée, avec ses critères et ses compatibilités.
    },
    (t) => ({
        bySupplier: index("articles_supplier_idx").on(t.supplierId),
        byArticleNo: index("articles_article_no_idx").on(t.articleNo),
    })
);

/**
 * Compatibilité entre une référence et un véhicule, pour une catégorie.
 *
 * Elle s'acquiert dans les deux sens : par véhicule via la liste d'articles, ou
 * par article via ses véhicules compatibles. Le second sens rend une centaine de
 * véhicules par appel, il est bien moins coûteux.
 */
export const fitments = sqliteTable(
    "fitments",
    {
        vehicleId: integer("vehicle_id")
            .notNull()
            .references(() => vehicles.vehicleId),
        articleId: integer("article_id")
            .notNull()
            .references(() => articles.articleId),
        categoryId: integer("category_id").notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.vehicleId, t.articleId, t.categoryId] }),
        byVehicleCategory: index("fitments_vehicle_category_idx").on(t.vehicleId, t.categoryId),
        byArticle: index("fitments_article_idx").on(t.articleId),
    })
);

/** Critère technique d'une référence. `type` sépare un critère filtrant d'un critère informatif. */
export const articleCriteria = sqliteTable(
    "article_criteria",
    {
        articleId: integer("article_id")
            .notNull()
            .references(() => articles.articleId),
        name: text("name").notNull(),
        value: text("value").notNull(),
        type: text("type"),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.articleId, t.name, t.value] }),
        byNameValue: index("article_criteria_name_value_idx").on(t.name, t.value),
    })
);

/** Trace qu'un couple véhicule/catégorie a été interrogé, pour distinguer « aucune pièce » de « pas encore cherché ». */
export const catalogSync = sqliteTable(
    "catalog_sync",
    {
        vehicleId: integer("vehicle_id")
            .notNull()
            .references(() => vehicles.vehicleId),
        categoryId: integer("category_id").notNull(),
        articleCount: integer("article_count").notNull().default(0),
        syncedAt: integer("synced_at", { mode: "timestamp" }).notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.vehicleId, t.categoryId] }),
    })
);

/**
 * Compte autorisé à ouvrir le catalogue.
 *
 * Un compte par franchisé, pour qu'une révocation n'atteigne que lui.
 * `passwordHash` embarque ses propres paramètres scrypt, ce qui permet de
 * relever le coût plus tard sans invalider les hachages existants.
 */
export const users = sqliteTable("users", {
    id: text("id").primaryKey(),
    username: text("username").notNull().unique(), // Mis en minuscules à l'écriture, le formulaire est insensible à la casse.
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    franchise: text("franchise"), 
    role: text("role").notNull().default("user"), // 'user' ou 'admin' 
    disabledAt: integer("disabled_at", { mode: "timestamp" }), // Renseigné pour révoquer l'accès sans perdre la trace du compte.
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp" }), // Connexion refusée jusqu'à cet instant, quel que soit le mot de passe.
    lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/**
 * Session ouverte, une ligne par connexion.
 *
 * `id` est le SHA-256 du jeton porté par le cookie, jamais le jeton lui-même :
 * un vol de cette table ne permet pas de rejouer un cookie.
 */
export const sessions = sqliteTable(
    "sessions",
    {
        id: text("id").primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
        lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull(),
        createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    },
    (t) => ({
        byUser: index("sessions_user_idx").on(t.userId),
        byExpiry: index("sessions_expires_idx").on(t.expiresAt),
    })
);

/** Dernier véhicule consulté par un utilisateur, pour le resélectionner après expiration du cache client. */
export const vehicleSelections = sqliteTable("vehicle_selections", {
    userId: text("user_id")
        .primaryKey()
        .references(() => users.id, { onDelete: "cascade" }),
    vehicleId: integer("vehicle_id")
        .notNull()
        .references(() => vehicles.vehicleId),
    selectedAt: integer("selected_at", { mode: "timestamp" }).notNull(),
});
