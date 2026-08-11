import Link from "next/link";
import { Activity } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { UserMenu } from "./user-menu";

function BrandMark() {
    return (
        <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-md bg-royal font-mono text-base font-bold leading-none text-white shadow-sm">
                J
            </span>
            <div className="flex flex-col leading-tight">
                <span className="font-heading text-sm font-bold text-navy">JUMBO PNEUS</span>
                <span className="text-[10px] uppercase tracking-wider text-txt2">
                    Catalogue pièces · Espace franchisé
                </span>
            </div>
        </div>
    );
}

export async function SiteHeader() {
    const user = await getCurrentUser();

    return (
        <header className="sticky top-0 z-30 border-b border-stroke bg-white/85 backdrop-blur-md">
            <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-4 px-4 sm:px-6 lg:px-8">
                <Link href="/" aria-label="Accueil du catalogue">
                    <BrandMark />
                </Link>
                {user && (
                    <>
                        <Link
                            href="/logs"
                            className="ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-txt2 transition-colors hover:bg-muted hover:text-navy"
                        >
                            <Activity className="size-4" />
                            <span className="hidden sm:inline">Trace</span>
                        </Link>
                        <UserMenu
                            label={user.displayName || user.username}
                            franchise={user.franchise}
                        />
                    </>
                )}
            </div>
        </header>
    );
}
