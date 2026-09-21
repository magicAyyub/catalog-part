"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, LayoutGrid, LogOut, ScrollText, Sparkles, Users } from "lucide-react";
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
    role?: string;
}

export function UserMenu({ label, franchise, role }: UserMenuProps) {
    const router = useRouter();
    const [isSigningOut, setIsSigningOut] = useState(false);
    const isAdmin = role === "admin";

    async function handleSignOut() {
        setIsSigningOut(true);
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } finally {
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
                    <span className="flex size-7 items-center justify-center rounded-full bg-pine/10 font-heading text-xs font-bold text-ink">
                        {label.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="hidden flex-col items-start leading-tight sm:flex">
                        <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                            {label}
                            {isAdmin && (
                                <span className="rounded bg-pine/10 px-1 py-0.2 text-[9px] font-bold text-pine uppercase">
                                    Admin
                                </span>
                            )}
                        </span>
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
                        <DropdownMenuLabel className="sm:hidden">
                            {label}
                            {franchise ? ` · ${franchise}` : ""}
                        </DropdownMenuLabel>
                        <DropdownMenuItem render={<Link href="/" />}>
                            <LayoutGrid aria-hidden="true" />
                            Catalogue
                        </DropdownMenuItem>
                        {isAdmin && (
                            <>
                                <DropdownMenuItem render={<Link href="/ai-demo" />}>
                                    <Sparkles aria-hidden="true" />
                                    Démo Assistant IA
                                </DropdownMenuItem>
                                <DropdownMenuItem render={<Link href="/logs" />}>
                                    <ScrollText aria-hidden="true" />
                                    Trace du système
                                </DropdownMenuItem>
                                <DropdownMenuItem render={<Link href="/comptes" />}>
                                    <Users aria-hidden="true" />
                                    Comptes franchisés
                                </DropdownMenuItem>
                            </>
                        )}
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
