// Palette de couleurs de fond neutres, choisies pour rester lisibles avec une lettre blanche dessus.
const PALETTE = [
    "bg-slate-500",
    "bg-red-500",
    "bg-orange-500",
    "bg-amber-500",
    "bg-emerald-500",
    "bg-teal-500",
    "bg-sky-500",
    "bg-indigo-500",
    "bg-violet-500",
    "bg-pink-500",
] as const;

function hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = (hash << 5) - hash + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

export function getBrandInitial(name: string): string {
    return name.trim().charAt(0).toUpperCase();
}

export function getBrandColorClass(name: string): string {
    const index = hashString(name) % PALETTE.length;
    return PALETTE[index];
}