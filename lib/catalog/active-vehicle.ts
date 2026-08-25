/**
 * Le véhicule actif, tel que `localStorage` le porte.
 *
 * `CatalogView` l'écrit pour retrouver les libellés au rechargement, que l'URL
 * ne peut pas transporter. La persistance du cache React Query le relit pour ne
 * garder que les pièces de ce véhicule : les clés étant `["parts", vehicleId,
 * categoryId]`, sans ce filtre chaque véhicule consulté ajouterait une entrée
 * et finirait par saturer les cinq mégaoctets du stockage.
 */

export const ACTIVE_VEHICLE_KEY = "catalog_active_vehicle";

/** `null` si rien n'est choisi, si le stockage est refusé, ou si le contenu est illisible. */
export function readActiveVehicleId(): number | null {
    try {
        const raw = localStorage.getItem(ACTIVE_VEHICLE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { vehicleId?: number };
        return parsed?.vehicleId ?? null;
    } catch {
        return null;
    }
}
