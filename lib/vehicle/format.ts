export function formatMonthYear(isoDate: string | null): string {
    if (!isoDate) return "...";
    const date = new Date(isoDate);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${month}/${date.getFullYear()}`;
}

export function formatDateRange(start: string | null, end: string | null): string {
    return `${formatMonthYear(start)} - ${formatMonthYear(end)}`;
}

export function formatEngineTypeLabel(engine: {
    typeEngineName: string;
    powerKw: string;
    powerPs: string;
    constructionIntervalStart: string;
    constructionIntervalEnd: string | null;
}): string {
    const kw = Math.round(Number(engine.powerKw));
    const ps = Math.round(Number(engine.powerPs));
    const dates = formatDateRange(engine.constructionIntervalStart, engine.constructionIntervalEnd);
    return `${engine.typeEngineName} (${kw}KW / ${ps}CH) (${dates})`;
}