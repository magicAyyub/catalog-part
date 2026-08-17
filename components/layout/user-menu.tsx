"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, LayoutGrid, LogOut, ScrollText, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface UserMenuProps {
    label: string;
    franchise: string | null;
}

/**
 * The only way into the trace and account pages. Both sit behind their own
 * password, so listing them here costs nothing and saves knowing the URLs by
 * heart, which nobody will in a year.
 */
export function UserMenu({ label, franchise }: UserMenuProps) {
    const router = useRouter();
    const [isSigningOut, setIsSigningOut] = useState(false);

    async function handleSignOut() {
        setIsSigningOut(true);
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } finally {
            // Même si l'appel échoue, on renvoie vers /login : le middleware
            // tranchera, et l'utilisateur n'est pas coincé sur une page fermée.
            router.replace("/login");
            router.refresh();
        }
    }

    return (
        <div className="ml-auto flex items-center">
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={<Button variant="ghost" className="h-10 gap-2 px-2 sm:px-3" />}
                >
                    <span className="flex size-7 items-center justify-center rounded-full bg-royal/10 font-heading text-xs font-bold text-royal">
                        {label.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="hidden flex-col items-start leading-tight sm:flex">
                        <span className="text-sm font-medium text-navy">{label}</span>
                        {franchise && (
                            <span className="text-[10px] uppercase tracking-wider text-txt2">
                                {franchise}
                            </span>
                        )}
                    </span>
                    <ChevronDown className="text-txt2" aria-hidden="true" />
                </DropdownMenuTrigger>

                <DropdownMenuContent className="w-56" align="end">
                    <DropdownMenuGroup>
                        {/* Base UI exige que le libellé soit dans un groupe. */}
                        <DropdownMenuLabel className="sm:hidden">
                            {label}
                            {franchise ? ` · ${franchise}` : ""}
                        </DropdownMenuLabel>
                        <DropdownMenuItem render={<Link href="/" />}>
                            <LayoutGrid aria-hidden="true" />
                            Catalogue
                        </DropdownMenuItem>
                        <DropdownMenuItem render={<Link href="/logs" />}>
                            <ScrollText aria-hidden="true" />
                            Trace du système
                        </DropdownMenuItem>
                        <DropdownMenuItem render={<Link href="/comptes" />}>
                            <Users aria-hidden="true" />
                            Comptes franchisés
                        </DropdownMenuItem>
                    </DropdownMenuGroup>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                        variant="destructive"
                        disabled={isSigningOut}
                        onClick={handleSignOut}
                    >
                        <LogOut aria-hidden="true" />
                        Déconnexion
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
