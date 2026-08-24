import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { UserMenu } from "./user-menu";

/**
 * Le logo officiel est en blanc et or, dessiné pour un fond sombre. On lui pose
 * donc son pavé vert plutôt que de le recoloriser.
 */
function BrandMark() {
    return (
        <div className="flex items-center gap-3">
            <span className="flex h-14 items-center bg-pine px-4">
                <Image
                    src="/jumbo-pneus.svg"
                    alt="Jumbo Pneus"
                    width={140}
                    height={26}
                    priority
                    className="h-5 w-auto sm:h-6"
                />
            </span>
            <span className="hidden text-xs uppercase tracking-wider text-txt2 sm:block">
                Espace franchisé
            </span>
        </div>
    );
}

export async function SiteHeader() {
    const user = await getCurrentUser();

    return (
        <header className="sticky top-0 z-30 border-b border-stroke bg-white/85 backdrop-blur-md">
            <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-4 pr-4 sm:pr-6 lg:pr-8">
                <Link href="/" aria-label="Accueil du catalogue">
                    <BrandMark />
                </Link>
                {user && (
                    <UserMenu
                        label={user.displayName || user.username}
                        franchise={user.franchise}
                    />
                )}
            </div>
        </header>
    );
}
