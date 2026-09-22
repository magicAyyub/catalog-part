"use client";

import { useState } from "react";
import { Trash2, Car, Hash, CheckCircle2, AlertCircle, CircleAlertIcon, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
    Frame,
    FrameDescription,
    FrameHeader,
    FramePanel,
    FrameTitle,
} from "@/components/reui/frame";

const CONFIRMATION_KEYWORD = "SUPPRIMER";

export function CachePurgeCard() {
    const [plateQuery, setPlateQuery] = useState("");
    const [refQuery, setRefQuery] = useState("");
    const [confirmText, setConfirmText] = useState("");
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [loadingType, setLoadingType] = useState<"plate" | "reference" | "all" | null>(null);
    const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

    async function handlePurge(type: "plate" | "reference" | "all") {
        const query = type === "plate" ? plateQuery : type === "reference" ? refQuery : "";
        if (type !== "all" && !query.trim()) return;

        setLoadingType(type);
        setFeedback(null);

        try {
            const res = await fetch("/api/admin/cache/purge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type, query }),
            });

            const data = await res.json();
            if (!res.ok) {
                setFeedback({ success: false, message: data.error || "Erreur lors de la purge." });
            } else {
                setFeedback({ success: data.success, message: data.message });
                if (type === "plate") setPlateQuery("");
                if (type === "reference") setRefQuery("");
                if (type === "all") {
                    setIsDialogOpen(false);
                    setConfirmText("");
                }
            }
        } catch {
            setFeedback({ success: false, message: "Impossible de contacter le serveur." });
        } finally {
            setLoadingType(null);
        }
    }

    const isConfirmValid = confirmText.trim().toUpperCase() === CONFIRMATION_KEYWORD;

    return (
        <Frame>
            <FrameHeader>
                <div className="flex items-center gap-2">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-pine/10 text-pine">
                        <Trash2 className="size-5" />
                    </div>
                    <div>
                        <FrameTitle>Gestion & Purge Manuelle du Cache</FrameTitle>
                        <FrameDescription>
                            Videz le cache d&apos;une plaque d&apos;immatriculation ou d&apos;une référence d&apos;article pour forcer une ré-acquisition fraîche.
                        </FrameDescription>
                    </div>
                </div>
            </FrameHeader>

            <FramePanel className="space-y-6">
                {feedback && (
                    <div
                        className={`flex items-start gap-3 rounded-lg border p-3.5 text-sm ${
                            feedback.success
                                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : "border-destructive/20 bg-destructive/10 text-destructive"
                        }`}
                    >
                        {feedback.success ? (
                            <CheckCircle2 className="size-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                            <AlertCircle className="size-5 shrink-0 mt-0.5" />
                        )}
                        <div>{feedback.message}</div>
                    </div>
                )}

                <div className="grid gap-6 md:grid-cols-2">
                    {/* Purge par Plaque */}
                    <div className="space-y-3 rounded-xl border border-stroke bg-card p-4 shadow-xs">
                        <div className="flex items-center gap-2 font-heading font-semibold text-sm text-ink">
                            <Car className="size-4 text-pine" />
                            Purger le cache d&apos;une plaque
                        </div>
                        <p className="text-xs text-txt2">
                            Réinitialise les pièces enregistrées pour ce véhicule. La prochaine saisie ré-acquerra le catalogue complet.
                        </p>
                        <div className="space-y-2">
                            <Label htmlFor="plate-input" className="text-xs">
                                Immatriculation (ex: AA-123-BB)
                            </Label>
                            <div className="flex gap-2">
                                <Input
                                    id="plate-input"
                                    placeholder="ex: AA-123-BB"
                                    value={plateQuery}
                                    onChange={(e) => setPlateQuery(e.target.value)}
                                    className="uppercase font-mono text-sm"
                                />
                                <Button
                                    variant="outline"
                                    disabled={!plateQuery.trim() || loadingType !== null}
                                    onClick={() => handlePurge("plate")}
                                >
                                    {loadingType === "plate" ? <Spinner className="size-4" /> : "Purger"}
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Purge par Référence */}
                    <div className="space-y-3 rounded-xl border border-stroke bg-card p-4 shadow-xs">
                        <div className="flex items-center gap-2 font-heading font-semibold text-sm text-ink">
                            <Hash className="size-4 text-pine" />
                            Purger le cache d&apos;une référence
                        </div>
                        <p className="text-xs text-txt2">
                            Remet à zéro la fiche article et ses cross-références. La prochaine recherche relancera l&apos;acquisition.
                        </p>
                        <div className="space-y-2">
                            <Label htmlFor="ref-input" className="text-xs">
                                Référence article (ex: GDB1386)
                            </Label>
                            <div className="flex gap-2">
                                <Input
                                    id="ref-input"
                                    placeholder="ex: GDB1708"
                                    value={refQuery}
                                    onChange={(e) => setRefQuery(e.target.value)}
                                    className="uppercase font-mono text-sm"
                                />
                                <Button
                                    variant="outline"
                                    disabled={!refQuery.trim() || loadingType !== null}
                                    onClick={() => handlePurge("reference")}
                                >
                                    {loadingType === "reference" ? <Spinner className="size-4" /> : "Purger"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Zone discrète de vidange globale avec AlertDialog sécurisé */}
                <div className="flex items-center justify-between pt-2 border-t border-stroke text-xs text-txt2">
                    <span>Zone d&apos;administration avancée</span>

                    <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <AlertDialogTrigger
                            render={
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                >
                                    <ShieldAlert className="size-3.5 mr-1.5" />
                                    Vidange globale du cache...
                                </Button>
                            }
                        />

                        <AlertDialogContent className="sm:max-w-md">
                            <div className="flex items-start gap-3 py-1">
                                <div className="bg-destructive/10 rounded-full flex size-10 shrink-0 items-center justify-center">
                                    <CircleAlertIcon className="text-destructive size-5" />
                                </div>
                                <div className="flex flex-col justify-center gap-1.5 w-full">
                                    <AlertDialogTitle className="text-sm font-semibold text-ink">
                                        Vider l&apos;intégralité du cache ?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription className="text-txt2 text-xs leading-relaxed">
                                        Cette action supprimera l&apos;ensemble des synchronisations de catalogues et réinitialisera toutes les fiches d&apos;articles en base de données.
                                    </AlertDialogDescription>

                                    <div className="mt-3 space-y-2">
                                        <Label htmlFor="confirm-input" className="text-xs font-medium text-ink">
                                            Tapez <span className="font-bold text-destructive">{CONFIRMATION_KEYWORD}</span> pour confirmer :
                                        </Label>
                                        <Input
                                            id="confirm-input"
                                            placeholder="SUPPRIMER"
                                            value={confirmText}
                                            onChange={(e) => setConfirmText(e.target.value)}
                                            className="uppercase font-mono text-xs"
                                        />
                                    </div>
                                </div>
                            </div>

                            <AlertDialogFooter className="mt-2">
                                <AlertDialogCancel
                                    onClick={() => {
                                        setConfirmText("");
                                        setIsDialogOpen(false);
                                    }}
                                >
                                    Annuler
                                </AlertDialogCancel>
                                <AlertDialogAction
                                    variant="destructive"
                                    disabled={!isConfirmValid || loadingType !== null}
                                    onClick={() => handlePurge("all")}
                                >
                                    {loadingType === "all" ? <Spinner className="size-4" /> : "Réinitialiser tout le cache"}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </FramePanel>
        </Frame>
    );
}
