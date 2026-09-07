"use client";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export type SortOption = "pertinence" | "brand_asc" | "position" | "name_asc" | "price";

interface SortSelectProps {
    value: SortOption;
    onChange: (sort: SortOption) => void;
}

export function SortSelect({ value, onChange }: SortSelectProps) {
    return (
        <div className="flex items-center gap-2">
            <label htmlFor="sort-select" className="text-xs font-semibold text-txt2 shrink-0">
                Trier par :
            </label>
            <NativeSelect
                id="sort-select"
                value={value}
                onChange={(e) => onChange(e.target.value as SortOption)}
                className="w-44 text-xs font-medium"
            >
                <NativeSelectOption value="pertinence">Pertinence (ETF en tête)</NativeSelectOption>
                <NativeSelectOption value="brand_asc">Marque (A → Z)</NativeSelectOption>
                <NativeSelectOption value="position">Position (Essieu avant / arrière)</NativeSelectOption>
                <NativeSelectOption value="name_asc">Désignation (A → Z)</NativeSelectOption>
                <NativeSelectOption value="price" disabled>
                    Prix (sur devis)
                </NativeSelectOption>
            </NativeSelect>
        </div>
    );
}
