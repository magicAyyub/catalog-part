import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleGallery } from "@/components/parts/detail/article-gallery";
import { CompatibleCars } from "@/components/parts/detail/compatible-cars";
import { DetailRow } from "@/components/parts/detail/detail-row";
import { Specifications } from "@/components/parts/detail/specifications";
import { withRequestContext } from "@/lib/logs/request-context";
import { getArticleDetail } from "@/lib/acquisition/catalog";
import { listArticleVehicles } from "@/lib/db/queries/catalog";

/**
 * Fiche d'une référence, à son adresse propre.
 *
 * Rendue côté serveur par `getArticleDetail`, la même fonction que la route
 * API : l'ouverture enrichit la référence une fois, puis ne coûte plus rien.
 *
 * `retour` porte la querystring du catalogue d'où vient le visiteur, pour que
 * le lien de retour retombe sur l'écran qu'il a quitté.
 */
export default async function ArticlePage({
    params,
    searchParams,
}: {
    params: Promise<{ articleId: string }>;
    searchParams: Promise<{ retour?: string }>;
}) {
    const { articleId } = await params;
    const id = Number(articleId);
    if (!id) notFound();

    const article = await withRequestContext("piece", () => getArticleDetail(id));
    if (!article) notFound();

    const compatibleCars = await listArticleVehicles(id);

    const { retour } = await searchParams;
    const backHref = retour ? `/?${retour}` : "/";

    const images = [article.imageUrl].filter((url): url is string => Boolean(url));
    const specs = article.criteria.map((c) => ({ criteriaName: c.name, criteriaValue: c.value }));
    const productName = article.productName ?? article.articleNo;

    return (
        <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
            <Link
                href={backHref}
                className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
                <svg
                    className="size-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Retour au catalogue
            </Link>

            <header className="mb-8 flex flex-col gap-1">
                <p className="text-sm font-medium text-txt2">{article.supplierName}</p>
                <h1 className="font-heading text-2xl font-bold text-navy">{productName}</h1>
                <p className="font-mono text-sm text-muted-foreground">{article.articleNo}</p>
            </header>

            <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
                <div className="lg:sticky lg:top-6">
                    <ArticleGallery images={images} alt={productName} />

                    <dl className="mt-6 flex flex-col gap-4 rounded-lg border border-stroke p-4">
                        <DetailRow
                            label="Référence"
                            value={<span className="font-mono">{article.articleNo}</span>}
                        />
                        <DetailRow label="Fournisseur" value={article.supplierName} />
                        {article.eanNumber && (
                            <DetailRow
                                label="Code EAN"
                                value={<span className="font-mono">{article.eanNumber}</span>}
                            />
                        )}
                    </dl>
                </div>

                {/* Les spécifications d'abord : c'est ce qu'on lit au comptoir. */}
                <div className="flex min-w-0 flex-col gap-8">
                    <Specifications specs={specs} />
                    <CompatibleCars cars={compatibleCars} />
                </div>
            </div>
        </main>
    );
}
