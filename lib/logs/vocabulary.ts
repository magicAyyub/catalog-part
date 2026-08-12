/**
 * Turns a raw log line into something readable on the trace page.
 *
 * Log messages are written in English at the call sites and are effectively
 * technical identifiers, so they are not rewritten in place. They are mapped
 * here instead, which keeps the files greppable and the page in French.
 *
 * An unknown message falls back to its raw form rather than to a vague label:
 * showing English is better than showing something that might be wrong.
 */

export type Tone = "cost" | "free" | "plate" | "auth" | "batch" | "supplier" | "neutral";

/** Raw message to what the trace shows. */
const MESSAGES: Record<string, string> = {
    "RapidAPI HTTP call executed": "Appel facturé RapidAPI",

    "Local plate search request started": "Recherche par plaque reçue",
    "Plate search started via TecDoc pipeline": "Recherche par plaque lancée",
    "Plate lookup succeeded": "Plaque identifiée",
    "Plate lookup completed": "Plaque identifiée",
    "Plate lookup failed": "Échec de l'identification",
    "Plate translated to K-Type": "Plaque traduite en K-Type",
    "Plate translated to K-Type by Exadis": "Plaque traduite en K-Type par Exadis",
    "Plate identified by Exadis, vehicle already in the local index":
        "Plaque identifiée par Exadis, véhicule déjà dans l'index local",
    "Plate identified by app-etf": "Plaque identifiée par app-etf",
    "Plate identification step completed": "Étape d'identification terminée",
    "Exadis could not identify the plate, falling back to app-etf":
        "Exadis n'a pas su identifier la plaque, repli sur app-etf",
    "L2 Pre-calculated Index HIT": "Réponse servie par l'index pré-calculé",

    "K-Type resolved from the local index": "K-Type résolu depuis l'index local",
    "K-Type confirmed against TecDoc referential": "K-Type confirmé dans le référentiel TecDoc",

    "Exadis session opened": "Session Exadis ouverte",
    "B2B Plate lookup process initiated": "Consultation fournisseur lancée",
    "B2B Plate lookup completed successfully": "Consultation fournisseur terminée",
    "Vehicle record resolved": "Fiche véhicule lue chez le fournisseur",
    "Préférence active session reused from cache": "Session Préférence réutilisée",
    "Préférence session missing or expired — triggering login": "Session Préférence absente, connexion",
    "Préférence session missing or expired — triggering re-login":
        "Session Préférence expirée, reconnexion",
    "Session invalidated during search — retrying with fresh login":
        "Session invalidée en cours de recherche, nouvelle tentative",
    "app-etf plate lookup succeeded": "Consultation app-etf réussie",
    "app-etf plate lookup failed": "Consultation app-etf en échec",

    "Articles synced for category": "Articles synchronisés pour la catégorie",
    "Criteria synced for category": "Critères synchronisés pour la catégorie",
    "Criteria already known for some articles": "Critères déjà connus pour une partie des articles",
    "Criteria already cached for category — skipped": "Critères déjà en cache, étape sautée",
    "Vehicle category indexed successfully": "Catégorie indexée",
    "Braking fitment pass finished": "Passe de compatibilité freinage terminée",
    "Article not found in cached response": "Article absent de la réponse en cache",

    "Nocturne ETL indexer process initiated": "Indexation nocturne démarrée",
    "Nocturne ETL indexer process finished": "Indexation nocturne terminée",
    "Nightly preparation finished": "Préparation nocturne terminée",
    "Target vehicles loaded for indexing": "Véhicules à indexer chargés",
    "Vehicle warm-up started": "Réchauffage des véhicules démarré",
    "Vehicle warm-up finished": "Réchauffage des véhicules terminé",
    "Cache miss — warming vehicle from app-etf": "Cache absent, véhicule réchauffé depuis app-etf",
    "ETL time window limit reached. Stopping gracefully.":
        "Fenêtre de temps atteinte, arrêt propre",
    "WinPro CSV Sync completed successfully": "Import CSV WinPro terminé",

    "Sign-in accepted": "Connexion acceptée",
    "Rejected sign-in": "Connexion refusée",
    "Rejected sign-in on locked account": "Connexion refusée, compte bloqué",
    "Trace unlocked": "Trace déverrouillée",
    "Rejected trace unlock": "Déverrouillage de la trace refusé",

    "Server persistence warning": "Écriture en base en échec",
};

/**
 * Per action: the colour it deserves, and the two or three fields worth reading
 * without unfolding. Anything else stays behind the details toggle.
 */
const ACTIONS: Record<string, { tone: Tone; keys: string[] }> = {
    rapidapi_call: { tone: "cost", keys: ["path"] },

    "by-plate": { tone: "plate", keys: ["plate", "vehicleId", "confirmed"] },
    "by-plate-l2-hit": { tone: "free", keys: ["plate"] },
    plate_source: { tone: "plate", keys: ["plate", "kType", "source"] },
    plate_fallback: { tone: "supplier", keys: ["plate"] },
    exadis_ktype: { tone: "supplier", keys: ["plate", "kType", "brand", "model"] },
    ktype_resolved: { tone: "supplier", keys: ["plate", "kType", "brand", "model"] },
    by_plate_ok: { tone: "supplier", keys: ["plate", "kType", "productCount"] },
    by_plate_error: { tone: "supplier", keys: ["plate", "statusCode", "retryable"] },
    lookup_error: { tone: "supplier", keys: ["plate", "statusCode", "retryable"] },

    index_hit: { tone: "free", keys: ["kType", "manufacturerId", "modelId"] },
    confirmed: { tone: "neutral", keys: ["kType", "typeEngineName", "candidatesTried"] },
    unconfirmed: { tone: "neutral", keys: ["kType", "candidatesTried"] },

    searchByPlate: { tone: "supplier", keys: ["supplier", "plate"] },
    searchByPlate_complete: { tone: "supplier", keys: ["supplier", "brand", "partsFound"] },
    plateSearchStep: { tone: "supplier", keys: ["supplier"] },
    parseVehicle: { tone: "supplier", keys: ["brand", "model", "carId"] },
    session_reuse: { tone: "supplier", keys: ["supplier"] },
    session_retry: { tone: "supplier", keys: ["supplier"] },
    login: { tone: "supplier", keys: ["supplier"] },
    exadis_login: { tone: "supplier", keys: [] },

    articles_synced: {
        tone: "batch",
        keys: ["vehicleId", "returnedByApi", "keptAfterSupplierFilter"],
    },
    criteria_synced: { tone: "batch", keys: ["vehicleId", "apiCalls", "articles"] },
    criteria_reused: { tone: "free", keys: ["vehicleId", "articlesReused", "articlesToFetch"] },
    criteria_skipped: { tone: "free", keys: ["vehicleId", "categoryId"] },
    index_vehicle_success: { tone: "batch", keys: ["vehicleId", "category", "partsFound"] },
    fitment_done: { tone: "batch", keys: ["ok", "empty", "calls"] },
    vehicles_loaded: { tone: "batch", keys: ["totalVehicles"] },
    warm_vehicle: { tone: "batch", keys: ["vehicleId"] },
    night_run: { tone: "batch", keys: ["billedCalls", "budget"] },
    start: { tone: "batch", keys: ["mode", "targets", "maxVehicles"] },
    completed: { tone: "batch", keys: ["ok", "skipped", "failed"] },
    time_window_exceeded: { tone: "batch", keys: ["elapsedMinutes", "maxExecutionMinutes"] },

    "auth-login-success": { tone: "auth", keys: ["user"] },
    "auth-login-failed": { tone: "auth", keys: ["user", "failedAttempts", "reason"] },
    "auth-login-locked": { tone: "auth", keys: ["user"] },
    "logs-unlock-success": { tone: "auth", keys: ["user"] },
    "logs-unlock-failed": { tone: "auth", keys: ["user", "count"] },

    "article-detail": { tone: "neutral", keys: ["articleId", "vehicleId"] },
    "by-plate-db": { tone: "neutral", keys: [] },
    "sync-winpro-csv-success": { tone: "batch", keys: ["linesProcessed", "updatedCount"] },
};

/** Field names as the page shows them. */
const FIELDS: Record<string, string> = {
    plate: "plaque",
    kType: "K-Type",
    vehicleId: "véhicule",
    carId: "carId",
    manufacturerId: "marque",
    modelId: "modèle",
    brand: "marque",
    model: "modèle",
    typeEngineName: "motorisation",
    supplier: "fournisseur",
    source: "source",
    path: "endpoint",
    route: "route",
    user: "compte",
    reason: "motif",
    count: "tentative",
    failedAttempts: "échecs",
    attempt: "tentative",
    statusCode: "code HTTP",
    retryable: "réessayable",
    productCount: "pièces",
    partsFound: "pièces",
    articles: "articles",
    apiCalls: "appels",
    billedCalls: "appels facturés",
    budget: "budget",
    returnedByApi: "rendus par l'API",
    keptAfterSupplierFilter: "gardés après filtre",
    articlesReused: "articles réutilisés",
    articlesToFetch: "articles à acheter",
    candidatesTried: "modèles essayés",
    categoryId: "catégorie",
    category: "catégorie",
    articleId: "article",
    totalVehicles: "véhicules",
    linesProcessed: "lignes lues",
    updatedCount: "mises à jour",
    elapsedMinutes: "minutes écoulées",
    maxExecutionMinutes: "limite en minutes",
};

export function messageLabel(message: string): string {
    return MESSAGES[message] ?? message;
}

export function actionTone(action: string | undefined): Tone {
    return (action ? ACTIONS[action]?.tone : undefined) ?? "neutral";
}

export function promotedKeys(action: string | undefined): string[] {
    return (action ? ACTIONS[action]?.keys : undefined) ?? [];
}

export function fieldLabel(key: string): string {
    return FIELDS[key] ?? key;
}
