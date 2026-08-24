"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export function LoginForm({ next }: { next: string }) {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });

            if (!res.ok) {
                const body = await res.json().catch(() => null);
                setError(body?.error ?? "Connexion impossible. Réessayez.");
                setPassword("");
                return;
            }

            // refresh() pour que le layout serveur relise la session et affiche l'utilisateur.
            router.replace(next);
            router.refresh();
        } catch {
            setError("Serveur injoignable. Vérifiez votre connexion.");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-5"
        >
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="username">Identifiant</Label>
                <Input
                    id="username"
                    name="username"
                    autoComplete="username"
                    autoFocus
                    required
                    className="h-11"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isSubmitting}
                />
            </div>

            <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="h-11"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isSubmitting}
                />
            </div>

            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}

            <Button type="submit" size="lg" disabled={isSubmitting} className="mt-1 w-full">
                {isSubmitting ? <Spinner /> : null}
                {isSubmitting ? "Connexion…" : "Se connecter"}
            </Button>
        </form>
    );
}
