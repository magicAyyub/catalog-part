import { Suspense } from "react";
import { CatalogView } from "@/components/catalog/catalog-view";

/**
 * The catalog reads its state from the URL, which `useSearchParams` requires a
 * Suspense boundary above. Keeping this page on the server is what provides it.
 */
export default function Home() {
    return (
        <Suspense fallback={null}>
            <CatalogView />
        </Suspense>
    );
}
