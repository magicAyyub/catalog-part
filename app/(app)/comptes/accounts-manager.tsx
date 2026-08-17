"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

interface Account {
    id: string;
    username: string;
    displayName: string | null;
    franchise: string | null;
    role: string;
    disabled: boolean;
    lockedUntil: string | null;
    lastLoginAt: string | null;
}

/**
 * Shown once, never again: the password is stored hashed and cannot be read
 * back. Kept in state until the operator dismisses it rather than in a toast
 * that could vanish before it is written down.
 */
interface Handover {
    username: string;
    password: string;
}

function formatDate(value: string | null): string {
    if (!value) return "jamais";
    return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

async function fetchAccounts(): Promise<Account[]> {
    const res = await fetch("/api/admin/users");
    if (!res.ok) throw new Error("Impossible de charger les comptes.");
    return (await res.json()).accounts;
}

export function AccountsManager() {
    const { data: accounts, refetch, isError } = useQuery({
        queryKey: ["admin", "accounts"],
        queryFn: fetchAccounts,
        staleTime: 0,
    });

    const [error, setError] = useState<string | null>(null);
    const [handover, setHandover] = useState<Handover | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [franchise, setFranchise] = useState("");

    const load = refetch;

    async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setBusy("create");

        try {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, displayName, franchise }),
            });
            const body = await res.json().catch(() => null);

            if (!res.ok) {
                setError(body?.error ?? "Création impossible.");
                return;
            }

            setHandover({ username: body.account.username, password: body.generatedPassword });
            setUsername("");
            setDisplayName("");
            setFranchise("");
            await load();
        } finally {
            setBusy(null);
        }
    }

    async function act(account: Account, action: "password" | "disable" | "enable") {
        if (action === "disable" && !confirm(`Révoquer l'accès de ${account.username} ?`)) return;

        setError(null);
        setBusy(`${account.username}:${action}`);

        try {
            const res = await fetch(`/api/admin/users/${encodeURIComponent(account.username)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            const body = await res.json().catch(() => null);

            if (!res.ok) {
                setError(body?.error ?? "Modification impossible.");
                return;
            }

            if (body?.generatedPassword) {
                setHandover({ username: account.username, password: body.generatedPassword });
            }
            await load();
        } finally {
            setBusy(null);
        }
    }

    return (
        <div className="flex flex-col gap-8 py-4">
            <h1 className="font-heading text-xl font-bold text-navy">Comptes franchisés</h1>

            {handover && (
                <div className="flex flex-col gap-2 rounded-xl border border-leaf/40 bg-leaf/5 p-5">
                    <p className="text-sm font-semibold text-navy">
                        Mot de passe de {handover.username}
                    </p>
                    <code className="rounded bg-white px-3 py-2 font-mono text-base text-navy select-all">
                        {handover.password}
                    </code>
                    <p className="text-xs text-txt2">Non récupérable ensuite.</p>
                    <button
                        onClick={() => setHandover(null)}
                        className="self-start text-sm font-medium text-royal hover:text-royal-hover"
                    >
                        J&apos;ai noté
                    </button>
                </div>
            )}

            {(error || isError) && (
                <p role="alert" className="text-sm text-destructive">
                    {error ?? "Impossible de charger les comptes."}
                </p>
            )}

            <form
                onSubmit={handleCreate}
                className="flex flex-col gap-4 rounded-xl border border-stroke bg-white p-6 shadow-sm"
            >
                <h2 className="font-heading text-base font-bold text-navy">Créer un compte</h2>

                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="username">Identifiant</Label>
                        <Input
                            id="username"
                            required
                            placeholder="dupont"
                            className="h-9"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="displayName">Nom affiché</Label>
                        <Input
                            id="displayName"
                            placeholder="Garage Dupont"
                            className="h-9"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="franchise">Franchise</Label>
                        <Input
                            id="franchise"
                            placeholder="Lyon Est"
                            className="h-9"
                            value={franchise}
                            onChange={(e) => setFranchise(e.target.value)}
                        />
                    </div>
                </div>

                <Button type="submit" disabled={busy === "create"} className="self-start">
                    {busy === "create" ? <Spinner /> : null}
                    Créer le compte
                </Button>
            </form>

            <div className="overflow-x-auto rounded-xl border border-stroke bg-white">
                <table className="w-full text-sm">
                    <thead className="border-b border-stroke text-left text-txt2">
                        <tr>
                            <th className="px-4 py-3 font-semibold">Identifiant</th>
                            <th className="px-4 py-3 font-semibold">Franchise</th>
                            <th className="px-4 py-3 font-semibold">État</th>
                            <th className="px-4 py-3 font-semibold">Dernière connexion</th>
                            <th className="px-4 py-3" />
                        </tr>
                    </thead>
                    <tbody>
                        {accounts === undefined && (
                            <tr>
                                <td colSpan={5} className="px-4 py-6 text-center text-txt2">
                                    Chargement…
                                </td>
                            </tr>
                        )}
                        {accounts?.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-4 py-6 text-center text-txt2">
                                    Aucun compte.
                                </td>
                            </tr>
                        )}
                        {accounts?.map((account) => {
                            const locked =
                                account.lockedUntil && new Date(account.lockedUntil) > new Date();
                            return (
                                <tr key={account.id} className="border-b border-stroke/60 last:border-0">
                                    <td className="px-4 py-3">
                                        <div className="font-semibold text-navy">{account.username}</div>
                                        {account.displayName && (
                                            <div className="text-xs text-txt2">{account.displayName}</div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-txt2">{account.franchise ?? "—"}</td>
                                    <td className="px-4 py-3">
                                        {account.disabled ? (
                                            <span className="text-destructive">Révoqué</span>
                                        ) : locked ? (
                                            <span className="text-flame">Bloqué</span>
                                        ) : (
                                            <span className="text-leaf">Actif</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-txt2 tabular-nums">
                                        {formatDate(account.lastLoginAt)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-end gap-3">
                                            <button
                                                onClick={() => act(account, "password")}
                                                disabled={busy !== null}
                                                className="text-sm font-medium text-royal hover:text-royal-hover disabled:opacity-50"
                                            >
                                                Nouveau mot de passe
                                            </button>
                                            <button
                                                onClick={() =>
                                                    act(account, account.disabled ? "enable" : "disable")
                                                }
                                                disabled={busy !== null}
                                                className="text-sm font-medium text-destructive hover:opacity-80 disabled:opacity-50"
                                            >
                                                {account.disabled ? "Réactiver" : "Révoquer"}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
