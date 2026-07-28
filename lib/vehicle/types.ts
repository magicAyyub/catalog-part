export interface ManufacturerOption {
    manufacturerId: number;
    manufacturerName: string;
}

export interface ModelOption {
    modelId: number;
    modelName: string;
    modelYearFrom: string;
    modelYearTo: string | null;
}

export interface EngineTypeOption {
    vehicleId: number;
    typeEngineName: string;
    powerKw: string;
    powerPs: string;
    fuelType: string;
    constructionIntervalStart: string;
    constructionIntervalEnd: string | null;
}

export interface SelectedVehicle {
    manufacturer: ManufacturerOption;
    model: ModelOption;
    engineType: EngineTypeOption;
}