import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleGallery } from "@/components/parts/detail/article-gallery";
import { CompatibleCars } from "@/components/parts/detail/compatible-cars";
import { DetailRow } from "@/components/parts/detail/detail-row";
import { OemReferences } from "@/components/parts/detail/oem-references";
import { Specifications } from "@/components/parts/detail/specifications";
import { withRequestContext } from "@/lib/logs/request-context";
import { loadArticleDetail, loadArticleMedia } from "@/lib/parts/article-detail";

/**
 * Detail of one reference, at its own address.
 *
 * Rendered on the server through `loadArticleDetail`, the same function the API
 * route calls, so a page view costs exactly what a fetch cost before: nothing.
 * The remote half sits behind a permanent compressed cache.
 *
 * `retour` carries the catalog querystring the visitor came from, so the back
 * link lands on the exact screen they left. Browser back does the same on its
 * own; the link exists for a URL received from someone else.
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

    const [detail, media] = await withRequestContext("piece", async () =>
        Promise.all([loadArticleDetail(id), loadArticleMedia(id)])
    );

    const article = detail?.article;
    if (!article) notFound();

    const { retour } = await searchParams;
    const backHref = retour ? `/?${retour}` : "/";

    // L'image principale d'abord, puis la galerie, sans doublon.
    const images = [...new Set([article.s3image, ...media.map((m) => m.s3image)].filter(Boolean))];

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
                <h1 className="font-heading text-2xl font-bold text-navy">
                    {article.articleProductName}
                </h1>
                <p className="font-mono text-sm text-muted-foreground">{article.articleNo}</p>
            </header>

            <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
                <div className="lg:sticky lg:top-6">
                    <ArticleGallery images={images} alt={article.articleProductName} />

                    <dl className="mt-6 flex flex-col gap-4 rounded-lg border border-stroke p-4">
                        <DetailRow
                            label="Référence"
                            value={<span className="font-mono">{article.articleNo}</span>}
                        />
                        <DetailRow label="Fournisseur" value={article.supplierName} />
                        {article.eanNo && (
                            <DetailRow
                                label="Code EAN"
                                value={<span className="font-mono">{article.eanNo.eanNumbers}</span>}
                            />
                        )}
                    </dl>
                </div>

                {/* Les spécifications d'abord : c'est ce qu'on lit au comptoir.
                    Les références OEM ferment la marche, repliées. */}
                <div className="flex min-w-0 flex-col gap-8">
                    <Specifications specs={article.allSpecifications} />
                    <CompatibleCars cars={article.compatibleCars} />
                    <OemReferences refs={article.oemNo} />
                </div>
            </div>
        </main>
    );
}
