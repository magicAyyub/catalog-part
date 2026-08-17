"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export function UnlockForm() {
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            const res = await fetch("/api/admin/unlock", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            });

            if (!res.ok) {
                const body = await res.json().catch(() => null);
                setError(body?.error ?? "Ouverture impossible.");
                setPassword("");
                return;
            }

            router.refresh();
        } catch {
            setError("Serveur injoignable.");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="mx-auto flex w-full max-w-sm flex-col gap-4 py-12">
            <div className="text-center">
                <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-muted text-txt2">
                    <Lock className="size-5" />
                </span>
                <h1 className="font-heading text-lg font-bold text-navy">Comptes franchisés</h1>
            </div>

            <form
                onSubmit={handleSubmit}
                className="flex flex-col gap-4 rounded-xl border border-stroke bg-white p-6 shadow-sm"
            >
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="admin-password">Mot de passe d&apos;administration</Label>
                    <Input
                        id="admin-password"
                        type="password"
                        autoComplete="off"
                        autoFocus
                        required
                        className="h-9"
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

                <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
                    {isSubmitting ? <Spinner /> : null}
                    {isSubmitting ? "Ouverture…" : "Ouvrir la gestion des comptes"}
                </Button>
            </form>
        </div>
    );
}
