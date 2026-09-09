"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    ColumnDef,
    PaginationState,
    SortingState,
    useTable,
} from "@tanstack/react-table";
import {
    DataGrid,
    dataGridFeatures,
    type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import {
    Frame,
    FrameDescription,
    FrameHeader,
    FramePanel,
    FrameTitle,
} from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
    Check,
    Copy,
    KeyRound,
    MoreHorizontalIcon,
    SearchIcon,
    Shield,
    UserCheck,
    UserPlusIcon,
    UserX,
    XIcon,
} from "lucide-react";

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

interface Handover {
    username: string;
    password: string;
}

function formatDate(value: string | null): string {
    if (!value) return "Jamais";
    return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

async function fetchAccounts(): Promise<Account[]> {
    const res = await fetch("/api/admin/users");
    if (!res.ok) throw new Error("Impossible de charger les comptes.");
    return (await res.json()).accounts;
}

export function AccountsManager() {
    const { data: accounts = [], refetch, isError, isLoading } = useQuery({
        queryKey: ["admin", "accounts"],
        queryFn: fetchAccounts,
        staleTime: 0,
    });

    const [error, setError] = useState<string | null>(null);
    const [handover, setHandover] = useState<Handover | null>(null);
    const [copied, setCopied] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);

    // Filter & Search states
    const [searchQuery, setSearchQuery] = useState("");
    const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");
    const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");

    // Form state
    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [franchise, setFranchise] = useState("");
    const [role, setRole] = useState<"user" | "admin">("user");

    // Table state
    const [sorting, setSorting] = useState<SortingState>([{ id: "username", desc: false }]);
    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: 10,
    });

    const load = refetch;



    async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setBusy("create");

        try {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, displayName, franchise, role }),
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
            setRole("user");
            await load();
        } finally {
            setBusy(null);
        }
    }

    const act = useCallback(
        async (
            account: Account,
            action: "password" | "disable" | "enable" | "role",
            targetRole?: "user" | "admin"
        ) => {
            if (action === "disable" && !confirm(`Révoquer l'accès du compte ${account.username} ?`)) {
                return;
            }

            setError(null);
            setBusy(`${account.username}:${action}`);

            try {
                const res = await fetch(`/api/admin/users/${encodeURIComponent(account.username)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action, role: targetRole }),
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
        },
        [load]
    );

    const copyPassword = () => {
        if (handover?.password) {
            navigator.clipboard.writeText(handover.password);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    // Filter accounts by search query & filters
    const filteredData = useMemo(() => {
        return accounts.filter((account) => {
            if (roleFilter !== "all" && account.role !== roleFilter) return false;
            if (statusFilter === "active" && account.disabled) return false;
            if (statusFilter === "disabled" && !account.disabled) return false;

            if (!searchQuery.trim()) return true;
            const query = searchQuery.toLowerCase();
            return (
                account.username.toLowerCase().includes(query) ||
                (account.displayName && account.displayName.toLowerCase().includes(query)) ||
                (account.franchise && account.franchise.toLowerCase().includes(query))
            );
        });
    }, [accounts, searchQuery, roleFilter, statusFilter]);

    // DataGrid Column Definitions
    const columns = useMemo<ColumnDef<DataGridFeatures, Account>[]>(
        () => [
            {
                id: "username",
                accessorKey: "username",
                header: ({ column }) => (
                    <DataGridColumnHeader column={column} title="Utilisateur" />
                ),
                cell: ({ row }) => {
                    const acc = row.original;
                    const initials = (acc.displayName || acc.username).slice(0, 2).toUpperCase();
                    return (
                        <div className="flex items-center gap-3 py-1">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pine/10 font-heading text-xs font-bold text-pine">
                                {initials}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="font-semibold text-ink truncate">{acc.username}</span>
                                {acc.displayName && (
                                    <span className="text-xs text-txt2 truncate">{acc.displayName}</span>
                                )}
                            </div>
                        </div>
                    );
                },
                size: 200,
                enableSorting: true,
            },
            {
                id: "franchise",
                accessorKey: "franchise",
                header: ({ column }) => (
                    <DataGridColumnHeader column={column} title="Franchise" />
                ),
                cell: ({ row }) => (
                    <span className="text-sm text-txt2">{row.original.franchise ?? "—"}</span>
                ),
                size: 150,
                enableSorting: true,
            },
            {
                id: "role",
                accessorKey: "role",
                header: ({ column }) => (
                    <DataGridColumnHeader column={column} title="Rôle" />
                ),
                cell: ({ row }) => {
                    const isAdmin = row.original.role === "admin";
                    return isAdmin ? (
                        <span className="inline-flex items-center rounded-full border border-pine/30 bg-pine/10 px-2.5 py-0.5 text-xs font-semibold text-pine">
                            Admin
                        </span>
                    ) : (
                        <span className="inline-flex items-center rounded-full border border-stroke bg-muted px-2.5 py-0.5 text-xs font-medium text-txt2">
                            Utilisateur
                        </span>
                    );
                },
                size: 110,
                enableSorting: true,
            },
            {
                id: "disabled",
                accessorKey: "disabled",
                header: ({ column }) => (
                    <DataGridColumnHeader column={column} title="État" />
                ),
                cell: ({ row }) => {
                    const acc = row.original;
                    const locked = acc.lockedUntil && new Date(acc.lockedUntil) > new Date();
                    if (acc.disabled) {
                        return (
                            <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
                                Révoqué
                            </span>
                        );
                    }
                    if (locked) {
                        return (
                            <span className="inline-flex items-center rounded-full border border-flame/30 bg-flame/10 px-2.5 py-0.5 text-xs font-semibold text-flame">
                                Bloqué
                            </span>
                        );
                    }
                    return (
                        <span className="inline-flex items-center rounded-full border border-leaf/30 bg-leaf/10 px-2.5 py-0.5 text-xs font-semibold text-leaf">
                            Actif
                        </span>
                    );
                },
                size: 100,
                enableSorting: true,
            },
            {
                id: "lastLoginAt",
                accessorKey: "lastLoginAt",
                header: ({ column }) => (
                    <DataGridColumnHeader column={column} title="Dernière connexion" />
                ),
                cell: ({ row }) => (
                    <span className="text-xs text-txt2 tabular-nums">
                        {formatDate(row.original.lastLoginAt)}
                    </span>
                ),
                size: 160,
                enableSorting: true,
            },
            {
                id: "actions",
                header: "",
                cell: ({ row }) => {
                    const acc = row.original;
                    const isAdmin = acc.role === "admin";
                    const isBusy = busy?.startsWith(acc.username);

                    return (
                        <div className="flex justify-end">
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    render={
                                        <Button variant="ghost" size="icon" disabled={isBusy}>
                                            <MoreHorizontalIcon className="size-4 text-txt2" />
                                        </Button>
                                    }
                                />
                                <DropdownMenuContent align="end" className="w-52">
                                    <DropdownMenuItem onClick={() => act(acc, "password")}>
                                        <KeyRound className="size-4 text-pine mr-2" />
                                        Nouveau mot de passe
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => act(acc, "role", isAdmin ? "user" : "admin")}
                                    >
                                        <Shield className="size-4 text-pine mr-2" />
                                        {isAdmin ? "Rétrograder Utilisateur" : "Promouvoir Admin"}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        variant="destructive"
                                        onClick={() => act(acc, acc.disabled ? "enable" : "disable")}
                                    >
                                        {acc.disabled ? (
                                            <>
                                                <UserCheck className="size-4 mr-2" />
                                                Réactiver le compte
                                            </>
                                        ) : (
                                            <>
                                                <UserX className="size-4 mr-2" />
                                                Révoquer l&apos;accès
                                            </>
                                        )}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    );
                },
                size: 60,
                enableSorting: false,
            },
        ],
        [busy, act]
    );

    const table = useTable({
        features: dataGridFeatures,
        columns,
        data: filteredData,
        pageCount: Math.ceil(filteredData.length / pagination.pageSize),
        getRowId: (row: Account) => row.id,
        state: {
            pagination,
            sorting,
        },
        onPaginationChange: setPagination,
        onSortingChange: setSorting,
    });

    return (
        <div className="flex flex-col gap-6 py-4">
            {/* Header section */}
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="font-heading text-2xl font-bold text-ink">Comptes franchisés</h1>
                    <p className="text-sm text-txt2">
                        Gérez les accès, les rôles administrateur et la sécurité des comptes utilisateurs.
                    </p>
                </div>
            </div>



            {/* Handover Alert Box */}
            {handover && (
                <FramePanel className="border-leaf/40 bg-leaf/5 p-5">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-ink">
                                🔑 Mot de passe généré pour le compte <span className="font-bold">{handover.username}</span>
                            </span>
                            <Button variant="ghost" size="xs" onClick={() => setHandover(null)}>
                                <XIcon className="size-4" />
                                Fermer
                            </Button>
                        </div>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 rounded-lg border border-stroke bg-white px-3 py-2 font-mono text-base font-bold text-ink select-all">
                                {handover.password}
                            </code>
                            <Button variant="outline" size="sm" onClick={copyPassword} className="gap-1.5">
                                {copied ? <Check className="size-4 text-leaf" /> : <Copy className="size-4" />}
                                {copied ? "Copié !" : "Copier"}
                            </Button>
                        </div>
                        <p className="text-xs text-txt2">
                            Ce mot de passe est affiché une seule fois. Pensez à le transmettre de façon sécurisée.
                        </p>
                    </div>
                </FramePanel>
            )}

            {/* Error message */}
            {(error || isError) && (
                <p role="alert" className="text-sm text-destructive font-medium">
                    {error ?? "Impossible de charger les comptes."}
                </p>
            )}

            {/* Form Frame: Créer un compte */}
            <Frame>
                <FramePanel className="p-6">
                    <form onSubmit={handleCreate} className="flex flex-col gap-5">
                        <FrameHeader className="p-0">
                            <FrameTitle className="font-heading text-base font-bold text-ink">
                                Créer un nouveau compte
                            </FrameTitle>
                            <FrameDescription className="text-xs text-txt2">
                                Renseignez l&apos;identifiant, le nom affiché et la franchise pour générer un accès.
                            </FrameDescription>
                        </FrameHeader>

                        <div className="grid gap-4 sm:grid-cols-4">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="username" className="text-xs font-semibold text-ink">Identifiant *</Label>
                                <Input
                                    id="username"
                                    required
                                    placeholder="dupont"
                                    className="h-9 text-sm"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="displayName" className="text-xs font-semibold text-ink">Nom affiché</Label>
                                <Input
                                    id="displayName"
                                    placeholder="Garage Dupont"
                                    className="h-9 text-sm"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="franchise" className="text-xs font-semibold text-ink">Franchise</Label>
                                <Input
                                    id="franchise"
                                    placeholder="Lyon Est"
                                    className="h-9 text-sm"
                                    value={franchise}
                                    onChange={(e) => setFranchise(e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="role" className="text-xs font-semibold text-ink">Rôle</Label>
                                <select
                                    id="role"
                                    value={role}
                                    onChange={(e) => setRole(e.target.value as "user" | "admin")}
                                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                >
                                    <option value="user">Utilisateur</option>
                                    <option value="admin">Administrateur</option>
                                </select>
                            </div>
                        </div>

                        <Button type="submit" disabled={busy === "create"} className="self-start gap-2 bg-pine hover:bg-pine/90 text-white font-medium">
                            {busy === "create" ? <Spinner /> : <UserPlusIcon className="size-4" />}
                            Créer le compte
                        </Button>
                    </form>
                </FramePanel>
            </Frame>

            {/* DataGrid Section with Frame */}
            <DataGrid
                table={table}
                recordCount={filteredData.length}
                isLoading={isLoading}
                i18n={{
                    labels: {
                        rowsPerPage: "Lignes par page",
                        paginationInfo: ({ from, to, count }) => `${from} – ${to} sur ${count}`,
                        previousPage: "Page précédente",
                        nextPage: "Page suivante",
                        loading: "Chargement…",
                        empty: "Aucun compte disponible",
                    },
                }}
                tableLayout={{
                    columnsPinnable: false,
                    columnsResizable: false,
                    columnsMovable: true,
                    columnsVisibility: false,
                }}
            >
                <Frame className="w-full">
                    <FramePanel className="p-6 flex flex-col gap-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="font-heading text-base font-bold text-ink">
                                    Liste des comptes <span className="text-txt2 text-sm font-normal">({filteredData.length})</span>
                                </h2>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                                {/* Role filter buttons */}
                                <div className="flex items-center rounded-lg border border-stroke bg-muted/60 p-1 text-xs">
                                    <button
                                        type="button"
                                        onClick={() => setRoleFilter("all")}
                                        className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                                            roleFilter === "all" ? "bg-white text-ink shadow-2xs" : "text-txt2 hover:text-ink"
                                        }`}
                                    >
                                        Tous
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRoleFilter("admin")}
                                        className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                                            roleFilter === "admin" ? "bg-white text-ink shadow-2xs" : "text-txt2 hover:text-ink"
                                        }`}
                                    >
                                        Admins
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRoleFilter("user")}
                                        className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                                            roleFilter === "user" ? "bg-white text-ink shadow-2xs" : "text-txt2 hover:text-ink"
                                        }`}
                                    >
                                        Utilisateurs
                                    </button>
                                </div>

                                {/* Status filter select */}
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "disabled")}
                                    className="h-8 rounded-lg border border-stroke bg-white px-2.5 py-1 text-xs font-medium text-ink shadow-2xs focus-visible:outline-none"
                                >
                                    <option value="all">Tous les états</option>
                                    <option value="active">Actifs seulement</option>
                                    <option value="disabled">Révoqués seulement</option>
                                </select>

                                {/* Search bar */}
                                <InputGroup className="w-56 bg-white shadow-2xs">
                                    <InputGroupAddon align="inline-start">
                                        <SearchIcon className="size-4 text-txt2" />
                                    </InputGroupAddon>

                                    <InputGroupInput
                                        placeholder="Rechercher un compte..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="text-xs"
                                    />

                                    {searchQuery.length > 0 && (
                                        <InputGroupAddon align="inline-end">
                                            <InputGroupButton
                                                aria-label="Effacer la recherche"
                                                size="icon-xs"
                                                onClick={() => setSearchQuery("")}
                                            >
                                                <XIcon className="size-3 text-txt2" />
                                            </InputGroupButton>
                                        </InputGroupAddon>
                                    )}
                                </InputGroup>
                            </div>
                        </div>

                        <DataGridScrollArea className="rounded-lg border border-stroke overflow-hidden">
                            <DataGridTable />
                        </DataGridScrollArea>

                        <div className="pt-1 flex justify-between items-center text-xs text-txt2">
                            <DataGridPagination />
                        </div>
                    </FramePanel>
                </Frame>
            </DataGrid>
        </div>
    );
}
