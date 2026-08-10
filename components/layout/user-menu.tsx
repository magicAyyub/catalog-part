"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface UserMenuProps {
    label: string;
    franchise: string | null;
}

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
        <div className="ml-auto flex items-center gap-3">
            <div className="hidden flex-col items-end leading-tight sm:flex">
                <span className="text-sm font-medium text-navy">{label}</span>
                {franchise && (
                    <span className="text-[10px] uppercase tracking-wider text-txt2">{franchise}</span>
                )}
            </div>
            <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                disabled={isSigningOut}
                aria-label="Se déconnecter"
            >
                <LogOut />
                <span className="hidden sm:inline">Déconnexion</span>
            </Button>
        </div>
    );
}
