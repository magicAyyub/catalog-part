// Types déduits des réponses réelles de l'API auto-parts-catalog (RapidAPI).
// lang-id à utiliser partout : 6 (français).

export interface ApiManufacturer {
    manufacturerId: number;
    manufacturerName: string;
}
export interface ApiManufacturersResponse {
    countManufactures: number;
    manufacturers: ApiManufacturer[];
}

export interface ApiModel {
    modelId: number;
    modelName: string;
    modelYearFrom: string; // ISO date
    modelYearTo: string | null;
}
export interface ApiModelsResponse {
    countModels: number;
    models: ApiModel[];
}

export interface ApiEngineType {
    vehicleId: number;
    manufacturerName: string;
    modelName: string;
    typeEngineName: string;
    constructionIntervalStart: string;
    constructionIntervalEnd: string | null;
    powerKw: string; // renvoyé en string par l'API
    powerPs: string;
    capacityTax: string | null;
    fuelType: string;
    bodyType: string;
    numberOfCylinders: number;
    capacityLt: string;
    capacityTech: string;
    engineCodes: string;
    engId: number;
}
export interface ApiEngineTypesResponse {
    modelType: string;
    countModelTypes: number;
    modelTypes: ApiEngineType[];
}

// Arbre récursif : chaque clé est un categoryId (string), children peut être {} ou []
export interface ApiCategoryNode {
    text: string;
    children: Record<string, ApiCategoryNode> | [];
}
export interface ApiCategoriesResponse {
    categories: Record<string, ApiCategoryNode>;
}

export interface ApiArticleListItem {
    articleId: number;
    articleNo: string;
    supplierName: string;
    supplierId: number;
    articleProductName: string;
    productId: number;
    articleMediaType: string;
    articleMediaFileName: string;
    s3image: string;
}
export interface ApiArticleListResponse {
    vehicleId: string;
    categoryId: string;
    countArticles: number;
    articles: ApiArticleListItem[];
}

export interface ApiCompatibleCar {
    vehicleId: number;
    modelId: number;
    manufacturerName: string;
    modelName: string;
    typeEngineName: string;
    constructionIntervalStart: string;
    constructionIntervalEnd: string | null;
}
export interface ApiArticleDetails {
    article: {
        articleId: number;
        articleNo: string;
        articleProductName: string;
        supplierName: string;
        supplierId: number;
        articleMediaType: string;
        articleMediaFileName: string;
        articleInfo: {
            articleId: number;
            articleNo: string;
            supplierId: number;
            supplierName: string;
            isAccessory: number;
            articleProductName: string;
        };
        allSpecifications: { criteriaName: string; criteriaValue: string }[];
        eanNo: { eanNumbers: string } | null;
        oemNo: { oemBrand: string; oemDisplayNo: string }[];
        s3image: string;
        compatibleCars: ApiCompatibleCar[];
    };
}

export interface ApiSparePartCriteriaItem {
    articleId: number;
    criteriaName: string;
    criteriaValue: string;
    type: string; // ex: "MANDATORY,ONLY_ARTICLE"
}
export interface ApiSparePartCriteriaResponse {
    countArticles: number;
    articles: ApiSparePartCriteriaItem[];
}

export interface ApiSupplier {
    supplierId: number;
    supplierName: string;
    supplierMatchCode: string;
    supplierLogoName: string;
    s3image: string;
}

export interface ApiMediaItem {
    articleMediaType: string;
    articleMediaFileName: string;
    supplierId: number;
    mediaInformation: string;
    s3image: string;
}